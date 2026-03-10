import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getOpenAI, getChatModel } from "@/lib/openai";
import { embedText, toVectorLiteral, EMBED_MODEL } from "@/lib/embedding";

// ============================================================
// System Prompt
// ============================================================
const SYSTEM_PROMPT = `あなたは「いつでも道場くん」。営業の商談相談に短く実践的に答える。

出力は必ず以下の順番：
1) 結論（1〜2行）
2) 次の一言候補（3〜5個、コピペできる短文）
3) NG（言ってはいけない例と理由。最大2個。各NG例は15文字以内。NGに肯定文・褒め言葉を混ぜない。）
4) 理由（短く）

## 参考資料の使い方（資料が提供された場合）
- 質問に直接関係する部分だけを使う。関係が薄い資料は無視してよい。
- 複数資料が矛盾する場合は共通部分のみ採用し、「資料内で見解が分かれる」と一言だけ注記する。
- 資料の文章をそのままコピーせず、要約して使う。
- 回答本文に「参照:」「出典:」「chunk」等のソース情報を書かないこと（システムが別途表示する）。
- 資料に記載のない内容は「資料外なので仮説」と明記し、断定しない。

## 出力制約
- 冗長な前置き・締めの挨拶は不要。
- 文章は全体的に短く簡潔に書く。`;

// ============================================================
// Emotion parsing
// ============================================================

const VALID_EMOTIONS = [
  "surprise", "thinking", "sad", "happy",
  "analysis", "intensity", "celebration", "cool",
] as const;
type Emotion = (typeof VALID_EMOTIONS)[number];

function parseEmotion(content: string): Emotion {
  const match = content.match(/^\[emotion:(\w+)\]\s*/);
  if (match) {
    const tag = match[1];
    return (VALID_EMOTIONS as readonly string[]).includes(tag)
      ? (tag as Emotion)
      : "happy";
  }
  return "happy";
}

// ============================================================
// RAG 設定
// ============================================================

/** 最終的に LLM に渡すチャンク上限 */
const RAG_TOP_K = 4;

/** primary set（ads or core）から取得する件数 */
const PRIMARY_K = 3;

/** secondary set（recent）から取得する件数 */
const SECONDARY_K = 1;

/**
 * 類似度しきい値。この値未満のチャンクは品質が低いとして捨てる。
 * 0〜1 の範囲。高いほど厳格。0.78 は実運用でのデフォルト推奨値。
 */
const SIMILARITY_THRESHOLD = 0.78;

type KnowledgeChunk = {
  id: string;
  source: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

// ============================================================
// Intent ルーティング
// ============================================================

/**
 * 広告・まさか・エージェント誤認系に関係するキーワード。
 * これらが含まれる場合は ads セットを優先して検索する。
 */
const ADS_KEYWORDS = [
  "広告", "まさか", "エージェント", "LP", "釣り", "CM",
  "メディア", "バナー", "リスティング", "認知", "インプレッション",
  "クリック", "コンバージョン", "リード", "マーケティング",
];

function detectPrimarySet(message: string): "ads" | "core" {
  return ADS_KEYWORDS.some((kw) => message.includes(kw)) ? "ads" : "core";
}

// ============================================================
// POST /api/chat
// Body:     { conversationId: string, message: string }
// Response: { text: string, citations: string[], emotion: string }
// ============================================================
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const chatModel = getChatModel();
    console.log(`[/api/chat] chat_model=${chatModel} embed_model=${EMBED_MODEL}`);

    const body = await request.json();
    const conversationId: string = body.conversationId;
    const message: string = body.message?.trim();

    if (!conversationId || !message) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    // email → users.id
    const { data: user } = await db
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 会話の所有権確認
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .single();

    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // 1) user メッセージを先に保存
    const { error: insertError } = await db.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });
    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    // 2) RAG: intent ルーティング → 2セット並列検索 → 合算・しきい値フィルタ
    //    エラー時はチャットを止めず、コンテキストなしで続行（Graceful degradation）
    let knowledgeChunks: KnowledgeChunk[] = [];
    const primarySet = detectPrimarySet(message);
    const secondarySet = "recent" as const;

    try {
      const queryEmbedding = await embedText(message);
      const vectorLiteral = toVectorLiteral(queryEmbedding);

      // primary + secondary を並列で取得
      const [primaryRes, secondaryRes] = await Promise.all([
        db.rpc("match_knowledge_chunks", {
          query_embedding: vectorLiteral,
          set_name: primarySet,
          match_count: PRIMARY_K,
        }),
        db.rpc("match_knowledge_chunks", {
          query_embedding: vectorLiteral,
          set_name: secondarySet,
          match_count: SECONDARY_K,
        }),
      ]);

      // 合算・重複排除（source#chunk_index をキーとする）
      const seen = new Set<string>();
      const merged: KnowledgeChunk[] = [];
      for (const chunk of [
        ...((primaryRes.data ?? []) as KnowledgeChunk[]),
        ...((secondaryRes.data ?? []) as KnowledgeChunk[]),
      ]) {
        const key = `${chunk.source}#${chunk.chunk_index}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(chunk);
        }
      }

      // 類似度しきい値フィルタ → 上限 RAG_TOP_K 件に絞る
      knowledgeChunks = merged
        .filter((c) => c.similarity >= SIMILARITY_THRESHOLD)
        .slice(0, RAG_TOP_K);

      console.log(
        `[/api/chat] RAG primary=${primarySet} chunks=${knowledgeChunks.length}` +
        ` (before filter=${merged.length}, threshold=${SIMILARITY_THRESHOLD})`,
      );
    } catch (ragError) {
      console.warn("[/api/chat] RAG 検索をスキップ:", ragError);
    }

    // 3) 直近 20 件を取得
    const { data: history } = await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const contextMessages = (history ?? []).reverse();

    // 4) ナレッジコンテキストを system メッセージに付与
    let systemWithContext = SYSTEM_PROMPT;
    if (knowledgeChunks.length > 0) {
      const ragContext = knowledgeChunks
        .map((c) => `【${c.source}#chunk${c.chunk_index}】\n${c.content}`)
        .join("\n\n---\n\n");

      systemWithContext =
        SYSTEM_PROMPT +
        "\n\n## 参考資料（社内ナレッジより自動取得）\n\n" +
        ragContext;
    }

    // 5) OpenAI API 呼び出し
    const completion = await getOpenAI().chat.completions.create({
      model: chatModel,
      messages: [
        { role: "system", content: systemWithContext },
        ...contextMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    const aiText =
      completion.choices[0]?.message?.content ?? "（返答を生成できませんでした）";

    // 6) citations リスト（APIレスポンス用。DBには保存しない）
    const citations: string[] = knowledgeChunks.map(
      (c) => `${c.source}#chunk${c.chunk_index}`,
    );

    // 7) assistant メッセージを「本文のみ」で保存
    await db.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: aiText,
    });

    // 8) conversations.updated_at を更新
    await db
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    // 9) analytics
    await db.from("analytics_events").insert({
      user_id: user.id,
      event_type: "send_message",
      meta: {
        conversation_id: conversationId,
        rag_chunks_used: knowledgeChunks.length,
        rag_primary_set: primarySet,
        rag_routed_to_ads: primarySet === "ads",
      },
    });

    // 10) レスポンス
    return NextResponse.json({
      text: aiText,
      citations,
      emotion: parseEmotion(aiText),
    });
  } catch (error) {
    console.error("[POST /api/chat]", error);
    return NextResponse.json(
      { error: "AI 返答の生成に失敗しました" },
      { status: 500 },
    );
  }
}
