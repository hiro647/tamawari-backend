// migrations/seed.js
// 開発用のサンプルデータを投入する
require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  console.log("▶ シードデータを投入中...");

  // ユーザー作成
  const users = await pool.query(`
    INSERT INTO users (firebase_uid, nickname, area_lat, area_lng, area_name) VALUES
      ('dev-yamada', '山田さくら', 35.6595, 139.7005, '渋谷区'),
      ('dev-sato',   '佐藤たろう', 35.6600, 139.7010, '渋谷区'),
      ('dev-suzuki', '鈴木はなこ', 35.6590, 139.7020, '渋谷区')
    ON CONFLICT (firebase_uid) DO NOTHING
    RETURNING id, nickname
  `);
  console.log(`  ✓ ユーザー ${users.rowCount}件`);

  // ユーザーIDを取得
  const allUsers = await pool.query("SELECT id, firebase_uid FROM users");
  const yamada = allUsers.rows.find(u => u.firebase_uid === "dev-yamada");
  const sato   = allUsers.rows.find(u => u.firebase_uid === "dev-sato");

  if (yamada) {
    // 募集作成
    const listing = await pool.query(`
      INSERT INTO listings (
        poster_id, store_name, store_lat, store_lng,
        pack_size, egg_size, price_total, price_per_egg,
        poster_eggs, confirmed_count, meet_at, comment
      ) VALUES (
        $1, 'マルエツ渋谷店', 35.6598, 139.7008,
        10, 'M', 298, 30,
        4, 4, NOW() + INTERVAL '6 hours', '駐車場前に集合しましょう！'
      )
      RETURNING id
    `, [yamada.id]);
    console.log(`  ✓ 募集 1件（ID: ${listing.rows[0].id}）`);

    // 佐藤さんが参加
    if (sato) {
      await pool.query(`
        INSERT INTO applications (listing_id, user_id, egg_count)
        VALUES ($1, $2, 2)
        ON CONFLICT DO NOTHING
      `, [listing.rows[0].id, sato.id]);
      await pool.query(`
        UPDATE listings SET confirmed_count = 6 WHERE id = $1
      `, [listing.rows[0].id]);
      console.log(`  ✓ 参加申請 1件`);
    }

    console.log(`\n📋 開発用ユーザーID（x-dev-user-id ヘッダーに使用）:`);
    allUsers.rows.forEach(u => console.log(`   ${u.firebase_uid}: ${u.id}`));
  }

  await pool.end();
  console.log("\n✅ シード完了");
}

seed().catch(err => {
  console.error("シード失敗:", err.message);
  process.exit(1);
});
