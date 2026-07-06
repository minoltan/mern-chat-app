const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { join } = require("path");
const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

// Serve static files from public directory
app.use(express.static(join(__dirname, "public")));

// Serve the index.html
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

// Listen to connection from client
io.on("connection", (socket) => {
  console.log("A user connected");

  // Handle room joining
  socket.on("joinRoom", (room) => {
    console.log(Array.from(socket.rooms)[0]);

    // Join new room without leaving previous ones
    socket.join(room);
    socket.emit("messageFromServer", `You joined ${room}`);
    socket.to(room).emit("messageFromServer", `A user has joined ${room}`);
  });

  // Handle room leaving
  socket.on("leaveRoom", () => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.leave(room);
      socket.emit("messageFromServer", `You left ${room}`);
      socket.to(room).emit("messageFromServer", `A user has left ${room}`);
    }
  });

  // Modify message handling for rooms
  socket.on("messageFromClient", (message) => {
    const room = Array.from(socket.rooms)[1];
    if (room) {
      socket.to(room).emit("messageFromServer", message);
    }
  });
});

// Start the server
server.listen(PORT, () => console.log(`Server is running on ${PORT}`));
