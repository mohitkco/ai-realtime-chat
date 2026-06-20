// server/src/index.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const apiRoutes = require('./routes/api');
const { prisma, redisClient } = require('./config/db');
const initializeVectorSearch = require('./config/searchInit'); 
const { GoogleGenAI } = require('@google/genai');
// Change this line near the top of server/src/index.js:
const { flushBufferedReceipts } = require('./workers/receiptWorker'); 
// (or whatever your exact relative path to receiptWorker is)

const app = express();
app.use(cors({ origin: ["http://localhost","http://localhost:5173"], credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api', apiRoutes);

// Initialize the Google AI SDK wrapper for generating message embeddings
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "http://localhost:5173", credentials: true } });

// 🎯 CRITICAL FIX: Expose the global Socket.io instance to all Express routes/controllers
app.set('io', io);

const onlineUsers = new Map();

io.on('connection', (socket) => {

   // ... inside server/src/index.js right after io.on('connection', (socket) => { ...

  // 🎯 TELEMETRY: Increment concurrent active user counters in system RAM
  (async () => {
    try {
      if (redisClient.isOpen) {
        await redisClient.incr('telemetry:active_connections');
        await redisClient.incr('telemetry:total_socket_events');
      }
    } catch (err) {
      console.error("Telemetry connection log exception:", err);
    }
  })();

  // ... keep your existing socket.on('user_online'), join_room, etc. code completely intact ...

  // Look for your socket.on('disconnect') routine block and update it:
  socket.on('disconnect', () => {
    const disconnectedUser = onlineUsers.get(socket.id);
    if (disconnectedUser) {
      onlineUsers.delete(socket.id);
      io.emit('online_users_list', Array.from(onlineUsers.values()));
    }

    // 🎯 TELEMETRY: Decrement active counts cleanly on close connections
    (async () => {
      try {
        if (redisClient.isOpen) {
          await redisClient.decr('telemetry:active_connections');
        }
      } catch (err) {
        console.error("Telemetry disconnect log exception:", err);
      }
    })();
  });




  socket.on('user_online', (username) => {
    onlineUsers.set(socket.id, username);
    io.emit('online_users_list', Array.from(onlineUsers.values()));
  });

  socket.on('join_room', (roomId) => socket.join(roomId));

  socket.on('typing', (data) => {
    socket.to(data.room).emit('user_typing', { username: data.username });
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.room).emit('user_stop_typing', { username: data.username });
  });

  // REAL-TIME MESSAGE PIPELINE WITH DECOUPLED ASYNC VECTOR STORAGE
  socket.on('send_message', async (data) => {
    try {
      const user = await prisma.user.findUnique({ where: { username: data.senderName } });
      if (!user) return;

      const savedMsg = await prisma.message.create({
        data: { text: data.text, room: data.room, userId: user.id }
      });

      // BROADCAST IMMEDIATELY
      io.to(data.room).emit('receive_message', {
        id: savedMsg.id,
        text: savedMsg.text,
        user: { name: user.username }
      });

      // 3. Fire-and-forget background embedding processing loop
      (async () => {
        const startTime = Date.now(); // ⏱️ Start Latency Timer
        try {
          const embeddingResponse = await ai.models.embedContent({
            model: 'gemini-embedding-001', 
            contents: data.text,
            config: { outputDimensionality: 768 }
          });
          
          let extractedValues = null;
          if (embeddingResponse.embedding?.values) {
            extractedValues = embeddingResponse.embedding.values;
          } else if (embeddingResponse.embeddings?.[0]?.values) {
            extractedValues = embeddingResponse.embeddings[0].values;
          }

          if (extractedValues && extractedValues.length === 768) {
            const vectorString = `[${extractedValues.join(',')}]`;
            const cleanHexId = savedMsg.id.replace(/-/g, '');
            const hexQuery = `
              UPDATE "Message" 
              SET "embedding" = '${vectorString}'::vector 
              WHERE "id" = '\\x${cleanHexId}';
            `;
            
            await prisma.$executeRawUnsafe(hexQuery);
            
            // 🎯 TELEMETRY: Calculate elapsed time and push tracking metrics directly to Redis RAM
            const duration = Date.now() - startTime;
            if (redisClient.isOpen) {
              await redisClient.lPush('telemetry:ai_latency_log', String(duration));
              await redisClient.lTrim('telemetry:ai_latency_log', 0, 99); // Keep last 100 updates max
              await redisClient.incr('telemetry:total_messages_processed');
            }
            console.log(`✅ Vector array successfully mapped to message row: ${savedMsg.id} (${duration}ms)`);
          }
        } catch (aiErr) {
          console.error("❌ Critical Background Vector Ingestion Exception:", aiErr.message);
        }
      })();

      // Clear memory buffers for cache integrity 
      if (redisClient.isOpen) {
        await redisClient.del(`messages:${data.room}`);
      }
  
    } catch (err) {
      console.error("❌ Main Message Ingest Loop Exception:", err);
    }
  });

  socket.on('delete_message', async (data) => {
    try {
      const targetMsg = await prisma.message.findUnique({
        where: { id: data.messageId },
        include: { user: true }
      });
      if (!targetMsg || targetMsg.user.username !== data.senderName) return;

      await prisma.message.delete({ where: { id: data.messageId } });

      if (redisClient.isOpen) {
        await redisClient.del(`messages:${data.room}`);
      }

      io.in(data.room).emit('message_deleted', { messageId: data.messageId });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    const disconnectedUser = onlineUsers.get(socket.id);
    if (disconnectedUser) {
      onlineUsers.delete(socket.id);
      io.emit('online_users_list', Array.from(onlineUsers.values()));
    }
  });
   
  // DISTRIBUTED STATE SYSTEM: OPTIMIZED READ-RECEIPT BUFFERING WITH CACHE INVALIDATION
  socket.on('mark_read', async (data) => {
    const { userId, messageId, roomId } = data;
    if (!userId || !messageId || !roomId) return;

    try {
      if (redisClient.isOpen) {
        const hashField = `${messageId}:${userId}`;
        await redisClient.hSet('receipts:buffer', hashField, 'READ');
        await redisClient.del(`messages:${roomId}`);
      }

      io.to(roomId).emit('message_status_updated', {
        messageId,
        userId,
        status: 'READ'
      });
    } catch (err) {
      console.error("❌ Redis Read Receipt Buffering Exception:", err);
    }
  });
});

const PORT = 8080;
server.listen(PORT, async () => {
  console.log(`🚀 Modular Server listening on port ${PORT}`);
  await initializeVectorSearch(); 
  
  // Update the background timeout loop around line 215 to look like this:
setInterval(async () => {
  try {
    // 🎯 THE FIX: Call the correct function name mapped from your worker file
    await flushBufferedReceipts(); 
  } catch (err) {
    console.error("Background runner execution error:", err);
  }
}, 2 * 60 * 1000); // Or whatever your interval cadence rate is set to
});