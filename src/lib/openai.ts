import OpenAI from "openai";

/** チャット用モデル。環境変数 OPENAI_CHAT_MODEL で上書き可能。 */
export function getChatModel(): string {
  return process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
}

// ビルド時に OPENAI_API_KEY が未設定でもクラッシュしないよう遅延初期化
let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
