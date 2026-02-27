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
