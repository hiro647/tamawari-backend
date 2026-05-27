// src/routes/messages.js
const db = require("../db");

// その募集の参加者（主催者含む）かどうかを確認するヘルパー
async function isParticipant(listingId, userId) {
  const r = await db.query(`
    SELECT 1 FROM listings WHERE id = $1 AND poster_id = $2
    UNION
    SELECT 1 FROM applications WHERE listing_id = $1 AND user_id = $2 AND status = 'confirmed'
    LIMIT 1
  `, [listingId, userId]);
  return r.rowCount > 0;
}

async function messagesRoutes(fastify) {

  // ── GET /listings/:id/messages ───────────────────────────
  // メッセージ一覧（参加者のみ）。?after=ISO で差分取得も可能
  fastify.get("/listings/:id/messages", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const listingId = req.params.id;

    if (!(await isParticipant(listingId, req.user.id))) {
      return reply.code(403).send({ error: "この募集の参加者のみ閲覧できます" });
    }

    const { after } = req.query;
    const params = [listingId];
    let where = "m.listing_id = $1";
    if (after) { params.push(after); where += ` AND m.created_at > $${params.length}`; }

    const result = await db.query(`
      SELECT m.id, m.user_id, m.body, m.created_at,
             u.nickname AS user_nickname
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE ${where}
      ORDER BY m.created_at ASC
      LIMIT 200
    `, params);

    return reply.send(result.rows);
  });

  // ── POST /listings/:id/messages ──────────────────────────
  // メッセージ送信（参加者のみ）
  fastify.post("/listings/:id/messages", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["body"],
        properties: {
          body: { type: "string", minLength: 1, maxLength: 500 },
        },
      },
    },
  }, async (req, reply) => {
    const listingId = req.params.id;

    if (!(await isParticipant(listingId, req.user.id))) {
      return reply.code(403).send({ error: "この募集の参加者のみ投稿できます" });
    }

    const result = await db.query(`
      INSERT INTO messages (listing_id, user_id, body)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, body, created_at
    `, [listingId, req.user.id, req.body.body.trim()]);

    const msg = result.rows[0];
    msg.user_nickname = req.user.nickname;
    return reply.code(201).send(msg);
  });
}

module.exports = messagesRoutes;
