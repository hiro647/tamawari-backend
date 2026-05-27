// src/routes/reviews.js
const db = require("../db");

async function reviewsRoutes(fastify) {

  // ── POST /listings/:id/reviews ───────────────────────────
  // 取引完了後に相手を評価する
  fastify.post("/listings/:id/reviews", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["reviewed_user_id", "score"],
        properties: {
          reviewed_user_id: { type: "string" },
          score:            { type: "integer", minimum: 1, maximum: 5 },
          comment:          { type: "string", maxLength: 200 },
        },
      },
    },
  }, async (req, reply) => {
    const listingId = req.params.id;
    const reviewerId = req.user.id;
    const { reviewed_user_id, score, comment } = req.body;

    if (reviewed_user_id === reviewerId) {
      return reply.code(400).send({ error: "自分自身は評価できません" });
    }

    // 募集が completed か確認
    const lr = await db.query("SELECT * FROM listings WHERE id = $1", [listingId]);
    const listing = lr.rows[0];
    if (!listing) return reply.code(404).send({ error: "募集が見つかりません" });
    if (listing.status !== "completed") {
      return reply.code(400).send({ error: "完了した募集のみ評価できます" });
    }

    // 評価者・被評価者が実際にこの募集の参加者か確認
    const participants = await db.query(`
      SELECT user_id FROM applications WHERE listing_id = $1 AND status = 'confirmed'
      UNION
      SELECT poster_id FROM listings WHERE id = $1
    `, [listingId]);
    const ids = participants.rows.map(r => r.user_id);
    if (!ids.includes(reviewerId) || !ids.includes(reviewed_user_id)) {
      return reply.code(403).send({ error: "この募集の参加者のみ評価できます" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 評価を保存（重複は上書き）
      const rr = await client.query(`
        INSERT INTO reviews (listing_id, reviewer_id, reviewed_user_id, score, comment)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (listing_id, reviewer_id, reviewed_user_id)
        DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment
        RETURNING *
      `, [listingId, reviewerId, reviewed_user_id, score, comment || null]);

      // 被評価者の rating_score / rating_count を再計算
      const agg = await client.query(`
        SELECT AVG(score)::numeric(3,2) AS avg, COUNT(*) AS cnt
        FROM reviews WHERE reviewed_user_id = $1
      `, [reviewed_user_id]);

      await client.query(`
        UPDATE users SET rating_score = $1, rating_count = $2, updated_at = NOW()
        WHERE id = $3
      `, [agg.rows[0].avg, agg.rows[0].cnt, reviewed_user_id]);

      await client.query("COMMIT");
      return reply.code(201).send(rr.rows[0]);

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /listings/:id/reviews ────────────────────────────
  fastify.get("/listings/:id/reviews", async (req, reply) => {
    const result = await db.query(`
      SELECT r.*, u.nickname AS reviewer_nickname
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.listing_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);
    return reply.send(result.rows);
  });
}

module.exports = reviewsRoutes;
