// migrations/run.js
require("dotenv").config();
const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`▶ Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(__dirname, file), "utf8");
    await pool.query(sql);
    console.log(`  ✓ Done`);
  }

  await pool.end();
  console.log("\n✅ All migrations completed.");
}

run().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
