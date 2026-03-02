-- =============================================================
-- 001_init.sql
-- Initial schema for いつでも道場くん
-- =============================================================


-- -------------------------------------------------------------
-- ENUM
-- -------------------------------------------------------------

CREATE TYPE user_role        AS ENUM ('member', 'manager', 'admin');
CREATE TYPE message_role     AS ENUM ('user', 'assistant');
CREATE TYPE share_visibility AS ENUM ('all', 'managers', 'specific');


-- -------------------------------------------------------------
-- updated_at 自動更新トリガー関数
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- -------------------------------------------------------------
-- TABLE: users
-- -------------------------------------------------------------

CREATE TABLE users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  name       TEXT,
  image      TEXT,
  role       user_role   NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS（MVP では無効）
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "自分自身のみ参照" ON users
--   FOR SELECT USING (auth.uid() = id);
-- CREATE POLICY "admin は全件参照" ON users
--   FOR SELECT USING (
--     (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
--   );


-- -------------------------------------------------------------
-- TABLE: conversations
-- -------------------------------------------------------------

CREATE TABLE conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  category   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER conversations_set_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS（MVP では無効）
-- ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "自分の会話のみ操作可" ON conversations
--   FOR ALL USING (auth.uid() = user_id);
-- CREATE POLICY "manager/admin は全件参照" ON conversations
--   FOR SELECT USING (
--     (SELECT role FROM users WHERE id = auth.uid()) IN ('manager', 'admin')
--   );


-- -------------------------------------------------------------
-- TABLE: messages
-- -------------------------------------------------------------

CREATE TABLE messages (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID         NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            message_role NOT NULL,
  content         TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- RLS（MVP では無効）
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "自分の会話のメッセージのみ参照" ON messages
--   FOR SELECT USING (
--     EXISTS (
--       SELECT 1 FROM conversations
--       WHERE id = messages.conversation_id AND user_id = auth.uid()
--     )
--   );


-- -------------------------------------------------------------
-- TABLE: shares
-- -------------------------------------------------------------

CREATE TABLE shares (
  id              UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id        TEXT             UNIQUE NOT NULL,
  conversation_id UUID             NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_by      UUID             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visibility      share_visibility NOT NULL DEFAULT 'all',
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ      -- NULL = 期限なし
);

-- RLS（MVP では無効）
-- ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "作成者のみ管理可" ON shares
--   FOR ALL USING (auth.uid() = created_by);
-- CREATE POLICY "visibility=all は全員参照可" ON shares
--   FOR SELECT USING (
--     visibility = 'all'
--     AND (expires_at IS NULL OR expires_at > NOW())
--   );
-- CREATE POLICY "visibility=managers は manager/admin のみ参照可" ON shares
--   FOR SELECT USING (
--     visibility = 'managers'
--     AND (expires_at IS NULL OR expires_at > NOW())
--     AND (SELECT role FROM users WHERE id = auth.uid()) IN ('manager', 'admin')
--   );


-- -------------------------------------------------------------
-- TABLE: analytics_events
-- user_id は ON DELETE SET NULL（退会後もイベント履歴を保持）
-- -------------------------------------------------------------

CREATE TABLE analytics_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT        NOT NULL,
  meta       JSONB       NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS（MVP では無効）
-- ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin のみ全件参照" ON analytics_events
--   FOR SELECT USING (
--     (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
--   );
-- CREATE POLICY "自分のイベントのみ書き込み可" ON analytics_events
--   FOR INSERT WITH CHECK (auth.uid() = user_id);


-- -------------------------------------------------------------
-- INDEX
-- -------------------------------------------------------------

-- users.email は UNIQUE 制約により自動でユニークインデックスが作成される。
-- クエリプランナーへの明示・可読性のために定義を残す（実行は冪等）。
CREATE INDEX IF NOT EXISTS idx_users_email
  ON users (email);

-- conversations
CREATE INDEX idx_conversations_user_id    ON conversations (user_id);
CREATE INDEX idx_conversations_created_at ON conversations (created_at DESC);

-- messages
CREATE INDEX idx_messages_conversation_id ON messages (conversation_id);
CREATE INDEX idx_messages_created_at      ON messages (created_at DESC);

-- shares.share_id は UNIQUE 制約で自動インデックス済み。
CREATE INDEX IF NOT EXISTS idx_shares_share_id
  ON shares (share_id);

-- analytics_events
CREATE INDEX idx_analytics_events_user_id    ON analytics_events (user_id);
CREATE INDEX idx_analytics_events_created_at ON analytics_events (created_at DESC);
