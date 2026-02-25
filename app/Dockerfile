FROM node:20-slim AS base

WORKDIR /app

# Copy package files (without lockfile — lockfile from macOS lacks Linux binaries)
COPY package.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all dependencies fresh for Linux platform
RUN npm install

# Copy source code
COPY . .

# Build client and server
RUN npm run build

# Production stage
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package.json ./
COPY server/package.json server/

# Install production dependencies only
RUN npm install --omit=dev -w server && npm install --omit=dev

# Copy built artifacts
COPY --from=base /app/client/dist client/dist
COPY --from=base /app/server/dist server/dist

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
