-- ============================================================
-- たまわり — 004 メール＋パスワード認証の追加
-- ============================================================
-- 既存の users テーブルに email / password_hash を追加し、
-- firebase_uid を NULL 許容にする（パスワード登録ユーザーは firebase_uid を持たない）。
-- Neon の SQL Editor にそのまま貼って実行してください。

-- firebase_uid を NULL 許容へ（パスワード登録ユーザー用）
ALTER TABLE users ALTER COLUMN firebase_uid DROP NOT NULL;

-- メールアドレス（ログインID）。UNIQUE 制約付き。NULL は複数許容される
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;

-- bcrypt でハッシュ化したパスワード
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
