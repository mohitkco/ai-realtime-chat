// server/db.js
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// ✅ FIXED: Read the dynamic Docker database url connection string, or fallback to local localhost
const connectionString = process.env.DATABASE_URL || "postgresql://mohit_admin:secure_password_123@localhost:5432/chatapp_db?schema=public";

const pool = new Pool({
  connectionString: connectionString
});

const adapter = new PrismaPg(pool);

// Inject the dynamic adapter configuration into the client instance constructor
const prisma = new PrismaClient({ adapter });

module.exports = prisma;