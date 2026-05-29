// src/plugins/auth.js
//
// AUTH_MODE=dev    → x-dev-user-id ヘッダーをそのまま user_id として使用（開発専用）
// AUTH_MODE=firebase → Firebase ID Token を検証して user の firebase_uid を取得

const fp = require("fastify-plugin");
const db = require("../db");

// request.user に載せる前に機密フィールドを除去する
function sanitizeUser(row) {
  if (!row) return row;
  const { password_hash, firebase_uid, ...safe } = row;
  return safe;
}

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
  // ※ @fastify/jwt が request.user を既に提供するため、ここでは宣言しない
  //   （authenticate 内で request.user に DB のユーザー行を代入する）

  // 認証を要求するフック
  fastify.decorate("authenticate", async function (request, reply) {
    try {
      const mode = process.env.AUTH_MODE || "dev";

      if (mode === "jwt") {
        // ── メール＋パスワード（自前JWT）モード ─────────
        let decoded;
        try {
          decoded = await request.jwtVerify();   // Authorization: Bearer <token> を検証
        } catch (e) {
          return reply.code(401).send({ error: "ログインが必要です" });
        }
        const result = await db.query("SELECT * FROM users WHERE id = $1", [decoded.sub]);
        if (!result.rows[0]) {
          return reply.code(401).send({ error: "ユーザーが見つかりません" });
        }
        request.user = sanitizeUser(result.rows[0]);

      } else if (mode === "dev") {
        // ── 開発モード ──────────────────────────────
        const devUserId = request.headers["x-dev-user-id"];
        if (!devUserId) {
          return reply.code(401).send({ error: "x-dev-user-id ヘッダーが必要です（開発モード）" });
        }
        const result = await db.query("SELECT * FROM users WHERE id = $1", [devUserId]);
        if (!result.rows[0]) {
          return reply.code(401).send({ error: "ユーザーが見つかりません" });
        }
        request.user = sanitizeUser(result.rows[0]);

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
        request.user = sanitizeUser(result.rows[0]);
      }
    } catch (err) {
      reply.code(401).send({ error: "認証に失敗しました", detail: err.message });
    }
  });
}

module.exports = fp(authPlugin);
