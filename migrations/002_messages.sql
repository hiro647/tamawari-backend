-- ============================================================
-- たまわり — チャット機能（メッセージ）
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 募集ごとの時系列取得用インデックス
CREATE INDEX IF NOT EXISTS messages_listing_idx
  ON messages (listing_id, created_at);
