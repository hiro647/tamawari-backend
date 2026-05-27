// src/routes/applications.js
const db = require("../db");

async function applicationsRoutes(fastify) {

  // ── POST /listings/:id/applications ──────────────────────
  // 募集に参加申請（個数を指定）
  // トランザクションで「残り個数チェック → 申請作成 → confirmed_count更新」を原子的に実行
  fastify.post("/listings/:id/applications", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["egg_count"],
        properties: {
          egg_count: { type: "integer", minimum: 1 },
        },
      },
    },
  }, async (req, reply) => {
    const listingId = req.params.id;
    const userId    = req.user.id;
    const { egg_count } = req.body;

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // 行ロックを取得して同時申請の競合を防ぐ
      const lr = await client.query(
        "SELECT * FROM listings WHERE id = $1 FOR UPDATE",
        [listingId]
      );
      const listing = lr.rows[0];

      if (!listing) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "募集が見つかりません" });
      }
      if (listing.status !== "open") {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "この募集は受付を終了しています" });
      }
      if (listing.poster_id === userId) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "主催者は参加申請できません" });
      }

      const remaining = listing.pack_size - listing.confirmed_count;
      if (egg_count > remaining) {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: `残り${remaining}個のため申請できません` });
      }

      // 既存の申請があるか（重複参加チェック）
      const existing = await client.query(
        "SELECT * FROM applications WHERE listing_id = $1 AND user_id = $2",
        [listingId, userId]
      );
      if (existing.rows[0] && existing.rows[0].status === "confirmed") {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "すでに参加しています" });
      }

      // 申請作成（過去にキャンセルしていれば復活）
      let application;
      if (existing.rows[0]) {
        const ar = await client.query(`
          UPDATE applications
          SET egg_count = $1, status = 'confirmed', updated_at = NOW()
          WHERE id = $2 RETURNING *
        `, [egg_count, existing.rows[0].id]);
        application = ar.rows[0];
      } else {
        const ar = await client.query(`
          INSERT INTO applications (listing_id, user_id, egg_count)
          VALUES ($1, $2, $3) RETURNING *
        `, [listingId, userId, egg_count]);
        application = ar.rows[0];
      }

      // confirmed_count 更新
      const newCount = listing.confirmed_count + egg_count;
      const newStatus = newCount >= listing.pack_size ? "full" : "open";
      await client.query(`
        UPDATE listings SET confirmed_count = $1, status = $2, updated_at = NOW()
        WHERE id = $3
      `, [newCount, newStatus, listingId]);

      await client.query("COMMIT");

      return reply.code(201).send({
        application,
        listing_status: newStatus,
        confirmed_count: newCount,
      });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  // ── DELETE /applications/:id ─────────────────────────────
  // 参加キャンセル（本人のみ）。confirmed_count を戻す
  fastify.delete("/applications/:id", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const ar = await client.query(
        "SELECT * FROM applications WHERE id = $1",
        [req.params.id]
      );
      const application = ar.rows[0];

      if (!application) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "申請が見つかりません" });
      }
      if (application.user_id !== req.user.id) {
        await client.query("ROLLBACK");
        return reply.code(403).send({ error: "本人のみキャンセルできます" });
      }
      if (application.status === "cancelled") {
        await client.query("ROLLBACK");
        return reply.code(400).send({ error: "すでにキャンセル済みです" });
      }

      // 行ロック
      const lr = await client.query(
        "SELECT * FROM listings WHERE id = $1 FOR UPDATE",
        [application.listing_id]
      );
      const listing = lr.rows[0];

      // 申請をキャンセル状態に
      await client.query(
        "UPDATE applications SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [req.params.id]
      );

      // confirmed_count を戻す（full → open に戻す）
      const newCount = listing.confirmed_count - application.egg_count;
      await client.query(`
        UPDATE listings SET confirmed_count = $1, status = 'open', updated_at = NOW()
        WHERE id = $2
      `, [newCount, application.listing_id]);

      await client.query("COMMIT");
      return reply.code(200).send({ cancelled: true, confirmed_count: newCount });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });

  // ── GET /me/applications ─────────────────────────────────
  // 自分が参加申請した募集一覧（管理画面「参加予定」用）
  fastify.get("/me/applications", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const result = await db.query(`
      SELECT
        a.id          AS application_id,
        a.egg_count,
        a.status      AS application_status,
        l.*,
        u.nickname    AS poster_nickname
      FROM applications a
      JOIN listings l ON a.listing_id = l.id
      JOIN users u    ON l.poster_id = u.id
      WHERE a.user_id = $1 AND a.status = 'confirmed'
      ORDER BY l.meet_at ASC
    `, [req.user.id]);

    return reply.send(result.rows);
  });

  // ── GET /me/listings ─────────────────────────────────────
  // 自分が投稿した募集一覧（管理画面「自分の募集」用）
  fastify.get("/me/listings", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const result = await db.query(`
      SELECT
        l.*,
        (
          SELECT json_agg(json_build_object(
            'user_id',   a.user_id,
            'nickname',  au.nickname,
            'egg_count', a.egg_count
          ))
          FROM applications a
          JOIN users au ON a.user_id = au.id
          WHERE a.listing_id = l.id AND a.status = 'confirmed'
        ) AS applications
      FROM listings l
      WHERE l.poster_id = $1
      ORDER BY l.created_at DESC
    `, [req.user.id]);

    return reply.send(result.rows);
  });
}

module.exports = applicationsRoutes;
