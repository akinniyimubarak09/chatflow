# ChatFlow

A full-stack real-time messaging application inspired by modern chat apps.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Real-time: Socket.IO
- Authentication: JWT + bcrypt
- Persistence: JSON file storage (no database server required)
- Styling: Custom responsive CSS

## Run

### 1. Server
```bash
cd server
npm install
npm run dev
```

### 2. Client
Open a second terminal:
```bash
cd client
npm install
npm run dev
```

Open the URL shown by Vite (normally http://localhost:5173).

The client expects the API at `http://localhost:5000`. You can override it with:
`VITE_API_URL=http://localhost:5000`

## Demo
Register a new account, then open another browser/incognito window and register another account to test real-time messaging.

## Environment
Create `server/.env` from `.env.example`.

For production, replace the JSON store with a real database and use a strong JWT secret.
