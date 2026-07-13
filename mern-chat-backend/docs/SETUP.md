# Backend Setup

## Prerequisites

- Node.js (v18+ recommended)
- A MongoDB connection string (local or Atlas)

## 1. Install dependencies

```bash
cd mern-chat-backend
npm install
```

## 2. Configure environment variables

Create a `.env` file in the `mern-chat-backend` root with:

```env
MONGO_URL=<your-mongodb-connection-string>
PORT=5000
JWT_SECRET=<a-long-random-secret>
```

- `MONGO_URL` — MongoDB connection string (local instance or Atlas cluster).
- `PORT` — port the server listens on (defaults to `5000` if omitted).
- `JWT_SECRET` — secret used to sign JWTs; use a long random value.

## 3. Run the server

```bash
npm start
```

This runs `node server.js`. On success you should see:

```
Server is up and running on port 5000
Connected to DB
```

### Troubleshooting: MongoDB Atlas connection

If you're using a MongoDB Atlas cluster and see one of these errors:

```
Mongodb connected failed MongooseServerSelectionError: Could not connect to any servers in your MongoDB Atlas cluster...
Operation `users.findOne()` buffering timed out after 10000ms
```

Your current IP address isn't on the Atlas cluster's network access list, so Mongoose never
establishes a connection and queries time out waiting for one. To fix it:

1. Go to [MongoDB Atlas](https://cloud.mongodb.com) → your project.
2. In the left sidebar under **SECURITY**, click **Database & Network Access**.
3. Open the **Network Access** tab → **Add IP Address**.
4. Add either:
   - **Add Current IP Address** — scoped to your current IP (best if your IP is stable).
   - `0.0.0.0/0` — allow from anywhere (convenient for local dev with a dynamic IP; do not use in production).
5. Wait ~1 minute for the change to propagate, then restart the server.

## 4. Verify

- API root: http://localhost:5000/
- Swagger docs: http://localhost:5000/api-docs
- Socket.IO server is attached to the same HTTP server and accepts connections from the origins configured in `server.js` (`http://localhost:5173`, `http://localhost:5174`, and the deployed frontend URL).

## API routes

- `/api/users`
- `/api/groups`
- `/api/messages`
