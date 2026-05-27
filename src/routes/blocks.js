// src/routes/blocks.js
const db = require("../db");

async function blocksRoutes(fastify) {

  // ── GET /me/blocks ───────────────────────────────────────
  // 自分がブロックしているユーザー一覧
  fastify.get("/me/blocks", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const result = await db.query(`
      SELECT b.id, b.blocked_id, u.nickname AS blocked_nickname, b.created_at
      FROM blocks b
      JOIN users u ON b.blocked_id = u.id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC
    `, [req.user.id]);
    return reply.send(result.rows);
  });

  // ── POST /users/:id/block ────────────────────────────────
  // 指定ユーザーをブロック
  fastify.post("/users/:id/block", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const blockedId = req.params.id;
    if (blockedId === req.user.id) {
      return reply.code(400).send({ error: "自分自身はブロックできません" });
    }
    // 相手が存在するか
    const u = await db.query("SELECT 1 FROM users WHERE id = $1", [blockedId]);
    if (!u.rowCount) return reply.code(404).send({ error: "ユーザーが見つかりません" });

    const result = await db.query(`
      INSERT INTO blocks (blocker_id, blocked_id)
      VALUES ($1, $2)
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
      RETURNING *
    `, [req.user.id, blockedId]);

    return reply.code(201).send({ blocked: true, block: result.rows[0] || null });
  });

  // ── DELETE /users/:id/block ──────────────────────────────
  // ブロック解除
  fastify.delete("/users/:id/block", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    await db.query(
      "DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [req.user.id, req.params.id]
    );
    return reply.send({ blocked: false });
  });
}

module.exports = blocksRoutes;
