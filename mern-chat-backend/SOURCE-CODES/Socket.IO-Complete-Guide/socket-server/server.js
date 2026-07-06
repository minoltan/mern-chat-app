const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { join } = require("path");
const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

//Serve the assets
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});
//Listen to connection from client
io.on("connection", (socket) => {
  console.log("A user connected");
  //Emit a message the client
  socket.emit("messageFromServer", "Hello from the server");
  //Listen for a message from the client
  socket.on("messageFromClient", (message) => {
    console.log("Received from client", message);
  });
});
//Start the server
server.listen(PORT, console.log(`Server is running on ${PORT}`));
