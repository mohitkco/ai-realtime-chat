# server/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first for efficient layer caching
COPY package*.json ./
RUN npm install

# Copy source code and Prisma schemas
COPY . .

# Generate the Prisma database client engines internally
RUN npx prisma generate

EXPOSE 8080

CMD ["node", "src/index.js"]