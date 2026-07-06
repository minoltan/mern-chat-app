const express = require("express");
const { createServer } = require("http");
const { join } = require("path");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

//Serve the static files from the public folder
app.use(express.static(join(__dirname, "public")));
//serve the index.html
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

//Listen to connection from client
io.on("connection", (socket) => {
  console.log("A user connected");
  //Emit a message to the client
  socket.emit("messageFromServer", "Hello from the server");
  //Listen for a message from client
  socket.on("messageFromClient", (message) => {
    console.log("Message received from client", message);
    //Broadcast the message to all connected clients except the sender
    socket.broadcast.emit("messageFromServer", message);
  });

  //Acknowledgement
  //Send greeting with acknowledgement
  socket.emit("greeting", "Hey there! Welcome to the server", (response) => {
    console.log("The client has received the message", response);
  });
});
//start the server
server.listen(PORT, console.log("Server is up and running on port", PORT));
