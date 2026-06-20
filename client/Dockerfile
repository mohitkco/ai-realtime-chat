# client/Dockerfile
# Stage 1: Compile React workspace using Vite
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve compiled build artifacts directly via Nginx container
FROM nginx:alpine
# Copy our custom production configuration rules file into Nginx paths
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy compiled static assets from Stage 1 into the public server directory
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]