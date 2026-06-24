// server/prisma.config.js
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Pass your database connection URL straight to the Prisma v7 engine here
    url: "postgresql://mohit_admin:secure_password_123@postgres:5432/chatapp_db?schema=public",
  },
});