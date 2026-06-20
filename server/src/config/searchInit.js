// server/src/config/searchInit.js
const prisma = require('../../db');

const initializeVectorSearch = async () => {
  try {
    console.log("🔄 Initializing production database search extensions...");

    // 🎯 CHANGED FROM pgvector TO vector TO MATCH YOUR INSTALLED EXTENSION FILE
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // 2. Add a vector column to hold the 768-dimensional embeddings if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Message" 
      ADD COLUMN IF NOT EXISTS embedding vector(768);
    `);

    // 3. Create an HNSW index to speed up Cosine Similarity calculations
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS message_embedding_hnsw_idx 
      ON "Message" USING hnsw (embedding vector_cosine_ops);
    `);

    console.log("✅ Production database search layers successfully activated and indexed.");
  } catch (err) {
    console.error("⚠️ Search initialization notice (Columns may already exist):", err.message);
  }
};

module.exports = initializeVectorSearch;