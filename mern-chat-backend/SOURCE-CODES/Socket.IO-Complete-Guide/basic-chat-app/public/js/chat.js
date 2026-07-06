//Instance of socket
const socket = io();
//select elements
const sendButton = document.querySelector(".send-button");
const messageArea = document.querySelector("#messageArea");
const messageInput = document.querySelector("#messageInput");

//Add message
function addMessage(message, sender) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}-message`;
  messageDiv.textContent = message;
  messageArea.appendChild(messageDiv);
  messageArea.scrollTop = messageArea.scrollHeight;
}

//Display server messages
socket.on("messageFromServer", (message) => {
  addMessage(message, "server");
});

//Send message to the server
function sendMessage() {
  const message = messageInput.value.trim();
  if (message) {
    socket.emit("messageFromClient", message);
    addMessage(message, "client");
    messageInput.value = "";
  }
}

sendButton.addEventListener("click", sendMessage);

//Handle server greeting with acknowledgement
socket.on("greeting", (message, callback) => {
  console.log("Received greeting", message);

  //send acknowledgement back to the server
  callback({
    status: "received",
    message: "Thanks for the greeting",
    timestamp: new Date(),
  });
});
