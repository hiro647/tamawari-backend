// src/routes/auth.js
// ──────────────────────────────────────────────────────────────
// メール＋パスワード認証（自前JWT）
//   POST /auth/register … 新規登録 → { token, user } を返す
//   POST /auth/login    … ログイン   → { token, user } を返す
// パスワードは bcrypt でハッシュ化して保存。JWT の payload は { sub: user.id }。
// ──────────────────────────────────────────────────────────────
const bcrypt = require("bcryptjs");
const db = require("../db");

// 登録時に活動エリアが未指定なら渋谷駅をデフォルトに（あとでプロフィールから変更可）
const DEFAULT_AREA = { lat: 35.6595, lng: 139.7005, name: "" };

// レスポンスから機密フィールドを除外する
function publicUser(row) {
  const { password_hash, firebase_uid, ...safe } = row;
  return safe;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function authRoutes(fastify) {

  // ── POST /auth/register ──────────────────────────────────
  fastify.post("/auth/register", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password", "nickname"],
        properties: {
          email:     { type: "string", minLength: 3,  maxLength: 200 },
          password:  { type: "string", minLength: 8,  maxLength: 100 },
          nickname:  { type: "string", minLength: 1,  maxLength: 20 },
          area_lat:  { type: "number" },
          area_lng:  { type: "number" },
          area_name: { type: "string", maxLength: 60 },
        },
      },
    },
  }, async (req, reply) => {
    const email = String(req.body.email).trim().toLowerCase();
    const { password, nickname } = req.body;
    const area_lat  = req.body.area_lat  ?? DEFAULT_AREA.lat;
    const area_lng  = req.body.area_lng  ?? DEFAULT_AREA.lng;
    const area_name = req.body.area_name ?? DEFAULT_AREA.name;

    if (!EMAIL_RE.test(email)) {
      return reply.code(400).send({ error: "メールアドレスの形式が正しくありません" });
    }

    const exists = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows[0]) {
      return reply.code(409).send({ error: "このメールアドレスは既に登録されています" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(`
      INSERT INTO users (email, password_hash, nickname, area_lat, area_lng, area_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [email, password_hash, nickname, area_lat, area_lng, area_name]);

    const user  = result.rows[0];
    const token = fastify.jwt.sign({ sub: user.id });
    return reply.code(201).send({ token, user: publicUser(user) });
  });

  // ── POST /auth/login ─────────────────────────────────────
  fastify.post("/auth/login", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email:    { type: "string" },
          password: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const email = String(req.body.email).trim().toLowerCase();
    const { password } = req.body;

    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    // ユーザー不在・パスワード未設定でも同じ文言にして情報を漏らさない
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: "メールアドレスまたはパスワードが違います" });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: "メールアドレスまたはパスワードが違います" });
    }

    const token = fastify.jwt.sign({ sub: user.id });
    return reply.send({ token, user: publicUser(user) });
  });
}

module.exports = authRoutes;
