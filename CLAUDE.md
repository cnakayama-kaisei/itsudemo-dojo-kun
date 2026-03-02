# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**いつでも道場くん** — Next.js 15 (App Router) + TypeScript + Tailwind CSS + NextAuth v5 (Auth.js)

## Commands

```bash
npm run dev      # 開発サーバー起動 (http://localhost:3000)
npm run build    # プロダクションビルド
npm run lint     # ESLint 実行
```

## Architecture

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v3
- **Auth**: NextAuth v5 (Auth.js beta) — Google OAuth
- **Directory**: `src/app/` — App Router のルートはここに置く
- **Import alias**: `@/*` → `src/*`

### Auth フロー

- `src/auth.ts` — NextAuth 設定（Google プロバイダ・`authorized` callback）
- `middleware.ts` — `/app/**` と `/admin/**` を保護。未ログインは `/login` へリダイレクト
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth ハンドラ
- signIn / signOut は **Server Actions** として実装（Client Component 不要）

### ルート構成

| ルート | ファイル | 説明 |
|---|---|---|
| `/` | `src/app/page.tsx` | トップページ |
| `/login` | `src/app/login/page.tsx` | Google サインインページ |
| `/app` | `src/app/app/page.tsx` | 会話スレッド一覧（認証必須） |
| `/app/[conversationId]` | `src/app/app/[conversationId]/page.tsx` | チャット画面（認証必須） |

### OpenAI 連携

- `src/app/api/chat/route.ts` — `POST /api/chat` Route Handler
  - 処理順: 所有権確認 → user msg 保存 → 直近20件取得 → OpenAI 呼び出し → assistant msg 保存 → updated_at 更新 → analytics
  - モデル: `gpt-4o-mini`（`OPENAI_API_KEY` 使用、サーバー側専用）
  - OpenAI クライアントも遅延初期化（lazy singleton）
- `ChatInput` は `fetch("/api/chat", ...)` + `router.refresh()` パターン（`sendMessage` Server Action は削除済み）

### チャット機能

- `src/app/app/actions.ts` — Server Actions（`"use server"`）
  - `createConversation(formData)`: 新規スレッド作成 → `/app/[id]` にリダイレクト
  - `sendMessage(conversationId, content)`: user + ダミー assistant メッセージを一括 insert。`revalidatePath` で再描画
- `_components/NewConversationForm.tsx` — 新規スレッド作成モーダル（Client Component）
- `[conversationId]/_components/ChatInput.tsx` — メッセージ入力（Client Component, `useTransition` + `router.refresh()`）
- `[conversationId]/_components/ScrollAnchor.tsx` — 最新メッセージへの自動スクロール（Client Component）
- `/app` でのページロード時に users テーブルへ upsert（初回ログイン対応）

### Supabase 接続

- `src/lib/supabase/admin.ts` — サーバー専用クライアント（`getSupabaseAdmin()` 関数）
  - `SUPABASE_SECRET_KEY`（service role）を使用。クライアントサイドに絶対に渡さない
  - **遅延初期化**（lazy singleton）: module load 時ではなく初回呼び出し時にインスタンス生成（ビルド時の env 未設定エラー回避）
- `SUPABASE_ANON_KEY` はクライアントサイド用（将来の実装用）

### DB スキーマ（Supabase / Postgres）

マイグレーション: `supabase/migrations/20260227000000_initial_schema.sql`

| テーブル | 主なカラム | 備考 |
|---|---|---|
| `users` | id, email, name, image, role(member/manager/admin) | NextAuth と連携 |
| `conversations` | id, user_id, title, category, updated_at | updated_at は trigger 自動更新 |
| `messages` | id, conversation_id, role(user/assistant), content | |
| `shares` | id, share_id(unique text slug), conversation_id, visibility(all/managers/specific), expires_at | |
| `analytics_events` | id, user_id, event_type, meta(jsonb), created_at | |

RLS は MVP では OFF。各テーブルのコメントにポリシー案を記載済み。

### 必要な環境変数

`.env.example` を参照。`.env.local` にコピーして値を設定する。

| 変数 | 説明 |
|---|---|
| `NEXTAUTH_URL` | アプリの URL（開発: `http://localhost:3000`） |
| `NEXTAUTH_SECRET` | セッション署名用シークレット |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット |
