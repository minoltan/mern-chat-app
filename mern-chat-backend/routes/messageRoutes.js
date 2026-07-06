const express = require("express");
const Message = require("../models/ChatModel");
const { protect } = require("../middleware/authMiddleware");

const messageRouter = express.Router();

/**
 * @swagger
 * /messages:
 *   post:
 *     summary: Send a message to a group
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content, groupId]
 *             properties:
 *               content: { type: string }
 *               groupId: { type: string }
 *     responses:
 *       200:
 *         description: The created, populated message
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Message' }
 */
//send message
messageRouter.post("/", protect, async (req, res) => {
  try {
    const { content, groupId } = req.body;
    const message = await Message.create({
      sender: req.user._id,
      content,
      group: groupId,
    });
    const populatedMessage = await Message.findById(message._id).populate(
      "sender",
      "username email"
    );
    res.json(populatedMessage);
  } catch (error) {
    res.status(400).json({ message: error.Message });
  }
});

/**
 * @swagger
 * /messages/{groupId}:
 *   get:
 *     summary: Get all messages for a group, oldest first
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Message' }
 */
//get messages for a group
messageRouter.get("/:groupId", protect, async (req, res) => {
  try {
    const messages = await Message.find({ group: req.params.groupId })
      .populate("sender", "username email")
      .sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(400).json({ message: error.Message });
  }
});
module.exports = messageRouter;
