# Frontend Setup

## Prerequisites

- Node.js (v18+ recommended)
- The backend running locally on port 5000 (see `mern-chat-backend/docs/SETUP.md`)

## 1. Install dependencies

```bash
cd mern-chat-frontend
npm install
```

## 2. Configure the API URL

The frontend does not use environment variables — the backend URL is
hardcoded in [`utils.js`](../utils.js):

```js
const apiURL = "http://localhost:5000";
export default apiURL;
```

This is used both for REST calls (via `axios`) and as the Socket.IO
connection endpoint (`src/pages/Chat.jsx`). If your backend runs on a
different host/port (e.g. a deployed API), update this value accordingly.

## 3. Run the dev server

```bash
npm run dev
```

Vite will start on its default port (`5173`) and print the local URL. This
matches one of the CORS origins already allowed by the backend
(`mern-chat-backend/server.js`).

## 4. Verify

- Open the printed local URL (e.g. http://localhost:5173) in the browser.
- `/` — landing page
- `/register` — create an account
- `/login` — log in (stores `userInfo`, including the JWT, in `localStorage`)
- `/chat` — protected route (see `src/components/PrivateRoute.jsx`); redirects
  unauthenticated users back to login

## Other scripts

```bash
npm run build     # production build
npm run preview   # preview the production build locally
npm run lint      # run eslint
```
