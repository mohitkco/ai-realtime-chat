// server/src/config/db.js
const prisma = require('../../db'); 
const { createClient } = require('redis');
const { Pool } = require('pg'); // ⚡ Import Pool to execute a raw bootstrap command

// Reuse the pool logic to execute a direct raw connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://mohit_admin:secure_password_123@localhost:5432/chatapp_db?schema=public"
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('❌ Redis Cache Client Error:', err));

const bootstrapDatabase = async () => {
  try {
    // 1. 🔥 THE FIX: Tell Postgres to explicitly activate the vector library inside this database
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('🧠 pgvector extension successfully activated inside PostgreSQL container.');

    // 2. Initialize Redis connection
    if (!redisClient.isOpen) {
      await redisClient.connect();
      console.log('⚡ Redis Cache Engine successfully connected to the cluster.');
    }
  } catch (err) {
    console.error('⚠️ Database system bootstrap check failed:', err.message);
  }
};

bootstrapDatabase();

module.exports = { prisma, redisClient };