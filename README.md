# いつでも道場くん

## 開発サーバーの起動

```bash
npm install
cp .env.example .env.local  # 環境変数を設定（下記参照）
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開いて確認。

## 利用可能なコマンド

| コマンド | 説明 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run start` | プロダクションサーバー起動 |
| `npm run lint` | ESLint 実行 |

## RAG（ナレッジ検索）のセットアップ

### 1. Supabase で pgvector を有効化

Supabase Dashboard → **Database → Extensions** で `vector` を有効にする（または SQL エディタで `CREATE EXTENSION IF NOT EXISTS vector;` を実行）。

### 2. マイグレーションを実行

```bash
# supabase CLI を使う場合
supabase db push

# または Supabase Dashboard の SQL エディタで直接実行
# supabase/migrations/001_init.sql → 002_rag.sql の順に実行
```

### 3. ナレッジファイルを追加

```
knowledge/
├── sample.md          ← サンプル（置き換え可）
├── sales_manual.md    ← 社内営業マニュアルなど
└── product_catalog.md ← 製品カタログなど
```

`knowledge/` フォルダに `.md` または `.txt` ファイルを置く。

### 4. インデックスを実行

ログイン済みの状態で以下を実行（`curl` または開発ツールから）:

```bash
# Cookie でセッションを渡す場合
curl -X POST http://localhost:3000/api/knowledge/index \
  -H "Cookie: authjs.session-token=YOUR_SESSION_TOKEN"
```

成功レスポンス例:
```json
{
  "message": "インデックス完了",
  "knowledge_set": "default",
  "files": 2,
  "file_list": ["sample.md", "sales_manual.md"],
  "chunks": 14
}
```

ファイルを更新したら再度 `POST /api/knowledge/index` を呼ぶと再インデックスされる（冪等）。

### 5. 動作確認

チャット画面でメッセージを送ると、関連するナレッジが自動で参照される。
返答の末尾に参照ソースが表示される:

```
…（AI の返答）…

---
参照：sample.md#chunk0, sales_manual.md#chunk2
```

RAG チャンクが0件の場合（ナレッジ未登録・類似なし）はソース行は表示されず、
AI は通常通り仮説ベースで回答する。

---

## Google OAuth の設定

### 1. Google Cloud Console でクライアント ID を作成

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuth 2.0 クライアント ID」
3. アプリケーションの種類: **ウェブアプリケーション**
4. 承認済みのリダイレクト URI に追加:
   - `http://localhost:3000/api/auth/callback/google`（開発用）
   - `https://your-domain.com/api/auth/callback/google`（本番用）
5. クライアント ID とシークレットをコピー

### 2. 環境変数を設定

```bash
cp .env.example .env.local
```

`.env.local` に実際の値を記入。`NEXTAUTH_SECRET` は下記で生成:

```bash
openssl rand -base64 32
```

> **重要**: `.env.local` には本物の認証情報が入ります。`.gitignore` で除外済みですが、**絶対に GitHub にコミットしないでください。**

管理画面 `/admin` へのアクセスは `ADMIN_ALLOW_EMAILS`（カンマ区切りのメールアドレスリスト）で制御します。
