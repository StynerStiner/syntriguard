const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;
const isVercel = !!process.env.VERCEL;

// Vercel requires SSL; local dev may not
const pool = new Pool({
  connectionString: dbUrl,
  ssl: isVercel ? { rejectUnauthorized: false } : false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
