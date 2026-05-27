-- ============================================================
-- たまわり — 初期スキーマ
-- ============================================================

-- 拡張機能（緯度経度距離計算用）
CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
CREATE EXTENSION IF NOT EXISTS cube CASCADE;

-- ──────────────────────────────
-- ユーザー
-- ──────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  TEXT        UNIQUE NOT NULL,
  nickname      TEXT        NOT NULL,
  area_lat      FLOAT       NOT NULL,
  area_lng      FLOAT       NOT NULL,
  area_name     TEXT        NOT NULL DEFAULT '',
  rating_score  FLOAT       NOT NULL DEFAULT 5.0,
  rating_count  INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ──────────────────────────────
-- 募集
-- ──────────────────────────────
CREATE TYPE listing_status AS ENUM (
  'open',       -- 募集中
  'full',       -- 定員到達
  'completed',  -- 購入・解散完了
  'cancelled'   -- キャンセル
);

CREATE TYPE egg_size AS ENUM ('S', 'M', 'L', 'LL', 'other');

CREATE TABLE IF NOT EXISTS listings (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_id     UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_name    TEXT           NOT NULL,
  store_place_id TEXT,
  store_address TEXT,
  store_lat     FLOAT          NOT NULL,
  store_lng     FLOAT          NOT NULL,
  pack_size     INT            NOT NULL CHECK (pack_size > 0),
  egg_size      egg_size       NOT NULL DEFAULT 'M',
  price_total   INT            NOT NULL CHECK (price_total > 0),
  price_per_egg INT            NOT NULL,   -- 自動計算: CEIL(price_total / pack_size)
  poster_eggs   INT            NOT NULL CHECK (poster_eggs > 0),
  confirmed_count INT          NOT NULL DEFAULT 0,
  meet_at       TIMESTAMPTZ    NOT NULL,
  comment       TEXT,
  status        listing_status NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- 距離検索用インデックス
CREATE INDEX IF NOT EXISTS listings_location_idx
  ON listings USING gist (point(store_lng, store_lat));
CREATE INDEX IF NOT EXISTS listings_status_idx
  ON listings (status);
CREATE INDEX IF NOT EXISTS listings_meet_at_idx
  ON listings (meet_at);

-- ──────────────────────────────
-- 参加申請
-- ──────────────────────────────
CREATE TYPE application_status AS ENUM (
  'confirmed',   -- 参加確定
  'cancelled'    -- キャンセル済み
);

CREATE TABLE IF NOT EXISTS applications (
  id           UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   UUID               NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id      UUID               NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  egg_count    INT                NOT NULL CHECK (egg_count > 0),
  status       application_status NOT NULL DEFAULT 'confirmed',
  created_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, user_id)  -- 1募集に同一ユーザーは1回のみ
);

CREATE INDEX IF NOT EXISTS applications_listing_idx ON applications (listing_id);
CREATE INDEX IF NOT EXISTS applications_user_idx    ON applications (user_id);

-- ──────────────────────────────
-- 評価
-- ──────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID        NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reviewer_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_user_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score            INT         NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, reviewer_id, reviewed_user_id)
);

-- ──────────────────────────────
-- updated_at 自動更新トリガー
-- ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
