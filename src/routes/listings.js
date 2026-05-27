// src/routes/listings.js
const db = require("../db");

async function listingsRoutes(fastify) {

  // ── GET /listings ────────────────────────────────────────
  // 近くの募集一覧（緯度経度 + 半径で絞り込み）
  fastify.get("/listings", {
    schema: {
      querystring: {
        type: "object",
        required: ["lat", "lng"],
        properties: {
          lat:    { type: "number" },
          lng:    { type: "number" },
          radius: { type: "number", default: 1000 }, // メートル
          status: { type: "string", default: "open" },
          limit:  { type: "integer", default: 20, maximum: 50 },
          offset: { type: "integer", default: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const { lat, lng, radius = 1000, status = "open", limit = 20, offset = 0 } = req.query;

    // 閲覧者を特定（任意）。dev認証ヘッダー / firebaseの両対応の簡易版
    let viewerId = null;
    const devId = req.headers["x-dev-user-id"];
    if (devId) {
      const v = await db.query("SELECT id FROM users WHERE id = $1", [devId]);
      if (v.rows[0]) viewerId = v.rows[0].id;
    }

    // earth_distance で距離計算（メートル）
    const result = await db.query(`
      SELECT
        l.*,
        u.nickname        AS poster_nickname,
        u.rating_score    AS poster_rating,
        ROUND(
          earth_distance(
            ll_to_earth($1, $2),
            ll_to_earth(l.store_lat, l.store_lng)
          )::numeric
        ) AS distance_m,
        (
          SELECT json_agg(json_build_object(
            'id',         a.id,
            'user_id',    a.user_id,
            'nickname',   au.nickname,
            'egg_count',  a.egg_count,
            'status',     a.status
          ))
          FROM applications a
          JOIN users au ON a.user_id = au.id
          WHERE a.listing_id = l.id AND a.status = 'confirmed'
        ) AS applications
      FROM listings l
      JOIN users u ON l.poster_id = u.id
      WHERE
        l.status = $3
        AND earth_distance(
              ll_to_earth($1, $2),
              ll_to_earth(l.store_lat, l.store_lng)
            ) <= $4
        AND l.meet_at > NOW()
        AND ($7::uuid IS NULL OR l.poster_id NOT IN (
              SELECT blocked_id FROM blocks WHERE blocker_id = $7
            ))
      ORDER BY distance_m ASC, l.meet_at ASC
      LIMIT $5 OFFSET $6
    `, [lat, lng, status, radius, limit, offset, viewerId]);

    return reply.send({
      listings: result.rows,
      total:    result.rowCount,
    });
  });

  // ── POST /listings ───────────────────────────────────────
  // 募集を新規投稿
  fastify.post("/listings", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: [
          "store_name", "store_lat", "store_lng",
          "pack_size", "egg_size", "price_total",
          "poster_eggs", "meet_at"
        ],
        properties: {
          store_name:     { type: "string" },
          store_place_id: { type: "string" },
          store_address:  { type: "string" },
          store_lat:      { type: "number" },
          store_lng:      { type: "number" },
          pack_size:      { type: "integer", enum: [6, 10, 12] },
          egg_size:       { type: "string", enum: ["S","M","L","LL","other"] },
          price_total:    { type: "integer", minimum: 1 },
          poster_eggs:    { type: "integer", minimum: 1 },
          meet_at:        { type: "string", format: "date-time" },
          comment:        { type: "string", maxLength: 100 },
        },
      },
    },
  }, async (req, reply) => {
    const {
      store_name, store_place_id, store_address, store_lat, store_lng,
      pack_size, egg_size, price_total, poster_eggs, meet_at, comment,
    } = req.body;

    // poster_eggs が pack_size を超えていないか確認
    if (poster_eggs >= pack_size) {
      return reply.code(400).send({ error: "自分の希望個数はパック個数未満にしてください" });
    }

    // 1個あたり価格（切り上げ）
    const price_per_egg = Math.ceil(price_total / pack_size);

    const result = await db.query(`
      INSERT INTO listings (
        poster_id, store_name, store_place_id, store_address,
        store_lat, store_lng, pack_size, egg_size,
        price_total, price_per_egg, poster_eggs,
        confirmed_count, meet_at, comment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      req.user.id, store_name, store_place_id, store_address,
      store_lat, store_lng, pack_size, egg_size,
      price_total, price_per_egg, poster_eggs,
      poster_eggs, // 最初から主催者分は確定
      meet_at, comment || null,
    ]);

    return reply.code(201).send(result.rows[0]);
  });

  // ── GET /listings/:id ────────────────────────────────────
  // 募集詳細
  fastify.get("/listings/:id", async (req, reply) => {
    const result = await db.query(`
      SELECT
        l.*,
        u.nickname     AS poster_nickname,
        u.rating_score AS poster_rating,
        (
          SELECT json_agg(json_build_object(
            'id',         a.id,
            'user_id',    a.user_id,
            'nickname',   au.nickname,
            'rating',     au.rating_score,
            'egg_count',  a.egg_count,
            'status',     a.status,
            'created_at', a.created_at
          ) ORDER BY a.created_at ASC)
          FROM applications a
          JOIN users au ON a.user_id = au.id
          WHERE a.listing_id = l.id AND a.status = 'confirmed'
        ) AS applications
      FROM listings l
      JOIN users u ON l.poster_id = u.id
      WHERE l.id = $1
    `, [req.params.id]);

    if (!result.rows[0]) return reply.code(404).send({ error: "募集が見つかりません" });
    return reply.send(result.rows[0]);
  });

  // ── PUT /listings/:id ────────────────────────────────────
  // 募集内容を更新（主催者のみ・open の間のみ）
  fastify.put("/listings/:id", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const listing = await getListing(req.params.id, reply);
    if (!listing) return;
    if (listing.poster_id !== req.user.id) {
      return reply.code(403).send({ error: "主催者のみ編集できます" });
    }
    if (listing.status !== "open") {
      return reply.code(400).send({ error: "募集中の状態のみ編集できます" });
    }

    const { store_name, meet_at, comment, egg_size } = req.body;

    const result = await db.query(`
      UPDATE listings
      SET store_name = COALESCE($1, store_name),
          meet_at    = COALESCE($2::timestamptz, meet_at),
          comment    = COALESCE($3, comment),
          egg_size   = COALESCE($4::egg_size, egg_size),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [store_name, meet_at, comment, egg_size, req.params.id]);

    return reply.send(result.rows[0]);
  });

  // ── PATCH /listings/:id/status ───────────────────────────
  // ステータス更新（主催者のみ）
  // body: { status: "completed" | "cancelled" }
  fastify.patch("/listings/:id/status", {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["completed", "cancelled"] },
        },
      },
    },
  }, async (req, reply) => {
    const listing = await getListing(req.params.id, reply);
    if (!listing) return;
    if (listing.poster_id !== req.user.id) {
      return reply.code(403).send({ error: "主催者のみ操作できます" });
    }

    const result = await db.query(`
      UPDATE listings SET status = $1, updated_at = NOW()
      WHERE id = $2 RETURNING *
    `, [req.body.status, req.params.id]);

    return reply.send(result.rows[0]);
  });

  // ── DELETE /listings/:id ─────────────────────────────────
  // 募集削除（主催者・open 状態のみ）
  fastify.delete("/listings/:id", {
    preHandler: [fastify.authenticate],
  }, async (req, reply) => {
    const listing = await getListing(req.params.id, reply);
    if (!listing) return;
    if (listing.poster_id !== req.user.id) {
      return reply.code(403).send({ error: "主催者のみ削除できます" });
    }
    if (listing.confirmed_count > listing.poster_eggs) {
      return reply.code(400).send({ error: "参加者がいるため削除できません。キャンセルを使ってください" });
    }

    await db.query("DELETE FROM listings WHERE id = $1", [req.params.id]);
    return reply.code(204).send();
  });
}

// ヘルパー
async function getListing(id, reply) {
  const result = await db.query("SELECT * FROM listings WHERE id = $1", [id]);
  if (!result.rows[0]) {
    reply.code(404).send({ error: "募集が見つかりません" });
    return null;
  }
  return result.rows[0];
}

module.exports = listingsRoutes;
