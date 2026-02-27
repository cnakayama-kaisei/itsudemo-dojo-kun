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
| `/app` | `src/app/app/page.tsx` | 認証必須ページ（サインアウトボタン付き） |

### 必要な環境変数

`.env.example` を参照。`.env.local` にコピーして値を設定する。

| 変数 | 説明 |
|---|---|
| `NEXTAUTH_URL` | アプリの URL（開発: `http://localhost:3000`） |
| `NEXTAUTH_SECRET` | セッション署名用シークレット |
| `GOOGLE_CLIENT_ID` | Google OAuth クライアント ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth クライアントシークレット |
