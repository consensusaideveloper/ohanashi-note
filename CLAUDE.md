# CLAUDE.md - Project Rules

## Project Overview

Voice conversation web app for elderly Japanese users (60-80 years old).
AI assistant "Midori-san" helps create ending notes through natural conversation.
Monorepo: `app/client/` (React + Vite) and `app/server/` (Hono + Node.js).

## Commands

- `cd app && npm run dev` — Start both client and server in development mode
- `cd app && npm run build` — Build both client and server for production
- `cd app && npm run lint` — Run ESLint on all source files
- `cd app && npm run typecheck` — Run TypeScript type checking
- `cd app && npm run test` — Run all tests with Vitest

## TypeScript Rules

- `strict: true` — no exceptions
- No `any` type. Use `unknown` and narrow with type guards.
- No non-null assertions (`!`). Use proper null checks.
- All function parameters and return types must be explicitly typed.
- Prefer `interface` for object shapes, `type` for unions/intersections.
- No magic numbers or strings. Extract meaningful literals into named constants (e.g., `MAX_RECONNECT_ATTEMPTS = 3`, `PREVIEW_LENGTH = 80`). Obvious values like `0`, `1`, `""`, array indices are acceptable.

## File Organization

- One component per file. File name matches the export name.
- React components: PascalCase (e.g., `ConversationButton.tsx`)
- Hooks: camelCase prefixed with `use` (e.g., `useConversation.ts`)
- Utilities/lib: camelCase (e.g., `audio.ts`)
- Constants: camelCase file, UPPER_SNAKE_CASE for exported constants

## Import Ordering

1. React/framework imports
2. Third-party library imports
3. Internal absolute imports
4. Relative imports
5. Type-only imports (`import type`)

Blank line between each group.

## Language

- All code, comments, variable names, and file names: **English**
- All user-facing UI text: **Japanese**
- Commit messages: English
- Reusable Japanese UI text (error messages, status messages, common labels) must be defined as constants in `lib/constants.ts` (e.g., `UI_MESSAGES`), not hardcoded inline in components. Component-specific one-off labels are acceptable inline.

## React Patterns

- Functional components only
- Named exports (no default exports except App.tsx)
- Props interface: `{ComponentName}Props`, defined above the component
- Destructure props in function signature
- Event handlers: `handle{Event}` (e.g., `handleClick`)
- No inline function definitions in JSX — extract to named handlers
- No browser native dialogs (`alert`, `confirm`, `prompt`). Always use custom-designed dialog components that match the app's design system and meet accessibility requirements for elderly users.
- When similar UI patterns or functionality appear in 2+ places, extract them into a shared component first. Prioritize reusable components (buttons, cards, badges, dialogs, empty states, etc.) over duplicating styles inline.

## Hono Server Patterns

- Route files export a Hono sub-app, mounted in index.ts
- All async route handlers must have try/catch
- Environment variables accessed only through `lib/config.ts`, never `process.env` directly
- All WebSocket message handling wrapped in try/catch

## Error Handling

### General

- Never throw raw strings. Always throw Error objects.
- User-facing errors: Always in Japanese, always friendly, never technical. Elderly users (60-80) must not feel anxious — use reassuring, actionable language.

### Server-side (Hono)

- All async route handlers must have try/catch (also listed in Hono Server Patterns).
- Return `{ error: string, code: string }` JSON on failure. `error` is a Japanese user-friendly message, `code` is a machine-readable identifier.
- Use `logger.error("context", { key: value })` with structured metadata (IDs, error message) for developer debugging. Never log raw request bodies or credentials.
- Error messages thrown internally must be in Japanese (e.g., `throw new Error("ユーザー情報の取得に失敗しました")`).

### Client-side API layer

- Use `ApiError` class (`lib/api.ts`) for API call failures. `ApiError` carries `status` and `responseBody` for developer debugging, while its `message` stays generic ("API request failed") — never expose HTTP status codes or response bodies to users.
- Check error types with `error instanceof ApiError && error.status === 404`, not string matching on `error.message`.

### Client-side CRUD operations

Every CRUD operation (save, update, delete, export, import) must follow this pattern:

1. **`.catch()` on every Promise** — No CRUD Promise chain may lack a `.catch()`. Silent failures are forbidden.
2. **User feedback via Toast** — Use the `Toast` component + `useToast` hook for non-blocking operation feedback (success/error). Define all messages as constants in `UI_MESSAGES` (`lib/constants.ts`).
3. **Developer logging** — Every `.catch()` must include `console.error("context:", { error, ...ids })` with structured context (relevant IDs, operation name). Never log sensitive user data.
4. **UI state reset on error** — If the operation sets a loading/progress state (e.g., `isExporting`), always reset it in `.catch()` or `.finally()` to prevent stuck UI.

### Client-side data loading

Every data-fetching hook/component must follow this pattern:

1. **`error` state in hooks** — Data hooks (e.g., `useEndingNote`) must expose an `error: boolean` in their return type. Set `true` in `.catch()`, reset to `false` at the start of each load.
2. **Error UI with retry** — When `error` is `true`, show a user-friendly message (from `UI_MESSAGES.error`) + a "もう一度読み込む" retry button. Never show an empty screen on load failure.
3. **Developer logging** — Same structured `console.error` pattern as CRUD operations.

### Bulk operations (import/delete multiple items)

- Use continue-on-error loops: wrap each individual operation in its own try/catch inside the loop. Collect failures, continue processing remaining items.
- After the loop, if any failures occurred, throw a single Error summarizing the failure count.

### Developer observability

- Global `unhandledrejection` handler in `main.tsx` logs to `console.error` for catching missed Promise rejections. Never show these to users.
- WebSocket message parse errors must be logged with `console.error` including truncated raw data (max 200 chars).

## Tailwind CSS

- Mobile-first: base styles for mobile, `md:` / `lg:` for larger screens
- Minimum touch target: 44px (`min-h-11 min-w-11`)
- Elderly users: minimum text `text-lg` (18px), prefer `text-xl` (20px)
- Text hierarchy: page title (`h1`) = `text-2xl md:text-3xl font-bold`, section heading (`h2`/`h3`) = `text-lg font-semibold`, body = `text-lg`, sub-body = `text-base`
- Color contrast: minimum 4.5:1 ratio
- **Design tokens**: All colors, border-radius values, and gradients must use the semantic tokens defined in `app.css` `@theme`. Do not use Tailwind default colors (`green-600`, `amber-200`, `red-50`, etc.) or hardcoded hex values in components. If a needed token doesn't exist, add it to `@theme` first, then reference it.
- **Font consistency**: The project font (`Noto Sans JP`) is defined in `app.css`. Do not add per-component `font-family` overrides or import additional font families.
- **Icons**: Use inline SVGs for icons. Do not add icon library dependencies (e.g., Lucide, Heroicons, Font Awesome).
- Use standard Tailwind spacing utilities (`min-h-11`, `min-w-11`) instead of arbitrary values (`min-h-[44px]`). Use `rounded-card` for card-like containers instead of `rounded-[20px]`.

## Accessibility

- Use semantic HTML elements (`<button>`, `<a>`, `<input>`) for interactive elements. Never use `<div>` or `<span>` with click handlers as button substitutes.
- All icon-only buttons must have `aria-label` in Japanese describing the action (e.g., `aria-label="戻る"`).
- Interactive elements must have visible `:focus-visible` styles for keyboard navigation.
- Use appropriate ARIA attributes (`aria-expanded`, `aria-checked`, `aria-live`) for dynamic UI state (accordions, toggles, filters, live updates).

## Security

- NEVER expose the OpenAI API key to the client
- No `eval()`, no `innerHTML`, no `dangerouslySetInnerHTML`
- All user input through the relay must be sanitized for sensitive patterns
- WebSocket connections must validate Origin header
- Never expose HTTP status codes, API response bodies, or stack traces in user-facing UI. Use `ApiError` class to keep technical details in developer-only properties.

## Voice Tools (AI Function Calling)

- Voice tool definitions live in `client/src/lib/constants.ts` (`REALTIME_TOOLS` array).
- The AI system prompt references tools in `client/src/lib/prompt-builder.ts` (`TOOL_AWARENESS_PROMPT`).
- Tool execution logic is in `client/src/hooks/useConversation.ts` (`handleFunctionCall`, `dispatchVoiceAction`).
- Voice action callbacks are defined in `client/src/contexts/VoiceActionContext.tsx` and implemented in `App.tsx`.
- **Documentation**: All voice tools are documented in `docs/voice-automation-spec.md`. When adding, removing, or modifying a voice tool, **all of the following must be updated together**:
  1. Tool definition in `REALTIME_TOOLS` (`constants.ts`)
  2. Tool awareness prompt (`TOOL_AWARENESS_PROMPT` in `prompt-builder.ts`)
  3. Handler in `handleFunctionCall` / `dispatchVoiceAction` (`useConversation.ts`)
  4. Callback interface and implementation (`VoiceActionContext.tsx`, `App.tsx`) — if the tool dispatches via voice actions
  5. Documentation in `docs/voice-automation-spec.md` (tool table, parameters, scenario, tier classification)

## Session Limits

- Session limits (daily count, duration) are enforced **server-side** (`server/src/lib/session-limits.ts`). Client-side limits in `client/src/lib/constants.ts` are for UX only and must be kept in sync with the server values.
- Active sessions are tracked in-memory (`session-tracker.ts`), so a server restart resets the active count. Completed sessions persist in the DB and are unaffected.

## Git

- Branch: `feature/{description}`, `fix/{description}`
- Commit format: `type: description` (feat, fix, refactor, test, chore, docs)
- One logical change per commit

## Verification Protocol

After any implementation work, run the full verification suite before marking work as complete:

1. `cd app && npm run format` — Format all files
2. `cd app && npm run lint` — Check for linting errors
3. `cd app && npm run typecheck` — Check for type errors
4. `cd app && npm run build` — Verify production build
5. `cd app && npm run test` — Run all tests

**Rules:**
- All five checks must pass before marking work as complete
- Fix all errors before committing — never commit broken code
- Use `/verify` to run all checks in sequence

## Testing

- Test files live alongside source files: `*.test.ts` / `*.test.tsx`
- Use `describe` / `it` / `expect` from Vitest
- Client tests run in `jsdom` environment, server tests run in `node`
- Run tests: `cd app && npm run test`
- Run a single test file: `cd app && npx vitest run path/to/file.test.ts`

## Database

- ORM: Drizzle with PostgreSQL
- Schema defined in `app/server/src/db/schema.ts`
- Migrations in `app/server/src/db/migrations/`
- Generate migration: `cd app/server && npx drizzle-kit generate`
- Push to database: `cd app/server && npx drizzle-kit push`
- `connection.ts` reads `DATABASE_URL` directly from `process.env` (standard for DB connection setup; this is the one exception to the config.ts rule)

## Deployment

- Server + DB: Railway
- Client static files: served by Hono in production (`serveStatic` from `../client/dist`)
- Media storage: Cloudflare R2
- Auth: Firebase Authentication
- Environment configs: `.env` (local), `.env.staging`, `.env.production` — none committed to git
- `.env.example` is the template for required environment variables
