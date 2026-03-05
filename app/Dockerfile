FROM node:20-slim AS base

WORKDIR /app

# Copy package files + lockfile for deterministic dependency resolution
COPY package.json ./
COPY package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/

# Install all dependencies exactly as locked, including optional native packages
RUN npm ci --include=optional

# Copy source code
COPY . .

# Accept VITE_* build args so Vite can embed them into the client bundle
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID

# Build client and server
RUN npm run build

# Production stage
FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

# Copy package files + lockfile
COPY package.json ./
COPY package-lock.json ./
COPY server/package.json server/

# Install production dependencies only
RUN npm install --omit=dev -w server && npm install --omit=dev

# Copy built artifacts
COPY --from=base /app/client/dist client/dist
COPY --from=base /app/server/dist server/dist

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
