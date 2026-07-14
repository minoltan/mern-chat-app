# Architecture Diagrams

This doc gives two views of the system, at two different zoom levels:

- **High-level** — the major pieces (browser, API, real-time layer, database) and
  how they talk to each other. Good for a first-time reader or a project overview slide.
- **Low-level** — inside each piece: modules, middleware order, and which file
  calls which. Good for someone about to change code.

Pair this with [REQUIREMENTS.md](./REQUIREMENTS.md) (functional/non-functional
requirements + ER diagram) and the [sequence diagrams](./sequence%20diagrams)
(step-by-step traces of individual flows like login or send-message).

## 1. High-level architecture

```mermaid
flowchart LR
    subgraph ClientSide["Browser"]
        SPA["React SPA (Vite + Chakra UI)\nmern-chat-frontend"]
    end

    subgraph ServerSide["Node.js process — mern-chat-backend/server.js"]
        REST["REST API (Express)\n/api/users, /api/groups, /api/messages"]
        WS["Socket.IO server\nsocket.js"]
        SwaggerDocs["Swagger UI\n/api-docs"]
    end

    DB[("MongoDB\nusers, groups, messages")]

    SPA -- "HTTPS/JSON via axios\nAuthorization: Bearer <JWT>" --> REST
    SPA -- "WebSocket\nauth: { user }" --> WS
    REST -- "Mongoose ODM" --> DB
    REST --- SwaggerDocs

    classDef note fill:#fff8dc,stroke:#c9a227,color:#333;
    N["Socket.IO never touches MongoDB.\nIt only relays events between\ncurrently-connected clients (presence,\ntyping, instant message fan-out)."]:::note
    WS -.-> N
```

**Key points:**

- Two transports, one server process: REST (`server.js` + `routes/`) is the
  source of truth — it's the only thing that reads/writes MongoDB. Socket.IO
  (`socket.js`) is a stateless-on-disk broadcast layer for real-time UX
  (presence, typing indicators, instant delivery). A client still calls
  `POST /api/messages` to persist a message and separately emits
  `new message` over the socket so other connected members see it instantly.
- Auth is JWT-based: `POST /api/users/login` issues a token, the SPA stores it
  in `localStorage` (`userInfo.token`) and attaches it as a Bearer header on
  protected REST calls, and passes the user object as Socket.IO handshake
  `auth` (not JWT-verified on the socket side — see NFR table in
  REQUIREMENTS.md).
- CORS on both the Express app and the Socket.IO server is scoped to the
  known frontend origin, not `*`.

## 2. Low-level design — backend

```mermaid
flowchart TB
    Server["server.js\n(entry point)"]

    subgraph Middleware["Global middleware"]
        CORSmw["cors()"]
        JSONmw["express.json()"]
    end

    subgraph Routers["routes/"]
        UserRoutes["userRoutes.js\nPOST /register\nPOST /login"]
        GroupRoutes["groupRoutes.js\nPOST /\nGET /\nPOST /:groupId/join\nPOST /:groupId/leave"]
        MessageRoutes["messageRoutes.js\nPOST /\nGET /:groupId"]
    end

    subgraph AuthMw["middleware/authMiddleware.js"]
        Protect["protect\n(verify JWT, load req.user)"]
        IsAdmin["isAdmin\n(req.user.isAdmin check)"]
    end

    subgraph ModelsG["models/ (Mongoose)"]
        UserModel["UserModel.js\npre('save') bcrypt hash\nmatchPassword()"]
        GroupModel["GroupModel.js\nadmin, members[]"]
        ChatModel["ChatModel.js\n(Message) sender, group, content"]
    end

    SocketFile["socket.js\nio.on('connection', ...)"]
    ConnMap[("connectedUsers\nin-memory Map<socketId, {user, room}>")]

    DB[("MongoDB")]

    Server --> CORSmw --> JSONmw
    JSONmw --> UserRoutes
    JSONmw --> GroupRoutes
    JSONmw --> MessageRoutes
    Server -. "http.createServer(app)\npassed to socketio(server)" .-> SocketFile

    GroupRoutes --> Protect
    MessageRoutes --> Protect
    Protect --> IsAdmin
    GroupRoutes -. "POST / requires" .-> IsAdmin

    UserRoutes --> UserModel
    GroupRoutes --> GroupModel
    GroupRoutes -. ".populate('admin')\n.populate('members')" .-> UserModel
    MessageRoutes --> ChatModel
    MessageRoutes -. ".populate('sender')" .-> UserModel

    SocketFile --> ConnMap

    UserModel --> DB
    GroupModel --> DB
    ChatModel --> DB
```

**Request pipeline, in order (`server.js`):** `cors()` → `express.json()` →
route-specific `protect` (JWT) → route-specific `isAdmin` → handler → Mongoose
model → response. `userRoutes` has no `protect`, since register/login must be
reachable while unauthenticated.

**socket.js event handlers** (all keyed by `socket.id` in `connectedUsers`):
`join room` (joins the Socket.IO room, updates the map, emits `users in room`
+ `notification`), `leave room` / `disconnect` (removes from the map, emits
`user left`), `new message` (pure relay via `socket.to(groupId).emit(...)`,
no DB write), `typing` / `stop typing` (relay only).

## 3. Low-level design — frontend

```mermaid
flowchart TB
    App["App.jsx\n(BrowserRouter + ChakraProvider)"]

    LandingPage["pages/LandingPage.jsx"]
    Login["pages/Login.jsx"]
    Register["pages/Register.jsx"]
    PrivateRoute["components/PrivateRoute.jsx\nchecks userInfo.token"]
    Chat["pages/Chat.jsx"]
    Sidebar["components/Sidebar.jsx\nlist/create/join/leave groups"]
    ChatArea["components/ChatArea.jsx\nmessage list + composer"]
    UsersList["components/UsersList.jsx\npresence list"]

    LS[("localStorage\nuserInfo: {_id, username, isAdmin, token}")]
    SocketClient["socket.io-client\nio(apiURL, {auth:{user}})"]
    Axios["axios\n(Bearer token header)"]

    REST["Backend REST API"]
    WS["Backend Socket.IO server"]

    App --> LandingPage
    App --> Login
    App --> Register
    App --> PrivateRoute --> Chat
    Chat --> Sidebar
    Chat --> ChatArea
    ChatArea --> UsersList

    Login -- "on success: store token" --> LS
    PrivateRoute -- "read token" --> LS
    Sidebar -- "read token for headers" --> LS
    ChatArea -- "read token for headers" --> LS

    Sidebar -- "GET/POST /api/groups*" --> Axios
    ChatArea -- "GET/POST /api/messages*" --> Axios
    Login -- "POST /api/users/login" --> Axios
    Register -- "POST /api/users/register" --> Axios
    Axios --> REST

    Chat -- "creates socket on mount\ndisconnects on unmount" --> SocketClient
    SocketClient -- "join room / leave room\nnew message / typing / stop typing" --> WS
```

**Notes:**

- `utils.js` exports `apiURL` (`VITE_API_URL` env var, falling back to
  `http://localhost:5000`) — the single place both `axios` calls and the
  Socket.IO client get the backend origin from.
- Auth state isn't in a React Context — components read `userInfo` directly
  from `localStorage` on demand (`JSON.parse(localStorage.getItem("userInfo"))`).
  `PrivateRoute` gates the `/chat` route; there's no route-level protection
  beyond that (e.g. no redirect-if-already-logged-in on `/login`).
- `Chat.jsx` owns the single Socket.IO connection for the session and passes
  it down as a prop to `ChatArea`; `Sidebar` and `ChatArea` never construct
  a socket themselves.
