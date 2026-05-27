// src/routes/users.js
const db = require("../db");

async function usersRoutes(fastify) {

  // ── POST /users ──────────────────────────────────────────
  // 新規登録（firebase_uid が既存なら upsert）
  fastify.post("/users", {
    schema: {
      body: {
        type: "object",
        required: ["firebase_uid", "nickname", "area_lat", "area_lng"],
        properties: {
          firebase_uid: { type: "string" },
          nickname:     { type: "string", minLength: 1, maxLength: 20 },
          area_lat:     { type: "number" },
          area_lng:     { type: "number" },
          area_name:    { type: "string", default: "" },
        },
      },
    },
  }, async (req, reply) => {
    const { firebase_uid, nickname, area_lat, area_lng, area_name = "" } = req.body;

    const result = await db.query(`
      INSERT INTO users (firebase_uid, nickname, area_lat, area_lng, area_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (firebase_uid) DO UPDATE
        SET nickname   = EXCLUDED.nickname,
            area_lat   = EXCLUDED.area_lat,
            area_lng   = EXCLUDED.area_lng,
            area_name  = EXCLUDED.area_name,
            updated_at = NOW()
      RETURNING *
    `, [firebase_uid, nickname, area_lat, area_lng, area_name]);

    return reply.code(201).send(result.rows[0]);
  });

  // ── GET /users/me ────────────────────────────────────────
  // 自分のプロフィール取得
  fastify.get("/users/me", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    return reply.send(req.user);
  });

  // ── GET /users/:id ───────────────────────────────────────
  // 他ユーザーのプロフィール取得（センシティブ情報は除外）
  fastify.get("/users/:id", async (req, reply) => {
    const result = await db.query(`
      SELECT id, nickname, area_name, rating_score, rating_count, created_at
      FROM users WHERE id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return reply.code(404).send({ error: "ユーザーが見つかりません" });
    return reply.send(result.rows[0]);
  });

  // ── PUT /users/me ────────────────────────────────────────
  // プロフィール更新
  fastify.put("/users/me", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        properties: {
          nickname:  { type: "string", minLength: 1, maxLength: 20 },
          area_lat:  { type: "number" },
          area_lng:  { type: "number" },
          area_name: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { nickname, area_lat, area_lng, area_name } = req.body;
    const user = req.user;

    const result = await db.query(`
      UPDATE users
      SET nickname   = COALESCE($1, nickname),
          area_lat   = COALESCE($2, area_lat),
          area_lng   = COALESCE($3, area_lng),
          area_name  = COALESCE($4, area_name),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [nickname, area_lat, area_lng, area_name, user.id]);

    return reply.send(result.rows[0]);
  });

  // ── GET /users/:id/reviews ───────────────────────────────
  // ユーザーへの評価一覧
  fastify.get("/users/:id/reviews", async (req, reply) => {
    const result = await db.query(`
      SELECT r.*, u.nickname AS reviewer_nickname
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewed_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT 20
    `, [req.params.id]);

    return reply.send(result.rows);
  });
}

module.exports = usersRoutes;
