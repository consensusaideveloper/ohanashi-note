# Ohanashi Note (おはなしノート)

A voice conversation web app that helps elderly Japanese users (60-80 years old) create ending notes through natural dialogue with an AI assistant named Midori-san.

## Tech Stack

- **Client**: React 19, Vite, Tailwind CSS v4, Firebase Auth
- **Server**: Hono, Node.js, PostgreSQL (Railway), Drizzle ORM
- **AI**: OpenAI Realtime API (voice relay via WebSocket)
- **Auth**: Firebase Authentication (Google sign-in)
- **Infra**: Railway (server + DB), Cloudflare R2 (media storage)

## Project Structure

```
app/
  client/          # React + Vite frontend
    src/
      components/  # UI components
      contexts/    # React contexts (auth, font size)
      hooks/       # Custom hooks (conversation, audio, auth)
      lib/         # Utilities, constants, Firebase config
      types/       # TypeScript type definitions
  server/          # Hono + Node.js backend
    src/
      db/          # Drizzle schema + migrations
      lib/         # Config, logger, Firebase Admin
      middleware/   # Auth middleware
      routes/      # API + WebSocket routes
      services/    # OpenAI relay, sanitizer, summarizer
  e2e/             # Playwright end-to-end tests
docs/              # Research and planning documents
```

## Prerequisites

- Node.js >= 20
- npm >= 10
- PostgreSQL database (Railway recommended)
- Firebase project with Authentication enabled
- OpenAI API key with Realtime API access

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/consensusaideveloper/ohanashi-note.git
   cd ohanashi-note
   ```

2. Install dependencies:
   ```bash
   cd app
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Fill in your API keys and credentials
   ```

4. Run database migrations:
   ```bash
   cd server
   npx drizzle-kit push
   ```

5. Start development servers:
   ```bash
   cd app
   npm run dev
   ```
   This starts both the client (http://localhost:5173) and server (http://localhost:3000).

## Scripts

All scripts are run from the `app/` directory:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server in dev mode |
| `npm run build` | Production build (client + server) |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run all tests (Vitest) |
| `npm run format` | Format with Prettier |

## Documentation

Research and design documents are in the [`docs/`](docs/) directory:

- [MVP Tech Decisions](docs/mvp-tech-decisions.md)
- [Data Storage Architecture](docs/data-storage-architecture.md)
- [Realtime API MVP Plan](docs/realtime-api-mvp-plan.md)
- [Realtime UX Design](docs/realtime-ux-design.md)
- [Implementation Schedule](docs/implementation-schedule.md)

## License

Private repository. All rights reserved.
