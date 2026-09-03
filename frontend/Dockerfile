# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Copy lock files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Source code is bind-mounted at runtime via docker-compose.yml,
# so we do NOT COPY the source here for development.
# The node_modules installed above will be preserved by the
# anonymous volume defined in docker-compose.yml.

EXPOSE 3000

CMD ["npm", "run", "dev"]
