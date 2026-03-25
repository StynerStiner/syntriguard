const { Pool } = require('pg');

const dbUrl = process.env.DATABASE_URL;

// Supabase direct connection — use no SSL if the server rejects it
const pool = new Pool({
  connectionString: dbUrl + (dbUrl.includes('?') ? '&' : '?') + 'sslmode=disable'
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
