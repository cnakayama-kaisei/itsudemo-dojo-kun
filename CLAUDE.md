# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**いつでも道場くん** — Next.js (App Router) + TypeScript + Tailwind CSS

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
- **Directory**: `src/app/` — App Router のルートはここに置く
- **Import alias**: `@/*` → `src/*`

### Key files

| ファイル | 役割 |
|---|---|
| `src/app/layout.tsx` | ルートレイアウト（全ページ共通） |
| `src/app/page.tsx` | トップページ (`/`) |
| `src/app/globals.css` | グローバルCSS（Tailwind ディレクティブ） |
| `next.config.ts` | Next.js 設定 |
| `tailwind.config.ts` | Tailwind コンテンツパス等の設定 |
