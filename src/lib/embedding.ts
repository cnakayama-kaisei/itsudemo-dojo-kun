import { getOpenAI } from "./openai";

/** embedding モデル名。固定（変更する場合はベクトル次元数 1536 との整合に注意）。 */
export const EMBED_MODEL = "text-embedding-3-small";

/**
 * テキスト1件の embedding ベクトル（number[]）を返す。
 * OpenAI は改行をスペースに変換することを推奨している。
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: text.replace(/\n/g, " "),
  });
  return res.data[0].embedding;
}

/**
 * テキスト複数件をバッチで embed する（API 呼び出し回数を削減）。
 * texts は空配列でも可（空配列を返す）。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getOpenAI().embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.replace(/\n/g, " ")),
  });
  // API は入力順を保証している
  return res.data.map((d) => d.embedding);
}

/** number[] を Postgres vector リテラル文字列に変換する */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
