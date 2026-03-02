-- =============================================================
-- 002_rag.sql
-- RAG（Retrieval-Augmented Generation）用テーブル＋関数
-- 前提: Supabase pgvector 拡張が利用可能なこと
-- =============================================================


-- pgvector 拡張（すでに有効な場合はスキップ）
CREATE EXTENSION IF NOT EXISTS vector;


-- -------------------------------------------------------------
-- TABLE: knowledge_sets
-- ナレッジのグループ（例: default, 商品カタログ, 営業マニュアル）
-- 将来的に複数セットを切り替えられるよう分離して管理する。
-- -------------------------------------------------------------

CREATE TABLE knowledge_sets (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        UNIQUE NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS（MVP では無効）
-- ALTER TABLE knowledge_sets ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin のみ管理可" ON knowledge_sets
--   FOR ALL USING (
--     (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
--   );


-- -------------------------------------------------------------
-- TABLE: knowledge_chunks
-- テキストを分割したチャンク + embedding ベクトル
-- -------------------------------------------------------------

CREATE TABLE knowledge_chunks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_set_id UUID        NOT NULL REFERENCES knowledge_sets(id) ON DELETE CASCADE,
  source           TEXT        NOT NULL,    -- ファイル名（例: sales_manual.md）
  chunk_index      INTEGER     NOT NULL,    -- ファイル内の順番（0-indexed）
  content          TEXT        NOT NULL,
  embedding        vector(1536),            -- text-embedding-3-small の次元数
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW インデックス（コサイン類似度）
-- ivfflat と異なり事前学習が不要で、小〜中規模に適する。
CREATE INDEX knowledge_chunks_embedding_idx
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);

-- knowledge_set_id でのフィルタ
CREATE INDEX idx_knowledge_chunks_set_id
  ON knowledge_chunks (knowledge_set_id);

-- ファイル単位での削除・参照
CREATE INDEX idx_knowledge_chunks_source
  ON knowledge_chunks (knowledge_set_id, source);

-- RLS（MVP では無効）
-- ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "admin のみ管理可" ON knowledge_chunks
--   FOR ALL USING (
--     (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
--   );


-- -------------------------------------------------------------
-- FUNCTION: match_knowledge_chunks
-- pgvector のコサイン距離（<=>）で類似チャンクを返す。
-- クライアントから supabase.rpc('match_knowledge_chunks', {...}) で呼ぶ。
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding vector(1536),
  set_name        TEXT,
  match_count     INTEGER DEFAULT 6
)
RETURNS TABLE (
  id          UUID,
  source      TEXT,
  chunk_index INTEGER,
  content     TEXT,
  similarity  FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT
    kc.id,
    kc.source,
    kc.chunk_index,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_chunks kc
  INNER JOIN knowledge_sets ks ON ks.id = kc.knowledge_set_id
  WHERE ks.name       = set_name
    AND ks.is_active  = true
    AND kc.embedding  IS NOT NULL
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;
