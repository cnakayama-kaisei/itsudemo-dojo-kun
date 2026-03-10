import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { embedTexts, toVectorLiteral, EMBED_MODEL } from "@/lib/embedding";

// ============================================================
// 設定
// ============================================================

/** knowledge/ フォルダの絶対パス */
const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

/** チャンクの目標文字数 */
const CHUNK_TARGET = 1000;

/** 前のチャンクとのオーバーラップ文字数 */
const CHUNK_OVERLAP = 100;

/** OpenAI Embeddings API への1リクエストあたりのチャンク数 */
const EMBED_BATCH_SIZE = 20;

/**
 * ナレッジセット定義。
 *   core   : 型・原理原則など本体となる知識
 *   ads    : 広告/まさか/エージェント誤認系の知識
 *   recent : 直近FB・補足・更新情報
 *
 * 各セットは knowledge/<setName>/ フォルダに .md / .txt を置く。
 * フォルダが空 or 存在しない場合は 0件としてスキップ（エラーにしない）。
 */
const KNOWLEDGE_SETS = ["core", "ads", "recent"] as const;
type KnowledgeSetName = (typeof KNOWLEDGE_SETS)[number];

// ============================================================
// テキスト分割
// ============================================================

/**
 * テキストを段落単位でまとめ、CHUNK_TARGET 文字前後のチャンクに分割する。
 * 前チャンクの末尾 CHUNK_OVERLAP 文字分をオーバーラップとして引き継ぐ。
 */
function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length > CHUNK_TARGET && current.length > 0) {
      chunks.push(current.trim());
      const overlap = current.slice(-CHUNK_OVERLAP);
      current = `${overlap}\n\n${para}`;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

// ============================================================
// セット単位のインデックス処理
// ============================================================

type SetResult = {
  files: string[];
  chunks: number;
};

/**
 * 指定セットを再インデックスする（冪等）。
 * 処理順: knowledge_sets upsert → 既存チャンク全削除 → ファイル読込 → chunk → embed → insert
 */
async function indexSet(
  db: ReturnType<typeof getSupabaseAdmin>,
  setName: KnowledgeSetName,
): Promise<SetResult> {
  // ① knowledge_sets に setName を upsert
  const { data: ks, error: ksError } = await db
    .from("knowledge_sets")
    .upsert({ name: setName, is_active: true }, { onConflict: "name" })
    .select("id")
    .single();

  if (ksError || !ks) {
    throw new Error(`knowledge_sets upsert 失敗 (${setName}): ${ksError?.message}`);
  }

  // ② 既存チャンクを全削除（このセットだけ）
  const { error: deleteError } = await db
    .from("knowledge_chunks")
    .delete()
    .eq("knowledge_set_id", ks.id);

  if (deleteError) {
    throw new Error(`チャンク削除失敗 (${setName}): ${deleteError.message}`);
  }

  // ③ knowledge/<setName>/ の .md / .txt を列挙
  const setDir = path.join(KNOWLEDGE_DIR, setName);
  let files: string[];
  try {
    const entries = await fs.readdir(setDir);
    files = entries
      .filter((f) => /\.(md|txt)$/i.test(f))
      .sort();
  } catch {
    // ディレクトリが存在しない or 空 → スキップ（エラーにしない）
    return { files: [], chunks: 0 };
  }

  if (files.length === 0) {
    return { files: [], chunks: 0 };
  }

  // ④ 全ファイルをチャンクに分解
  const allChunks: { source: string; chunk_index: number; content: string }[] = [];
  for (const file of files) {
    const text = await fs.readFile(path.join(setDir, file), "utf-8");
    const chunks = chunkText(text);
    chunks.forEach((content, i) => {
      allChunks.push({ source: file, chunk_index: i, content });
    });
  }

  // ⑤ バッチ embedding
  type ChunkRow = {
    knowledge_set_id: string;
    source: string;
    chunk_index: number;
    content: string;
    embedding: string;
  };
  const rows: ChunkRow[] = [];

  for (let i = 0; i < allChunks.length; i += EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + EMBED_BATCH_SIZE);
    const embeddings = await embedTexts(batch.map((c) => c.content));
    batch.forEach((chunk, j) => {
      rows.push({
        knowledge_set_id: ks.id,
        source: chunk.source,
        chunk_index: chunk.chunk_index,
        content: chunk.content,
        embedding: toVectorLiteral(embeddings[j]),
      });
    });
  }

  // ⑥ DB に一括 insert
  if (rows.length > 0) {
    const { error: insertError } = await db
      .from("knowledge_chunks")
      .insert(rows);
    if (insertError) {
      throw new Error(`DB insert 失敗 (${setName}): ${insertError.message}`);
    }
  }

  return { files, chunks: rows.length };
}

// ============================================================
// POST /api/knowledge/index
// ============================================================

/**
 * knowledge/core, knowledge/ads, knowledge/recent を順次インデックスする。
 * 各セットは冪等（既存チャンク削除 → 再 insert）。
 * 認証: ログイン済みユーザーのみ（本番環境では admin ロール制限を推奨）。
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();
    console.log(`[/api/knowledge/index] embed_model=${EMBED_MODEL}`);

    const sets: Record<string, SetResult & { file_list: string[] }> = {};

    for (const setName of KNOWLEDGE_SETS) {
      const result = await indexSet(db, setName);
      sets[setName] = { ...result, file_list: result.files };
      console.log(
        `[/api/knowledge/index] ${setName}: ${result.files.length} files, ${result.chunks} chunks`,
      );
    }

    const total_files = Object.values(sets).reduce((s, r) => s + r.files.length, 0);
    const total_chunks = Object.values(sets).reduce((s, r) => s + r.chunks, 0);

    return NextResponse.json({
      message: "インデックス完了",
      sets,
      total_files,
      total_chunks,
    });
  } catch (error) {
    console.error("[POST /api/knowledge/index]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
