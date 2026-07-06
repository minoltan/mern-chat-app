const socket = io();
const messageArea = document.getElementById("messageArea");
const messageInput = document.getElementById("messageInput");
const roomInput = document.getElementById("roomInput");
const currentRoomDiv = document.getElementById("currentRoom");
let currentRoom = null;

// Display server messages
socket.on("messageFromServer", (message) => {
  addMessage(`Other: ${message}`, "server");
});

// Function to join a room
function joinRoom() {
  const room = roomInput.value.trim();
  if (room) {
    socket.emit("joinRoom", room);
    currentRoom = room;
    currentRoomDiv.textContent = `Current Room: ${room}`;
    roomInput.value = "";
  }
}

// Function to leave the current room
function leaveRoom() {
  if (currentRoom) {
    socket.emit("leaveRoom");
    currentRoom = null;
    currentRoomDiv.textContent = "Current Room: None";
  }
}

// Function to send messages
function sendMessage() {
  const message = messageInput.value.trim();
  if (message) {
    if (!currentRoom) {
      addMessage("Please join a room first", "server");
      return;
    }
    socket.emit("messageFromClient", message);
    addMessage(`You: ${message}`, "client");
    messageInput.value = "";
  }
}

// Function to add messages to the chat
function addMessage(message, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}-message`;
  messageDiv.textContent = message;
  messageArea.appendChild(messageDiv);
  messageArea.scrollTop = messageArea.scrollHeight;
}

// Allow sending messages with Enter key
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Add event listener for the send button
document.querySelector(".send-button").addEventListener("click", sendMessage);
