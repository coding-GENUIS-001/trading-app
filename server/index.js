// server/index.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { openDb, initDb } = require('./db');
const auth = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Public endpoints
app.get('/', (req, res) => res.json({ ok: true, message: 'Trading app auth server' }));

app.post('/api/register', async (req, res) => {
  try{
    const { username, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const db = await openDb();
    const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (user) return res.status(409).json({ error: 'email already registered' });
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run('INSERT INTO users (username, email, password_hash, created_at) VALUES (?,?,?,datetime("now"))', [username||null, email, hash]);
    const newId = result.lastID;
    const token = auth.generateToken({ id: newId, email });
    return res.json({ token, user: { id: newId, email, username: username||null } });
  }catch(err){ console.error(err); res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/login', async (req, res) => {
  try{
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const db = await openDb();
    const row = await db.get('SELECT id, password_hash, username FROM users WHERE email = ?', [email]);
    if (!row) return res.status(401).json({ error: 'invalid_credentials' });
    const bcrypt = require('bcrypt');
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
    const token = auth.generateToken({ id: row.id, email });
    res.json({ token, user: { id: row.id, email, username: row.username } });
  }catch(err){ console.error(err); res.status(500).json({ error: 'server_error' }); }
});

// Protected
app.get('/api/me', auth.requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// Watchlist endpoints
app.get('/api/watchlist', auth.requireAuth, async (req, res) => {
  try{
    const db = await openDb();
    const rows = await db.all('SELECT symbol FROM watchlists WHERE user_id = ?', [req.user.id]);
    res.json({ watchlist: rows.map(r=>r.symbol) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/watchlist', auth.requireAuth, async (req, res) => {
  try{
    const { symbol } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const db = await openDb();
    await db.run('INSERT OR IGNORE INTO watchlists(user_id, symbol) VALUES (?,?)', [req.user.id, symbol]);
    const rows = await db.all('SELECT symbol FROM watchlists WHERE user_id = ?', [req.user.id]);
    res.json({ watchlist: rows.map(r=>r.symbol) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'server_error' }); }
});

// remove item
app.delete('/api/watchlist/:symbol', auth.requireAuth, async (req, res) => {
  try{
    const sym = req.params.symbol;
    const db = await openDb();
    await db.run('DELETE FROM watchlists WHERE user_id = ? AND symbol = ?', [req.user.id, sym]);
    const rows = await db.all('SELECT symbol FROM watchlists WHERE user_id = ?', [req.user.id]);
    res.json({ watchlist: rows.map(r=>r.symbol) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'server_error' }); }
});

// Initialize DB and start
(async ()=>{
  try{
    await initDb();
    app.listen(PORT, ()=> console.log('Auth server running on port', PORT));
  }catch(err){ console.error('Failed to start server', err); }
})();
