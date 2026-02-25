FROM node:20-slim AS base

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all dependencies (npm install handles platform differences)
RUN npm install

# Copy source code
COPY . .

# Build client and server
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY server/package.json server/

# Install production dependencies only
RUN npm install --omit=dev -w server && npm install --omit=dev

# Copy built artifacts
COPY --from=base /app/client/dist client/dist
COPY --from=base /app/server/dist server/dist

# Copy server source for migrations (if needed)
COPY --from=base /app/server/src/db/migrations server/src/db/migrations

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
