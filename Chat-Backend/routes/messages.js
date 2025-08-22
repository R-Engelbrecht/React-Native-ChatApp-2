const express = require('express');
const sql = require('mssql');

const router = express.Router();

router.post('/api/messages', async (req, res) => {
  const { senderID, receiverID, message, timestamp } = req.body;

  try {
    await sql.query(`
      INSERT INTO messages (senderID, receiverID, message, timestamp)
      VALUES (@senderID, @receiverID, @message, @timestamp)
    `, {
      senderID: { type: sql.Int, value: senderID },
      receiverID: { type: sql.Int, value: receiverID },
      message: { type: sql.NVarChar, value: message },
      timestamp: { type: sql.DateTime, value: new Date(timestamp) }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving message:", error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;