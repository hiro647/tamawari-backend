// src/plugins/auth.js
//
// AUTH_MODE=dev    → x-dev-user-id ヘッダーをそのまま user_id として使用（開発専用）
// AUTH_MODE=firebase → Firebase ID Token を検証して user の firebase_uid を取得

const fp = require("fastify-plugin");
const db = require("../db");

let firebaseAdmin = null;

async function initFirebase() {
  if (process.env.AUTH_MODE !== "firebase") return;
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  firebaseAdmin = admin;
}

async function authPlugin(fastify) {
  await initFirebase();

  // リクエストに user を付与するデコレーター
  fastify.decorateRequest("user", null);

  // 認証を要求するフック
  fastify.decorate("authenticate", async function (request, reply) {
    try {
      if (process.env.AUTH_MODE === "dev") {
        // ── 開発モード ──────────────────────────────
        const devUserId = request.headers["x-dev-user-id"];
        if (!devUserId) {
          return reply.code(401).send({ error: "x-dev-user-id ヘッダーが必要です（開発モード）" });
        }
        const result = await db.query("SELECT * FROM users WHERE id = $1", [devUserId]);
        if (!result.rows[0]) {
          return reply.code(401).send({ error: "ユーザーが見つかりません" });
        }
        request.user = result.rows[0];

      } else {
        // ── Firebase モード ──────────────────────────
        const authHeader = request.headers["authorization"] || "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) return reply.code(401).send({ error: "Authorization ヘッダーが必要です" });

        const decoded = await firebaseAdmin.auth().verifyIdToken(token);
        const result = await db.query("SELECT * FROM users WHERE firebase_uid = $1", [decoded.uid]);
        if (!result.rows[0]) {
          return reply.code(401).send({ error: "ユーザー登録が必要です。POST /users を呼んでください" });
        }
        request.user = result.rows[0];
      }
    } catch (err) {
      reply.code(401).send({ error: "認証に失敗しました", detail: err.message });
    }
  });
}

module.exports = fp(authPlugin);
