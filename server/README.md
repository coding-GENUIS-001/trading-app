# Trading App Auth Server

Small Express server providing user registration, login (JWT), and per-user watchlist persistence for the Trading Rates Viewer demo.

Run locally

1. cd server
2. npm install
3. npm run start

Defaults
- Server listens on port 3000
- DB file: server/data.db (SQLite)
- JWT secret: set JWT_SECRET env var for production

API
- POST /api/register { username, email, password }
- POST /api/login { email, password }
- GET /api/me (Authorization: Bearer <token>)
- GET /api/watchlist (auth required)
- POST /api/watchlist { symbol } (auth required)
- DELETE /api/watchlist/:symbol (auth required)
