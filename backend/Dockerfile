# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Copy lock files first for better layer caching
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code
# (In development, this is overridden by the bind mount in docker-compose.yml)
COPY src/ ./src/

EXPOSE 5000

CMD ["npm", "start"]
