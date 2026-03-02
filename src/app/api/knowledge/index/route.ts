import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { embedTexts, toVectorLiteral, EMBED_MODEL } from "@/lib/embedding";

// ============================================================
// 設定
// ============================================================

/** knowledge/ フォルダの絶対パス（開発・本番共通） */
const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

/** チャンクの目標文字数 */
const CHUNK_TARGET = 1000;

/** 前のチャンクとのオーバーラップ文字数 */
const CHUNK_OVERLAP = 100;

/** OpenAI Embeddings API への1リクエストあたりのチャンク数 */
const EMBED_BATCH_SIZE = 20;

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
      // 現在のバッファをチャンクとして確定
      chunks.push(current.trim());

      // オーバーラップ: 末尾 CHUNK_OVERLAP 文字を次チャンクの先頭に引き継ぐ
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
// POST /api/knowledge/index
// ============================================================

/**
 * knowledge/ 内の .md / .txt を読み込み、チャンク分割→embedding→DB insert する。
 * 実行のたびに既存チャンクを全削除して再インデックスする（冪等）。
 *
 * 認証: ログイン済みユーザーのみ（本番では admin ロールに制限推奨）
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getSupabaseAdmin();

    // ① knowledge_sets に name='default' を upsert
    const { data: ks, error: ksError } = await db
      .from("knowledge_sets")
      .upsert({ name: "default", is_active: true }, { onConflict: "name" })
      .select("id")
      .single();

    if (ksError || !ks) {
      throw new Error(`knowledge_sets upsert 失敗: ${ksError?.message}`);
    }

    console.log(`[/api/knowledge/index] embed_model=${EMBED_MODEL}`);

    // ② 既存チャンクを全削除（再インデックスで常に最新を保つ）
    const { error: deleteError } = await db
      .from("knowledge_chunks")
      .delete()
      .eq("knowledge_set_id", ks.id);

    if (deleteError) {
      throw new Error(`既存チャンク削除失敗: ${deleteError.message}`);
    }

    // ③ knowledge/ 内の .md / .txt を列挙
    let files: string[];
    try {
      const entries = await fs.readdir(KNOWLEDGE_DIR);
      files = entries.filter((f) => /\.(md|txt)$/i.test(f)).sort();
    } catch {
      return NextResponse.json(
        { error: `knowledge/ フォルダが見つかりません: ${KNOWLEDGE_DIR}` },
        { status: 400 },
      );
    }

    if (files.length === 0) {
      return NextResponse.json({
        message: "knowledge/ に .md/.txt ファイルがありません",
        indexed: 0,
      });
    }

    // ④ 全ファイルをチャンクに分解
    const allChunks: { source: string; chunk_index: number; content: string }[] =
      [];

    for (const file of files) {
      const text = await fs.readFile(path.join(KNOWLEDGE_DIR, file), "utf-8");
      const chunks = chunkText(text);
      chunks.forEach((content, i) => {
        allChunks.push({ source: file, chunk_index: i, content });
      });
    }

    // ⑤ バッチ embedding（OpenAI API 呼び出しを最小化）
    type ChunkRow = {
      knowledge_set_id: string;
      source: string;
      chunk_index: number;
      content: string;
      embedding: string; // vector リテラル "[x,y,...]"
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
    const { error: insertError } = await db
      .from("knowledge_chunks")
      .insert(rows);

    if (insertError) {
      throw new Error(`DB insert 失敗: ${insertError.message}`);
    }

    return NextResponse.json({
      message: "インデックス完了",
      knowledge_set: "default",
      files: files.length,
      file_list: files,
      chunks: rows.length,
    });
  } catch (error) {
    console.error("[POST /api/knowledge/index]", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
