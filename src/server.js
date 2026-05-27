// src/server.js
require("dotenv").config();

const Fastify = require("fastify");

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" },
    },
  },
});

async function start() {
  // CORS（フロントエンドからのアクセスを許可）
  await fastify.register(require("@fastify/cors"), {
    origin: true,
  });

  // 認証プラグイン
  await fastify.register(require("./plugins/auth"));

  // ── ルート登録 ──
  await fastify.register(require("./routes/users"));
  await fastify.register(require("./routes/listings"));
  await fastify.register(require("./routes/applications"));
  await fastify.register(require("./routes/reviews"));
  await fastify.register(require("./routes/messages"));
  await fastify.register(require("./routes/blocks"));

  // ヘルスチェック
  fastify.get("/health", async () => ({ status: "ok", time: new Date().toISOString() }));

  // ルート
  fastify.get("/", async () => ({
    name: "たまわり API",
    version: "1.0.0",
    docs: "/health でヘルスチェック",
  }));

  // エラーハンドラ
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error.validation) {
      return reply.code(400).send({ error: "入力値が不正です", detail: error.message });
    }
    reply.code(error.statusCode || 500).send({
      error: error.message || "サーバーエラーが発生しました",
    });
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await fastify.listen({ port, host });
    console.log(`\n🥚 たまわり API が起動しました → http://localhost:${port}`);
    console.log(`   認証モード: ${process.env.AUTH_MODE || "dev"}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
