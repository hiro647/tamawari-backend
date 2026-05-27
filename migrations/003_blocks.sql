-- ============================================================
-- たまわり — ブロック機能
-- ============================================================

CREATE TABLE IF NOT EXISTS blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- ブロックした人
  blocked_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- ブロックされた人
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocker_idx ON blocks (blocker_id);
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);
