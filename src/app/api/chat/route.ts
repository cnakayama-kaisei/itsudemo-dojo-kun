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
3) NG（言ってはいけない例と理由を1〜2個）
4) 理由（短く）
参考資料が提供された場合はそれを優先して活用すること。資料に記載のない内容は「資料外なので仮説」と明記して断定しない。`;

// ============================================================
// Emotion parsing（ChatPanel の parseAssistantContent と同じロジック）
// ============================================================

const VALID_EMOTIONS = [
  "surprise",
  "thinking",
  "sad",
  "happy",
  "analysis",
  "intensity",
  "celebration",
  "cool",
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

const RAG_TOP_K = 6;

type KnowledgeChunk = {
  id: string;
  source: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

// ============================================================
// POST /api/chat
// Body:     { conversationId: string, message: string }
// Response: { text: string, citations: string[], emotion: string }
// ============================================================
export async function POST(request: NextRequest) {
  try {
    // 認証確認（/api/chat は middleware の matcher 外なので自前でチェック）
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log(
      `[/api/chat] chat_model=${getChatModel()} embed_model=${EMBED_MODEL}`,
    );

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
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    // 1) user メッセージを先に保存
    const { error: insertError } = await db.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });
    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    // 2) RAG: ユーザーメッセージを embed → 類似チャンクを取得
    //    エラー時はチャットを止めず、コンテキストなしで続行する（Graceful degradation）
    let knowledgeChunks: KnowledgeChunk[] = [];
    try {
      const queryEmbedding = await embedText(message);
      const { data: ragData } = await db.rpc("match_knowledge_chunks", {
        query_embedding: toVectorLiteral(queryEmbedding),
        set_name: "default",
        match_count: RAG_TOP_K,
      });
      if (ragData && ragData.length > 0) {
        knowledgeChunks = ragData as KnowledgeChunk[];
      }
    } catch (ragError) {
      console.warn("[/api/chat] RAG 検索をスキップ:", ragError);
    }

    // 3) 直近 20 件を取得（今保存した user メッセージも含まれる）
    const { data: history } = await db
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const contextMessages = (history ?? []).reverse();

    // 4) ナレッジコンテキストを system メッセージとして組み立てる
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
      model: getChatModel(),
      messages: [
        { role: "system", content: systemWithContext },
        ...contextMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
      ],
    });

    const aiText =
      completion.choices[0]?.message?.content ??
      "（返答を生成できませんでした）";

    // 6) citations リストを構築（APIレスポンス用。DBには保存しない）
    const citations: string[] = knowledgeChunks.map(
      (c) => `${c.source}#chunk${c.chunk_index}`,
    );

    // 7) assistant メッセージを「本文のみ」で保存（参照列挙は付けない）
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
      },
    });

    // 10) レスポンス: { text, citations, emotion }
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
