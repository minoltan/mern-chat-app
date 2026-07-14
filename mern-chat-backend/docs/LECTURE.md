# MERN Chat Backend — Technical Walkthrough

This doc explains *how* the backend works and *why* it's built this way. Pair it
with [ARCHITECTURE.md](./ARCHITECTURE.md) (high-level + low-level component
diagrams) and the sequence diagrams in [`sequence diagrams/`](./sequence%20diagrams)
— each numbered `.mmd` file traces one flow step by step (open with a Mermaid
live viewer or the Mermaid VS Code extension).

## 1. Big picture

```
Client (React)
   │
   ├── HTTP (REST)  ──────────────►  Express app (server.js)
   │                                     │
   │                                     ├── /api/users     (auth, no protect)
   │                                     ├── /api/groups    (protect [+ isAdmin])
   │                                     ├── /api/messages  (protect)
   │                                     └── /api-docs      (Swagger UI)
   │
   └── WebSocket (Socket.IO) ───────►  socket.js (real-time layer, separate from REST)
                                          │
                                          └── in-memory connectedUsers Map (per-process, not persisted)

Both layers talk to the same MongoDB via Mongoose models (models/).
```

Two parallel transports exist on purpose:

- **REST (Express)** is the source of truth. It persists users, groups, and
  messages in MongoDB and enforces auth/authorization.
- **Socket.IO** is a thin, stateless-on-disk broadcast layer for presence and
  live delivery (typing indicators, instant message relay, join/leave
  notifications). It does **not** write to the database — a client still
  calls `POST /api/messages` to persist a message, and separately emits
  `new message` over the socket so other connected clients see it instantly.
  This is a common pattern: HTTP for durable writes, sockets for fan-out.

## 2. Request lifecycle (REST)

`server.js` wires the pipeline in this order:

1. `cors()` — allows the frontend origin to call the API.
2. `express.json()` — parses JSON bodies into `req.body`.
3. `mongoose.connect(process.env.MONGO_URL)` — one persistent DB connection
   shared across all requests (connection pooling is handled by the driver).
4. Route mounting: `/api/users`, `/api/groups`, `/api/messages`.
5. `/api-docs` — Swagger UI generated from JSDoc comments in each route file
   (see `config/swagger.js`, `apis: ["./routes/*.js"]`). Add a `@swagger`
   block above any new route and it appears in the docs automatically.

A typical protected request flows through:

```
req → cors → express.json → authMiddleware.protect → (isAdmin, if required) → route handler → res
```

## 3. Authentication & authorization

`middleware/authMiddleware.js` exports two middlewares:

- **`protect`** — reads `Authorization: Bearer <token>`, verifies it with
  `jwt.verify(token, process.env.JWT_SECRET)`, loads the user from Mongo
  (password field excluded via `.select("-password")`), and attaches it as
  `req.user`. If the header is missing/invalid, it responds `401`.
- **`isAdmin`** — a second gate that only lets the request through if
  `req.user.isAdmin` is true. Used for group creation (`groupRouter.post("/", protect, isAdmin, ...)`).

Note `protect` must run before `isAdmin` — `isAdmin` depends on `req.user`
already being populated.

**Password handling** (`models/UserModel.js`): a Mongoose `pre("save")` hook
hashes `password` with `bcrypt` (10 salt rounds) whenever it's set or changed,
so plaintext passwords never reach the database. `matchPassword` on the
schema wraps `bcrypt.compare` for login checks.

**Token issuance** (`routes/userRoutes.js`): `generateToken(id)` signs
`{ id: user._id }` with `JWT_SECRET`, expiring in 30 days. The token is
returned to the client on both register... actually only on **login**
(register returns the created user without a token — the client is expected
to log in right after registering; worth calling out if you're using this as
a teaching example of an incomplete/asymmetric API).

See [`diagrams/01-register.mmd`](./diagrams/01-register.mmd) and
[`diagrams/02-login.mmd`](./diagrams/02-login.mmd).

## 4. Data models (Mongoose)

| Model | File | Key fields | Relationships |
|---|---|---|---|
| `User` | `models/UserModel.js` | `username`, `email`, `password` (hashed), `isAdmin` | referenced by `Group.members`, `Group.admin`, `Message.sender` |
| `Group` | `models/GroupModel.js` | `name`, `description`, `members[]`, `admin` | `members`/`admin` are `ObjectId` refs to `User` |
| `Message` | `models/ChatModel.js` | `content`, `sender`, `group` | `sender` refs `User`, `group` refs `Group` |

All three use `{ timestamps: true }`, giving `createdAt`/`updatedAt` for free
— this is what messages are sorted by (`.sort({ createdAt: 1 })` in
`messageRoutes.js`) to render chat history oldest-first.

Routes `.populate()` these refs before responding, so the client receives
nested user objects (`username`, `email`) instead of bare ObjectIds — see
`groupRoutes.js` and `messageRoutes.js`.

## 5. Groups: membership workflow

`routes/groupRoutes.js` implements a simple membership model with no
invite system — any authenticated user can join any group:

- `POST /api/groups` (admin only) — creates a group with the creator as both
  `admin` and the first `member`.
- `GET /api/groups` — lists all groups, populated.
- `POST /api/groups/:groupId/join` — appends `req.user._id` to `members` if
  not already present (checked via `Array.includes`).
- `POST /api/groups/:groupId/leave` — removes `req.user._id` via `filter`,
  comparing `ObjectId`s as strings (`.toString()`) since `Array.includes`
  can't compare `ObjectId` instances directly.

Diagrams: [`03-create-group.mmd`](./diagrams/03-create-group.mmd),
[`04-list-groups.mmd`](./diagrams/04-list-groups.mmd),
[`05-join-group.mmd`](./diagrams/05-join-group.mmd),
[`06-leave-group.mmd`](./diagrams/06-leave-group.mmd).

## 6. Messages: REST persistence

`routes/messageRoutes.js` is intentionally minimal:

- `POST /api/messages` — creates a `Message` document (`sender` comes from
  `req.user`, never trusted from the request body) and returns it populated
  with the sender's `username`/`email`.
- `GET /api/messages/:groupId` — returns all messages for a group, oldest
  first.

This is pure persistence — it has no knowledge of who's currently online.
That's the socket layer's job.

Diagrams: [`07-send-message.mmd`](./diagrams/07-send-message.mmd),
[`08-get-messages.mmd`](./diagrams/08-get-messages.mmd).

## 7. Real-time layer (Socket.IO)

`socket.js` is a single exported function called once from `server.js`
(`socketIo(io)`) and holds all real-time logic in one place. Key design
points worth discussing in a lecture:

- **Auth is out-of-band and unverified.** The client sends a `user` object
  via `socket.handshake.auth.user` at connect time — there's no JWT check on
  the socket connection itself. This is a deliberate simplification for
  teaching purposes; in a production app you'd verify the JWT during the
  Socket.IO handshake (e.g. in an `io.use()` middleware) rather than trusting
  a client-supplied object.
- **Presence tracking lives in memory** (`connectedUsers = new Map()`),
  keyed by `socket.id`. This means presence state is per-process and resets
  on server restart — fine for a single-instance teaching app, but wouldn't
  scale across multiple server instances without a shared store (e.g. Redis)
  since each instance would have its own Map.
- **Rooms = groups.** Socket.IO's built-in room feature is reused directly:
  `groupId` doubles as the room name. Joining a group's chat means
  `socket.join(groupId)`.
- **Events implemented:**
  - `join room` → joins the socket to the room, updates the presence map,
    broadcasts the refreshed `users in room` list and a `USER_JOINED`
    notification.
  - `leave room` → explicit leave, removes from the map, notifies the room.
  - `new message` → pure relay (`socket.to(groupId).emit(...)`); does **not**
    touch the database — the REST `POST /api/messages` call is what persists
    it. The client is responsible for doing both.
  - `disconnect` → implicit leave (tab closed, network drop); cleans up the
    same way as `leave room`.
  - `typing` / `stop typing` → ephemeral broadcast, not persisted anywhere.
- **`socket.to(x)` vs `io.in(x)`:** the code uses `socket.to(groupId)` to
  broadcast to everyone in the room *except the sender*, and `io.in(groupId)`
  (for `users in room`) to broadcast to *everyone including the sender* —
  worth pointing out as a common Socket.IO gotcha.

See [`diagrams/09-socketio-realtime.mmd`](./diagrams/09-socketio-realtime.mmd)
for the full sequence across two clients.

## 8. Talking points / discussion questions for the lecture

- Why does `register` not return a token while `login` does? What would you
  change to make onboarding one step instead of two?
- What happens if two browser tabs for the same user both call `join room`?
  (Each gets its own `socket.id`, so the map holds two entries — the "users
  in room" list would show duplicates.)
- The socket layer trusts `socket.handshake.auth.user` without verification.
  How would you wire in `JWT_SECRET` here the same way `protect` does for
  REST?
- `connectedUsers` is process-local. What breaks if you horizontally scale
  this server to two instances behind a load balancer? (Hint: Socket.IO has
  an adapter API — e.g. `socket.io-redis` — for exactly this.)
- Messages sent over the socket (`new message`) and messages persisted via
  REST (`POST /api/messages`) are two separate calls from the client. What
  happens if the REST call fails but the socket emit succeeds, or vice versa?
