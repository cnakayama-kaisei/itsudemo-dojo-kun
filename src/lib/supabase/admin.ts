import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバー専用 Supabase クライアント（Service Role Key 使用）
 *
 * ⚠️  SUPABASE_SECRET_KEY は RLS を完全にバイパスする。
 *     Server Components / Server Actions / Route Handlers のみでインポートすること。
 *     "use client" コンポーネントや next.config の publicRuntimeConfig には絶対に渡さない。
 *
 * モジュール読み込み時ではなく初回呼び出し時にインスタンスを生成する（遅延初期化）。
 * これにより Next.js のビルド時に環境変数が未設定でもエラーにならない。
 */
let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;

  _client = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        // サーバー側では自動トークン更新・セッション永続化は不要
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  return _client;
}
