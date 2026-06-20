// server/src/controllers/messageController.js
const { prisma, redisClient } = require('../config/db');

exports.getChatHistory = async (req, res) => {
  try {
    const { roomName } = req.params;
    const tokenUsername = req.user?.username;
    
    if (!tokenUsername) return res.status(401).json({ error: "Unauthorized" });

    // 0. Resolve the definitive logged-in user record to get their absolute database ID
    const dbUser = await prisma.user.findUnique({ where: { username: tokenUsername } });
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    const cacheKey = `messages:${roomName}`;
    let historicalMessages = [];

    // 1. Try to read from the fast Redis RAM cache layer first
    if (redisClient.isOpen) {
      const cachedData = await redisClient.get(cacheKey);
      if (cachedData) {
        console.log(`⚡ [Redis Cache HIT]: Retrieved history for room: #${roomName} straight from RAM.`);
        historicalMessages = JSON.parse(cachedData);
      }
    }

    // 2. [Cache MISS]: Fallback to querying your main PostgreSQL database
    if (!historicalMessages || historicalMessages.length === 0) {
      console.log(`💾 [Redis Cache MISS]: Fetching history for room: #${roomName} from PostgreSQL database logs.`);
      
      const dbMessages = await prisma.message.findMany({
        where: { room: roomName },
        include: { 
          user: { select: { username: true } },
          readReceipts: {
            select: { userId: true, status: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      // Format data while keeping the read receipt mapping structure completely intact
      historicalMessages = dbMessages.map(m => ({
        id: m.id,
        text: m.text,
        user: { name: m.user ? m.user.username : "Unknown" },
        readReceipts: m.readReceipts || [] 
      }));

      // Cache the complete, structured data array back to Redis for 5 minutes
      if (redisClient.isOpen && historicalMessages.length > 0) {
        await redisClient.setEx(cacheKey, 300, JSON.stringify(historicalMessages));
      }
    }

    // 3. THE REAL-TIME HYBRID BRIDGE (Overlay uncommitted real-time ticks from Redis)
    if (redisClient.isOpen) {
      const bufferedReceipts = await redisClient.hGetAll('receipts:buffer');
      const fields = Object.keys(bufferedReceipts);

      if (fields.length > 0) {
        historicalMessages = historicalMessages.map((msg) => {
          const receipts = [...(msg.readReceipts || [])];
          
          fields.forEach((field) => {
            const [messageId, userId] = field.split(':');
            const status = bufferedReceipts[field];

            if (msg.id === messageId) {
              const exists = receipts.some(r => r.userId === userId);
              if (!exists) {
                receipts.push({ userId, status });
              }
            }
          });

          return { ...msg, readReceipts: receipts };
        });
      }
    }
  
    // 4. 🎯 THE PLURALIZED WHATSAPP FILTER LAYER
    // Look for the model using Prisma's standard pluralization rules
    const accessor = prisma.deletedMessages || prisma.deletedMessage || prisma.DeletedMessage;
    
    if (!accessor) {
      // 💡 DEBUG HELPER: Print your exact database keys to the terminal so we can read what Prisma named it
      console.log("🔍 [Prisma Debug] Available client models are:", Object.keys(prisma).filter(k => !k.startsWith('_')));
      throw new Error("Prisma Client cannot locate model definition structures matching 'deletedMessage'. Check schema.prisma entries.");
    }

    // Fetch all message IDs this specific user has bookmarked for deletion
    const personalDeletions = await accessor.findMany({
      where: { userId: dbUser.id },
      select: { messageId: true }
    });

    // Extract the raw message IDs into a high-performance Set for O(1) lookups
    const deletedMessageIds = new Set(personalDeletions.map(d => d.messageId));

    // Filter down the array in memory so only non-deleted messages are returned to this client
    const visibleMessages = historicalMessages.filter(msg => !deletedMessageIds.has(msg.id));

    return res.json(visibleMessages);
 
  } catch (err) {
    console.error("❌ Critical Error inside Unified History Controller:", err);
    return res.json([]);
  }
};


exports.clearPersonalChatHistory = async (req, res) => {
  try {
    const { roomName } = req.params;
    const tokenUsername = req.user?.username;

    if (!tokenUsername) return res.status(401).json({ error: "Unauthorized" });

    // 1. Resolve the definitive logged-in user record
    const dbUser = await prisma.user.findUnique({ where: { username: tokenUsername } });
    if (!dbUser) return res.status(404).json({ error: "User not found" });

    // 2. Fetch all message IDs currently inside this specific room
    const currentMessages = await prisma.message.findMany({
      where: { room: roomName },
      select: { id: true }
    });

    if (currentMessages.length === 0) {
      return res.json({ message: "CHAT_ALREADY_CLEAN" });
    }

    // 3. THE FIXED WHATSAPP TRICK: Map accessors dynamically using the plural fallback
    const accessor = prisma.deletedMessages || prisma.deletedMessage || prisma.DeletedMessage;
    if (!accessor) {
      throw new Error("Prisma Client cannot locate model definition structures matching 'deletedMessage'.");
    }

    await accessor.createMany({
      data: currentMessages.map(msg => ({
        userId: dbUser.id,
        messageId: msg.id
      })),
      skipDuplicates: true
    });

    // 4. Clear out the Redis cache key for this room so the user forces a database filter re-sync next request
    if (redisClient.isOpen) {
      await redisClient.del(`messages:${roomName}`);
    }

    return res.json({ message: "PERSONAL_CHAT_CLEARED" });
  } catch (err) {
    console.error("❌ Error inside clearPersonalChatHistory:", err);
    return res.status(500).json({ error: err.message });
  }
};