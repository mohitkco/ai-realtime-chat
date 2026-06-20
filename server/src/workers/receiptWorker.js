// server/src/workers/receiptWorker.js
const { prisma, redisClient } = require('../config/db');

async function flushBufferedReceipts() {
  try {
    if (!redisClient.isOpen) return;

    // 1. Pull everything out of the real-time active receipts buffer
    const bufferedData = await redisClient.hGetAll('receipts:buffer');
    const fields = Object.keys(bufferedData);

    if (fields.length === 0) return;

    console.log(`\n🔄 Cron Worker: Processing ${fields.length} buffered read receipts...`);

    // 2. Map and parse incoming fields cleanly
    const operations = fields.map(field => {
      const [messageId, userId] = field.split(':');
      const status = bufferedData[field];
      return { field, messageId, userId, status };
    });

    // 3. 🎯 THE DEFENSIVE LOOKUP: Check which parent messages still exist on disk
    const uniqueMessageIds = [...new Set(operations.map(op => op.messageId))];
    const existingMessages = await prisma.message.findMany({
      where: { id: { in: uniqueMessageIds } },
      select: { id: true }
    });

    const activeMessageIdsSet = new Set(existingMessages.map(m => m.id));
    
    const validUpserts = [];
    const deadFieldsToRemove = [];

    // Separate active records from orphaned records
    operations.forEach(op => {
      if (activeMessageIdsSet.has(op.messageId)) {
        // Construct transaction payloads safely for active messages
        validUpserts.push(
          prisma.readReceipt.upsert({
            where: {
              // 🎯 THE MATCHING FIX: Flip the keys to exactly match your Prisma definitions
              messageId_userId: {
                messageId: op.messageId,
                userId: op.userId
              }
            },
            update: { status: op.status },
            create: {
              userId: op.userId,
              messageId: op.messageId,
              status: op.status
            }
          })
        );
      } else {
        // Queue deleted message indicators for Redis buffer evictions
        deadFieldsToRemove.push(op.field);
      }
    });

    // 4. Atomic execution batching over remaining active elements
    if (validUpserts.length > 0) {
      await prisma.$transaction(validUpserts);
      console.log(`💾 Cron Worker: Successfully flushed [${validUpserts.length}] active receipts to disk.`);
    }

    // 5. 🧹 HOUSEKEEPING: Evict orphaned tracking records out of memory RAM completely
    const keysToClean = [...validUpserts.map((_, i) => operations[i].field), ...deadFieldsToRemove];
    if (keysToClean.length > 0) {
      await redisClient.hDel('receipts:buffer', keysToClean);
    }

    if (deadFieldsToRemove.length > 0) {
      console.log(`🧹 Cron Worker: Cleaned ${deadFieldsToRemove.length} orphaned ticks out of Redis buffer layout.`);
    }

  } catch (err) {
    console.error("❌ Critical Exception encountered inside Read Receipt Flush Workflow:", err);
  }
}

// Export the cron execution handler sequence cleanly
module.exports = { flushBufferedReceipts };