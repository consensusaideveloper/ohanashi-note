# Migration Operations

## Current command set

Run from `/Users/y-masamura/develop/conversational-ai-research/app`.

- `npm run db:migrate:status`
  - Show which SQL files under `app/server/src/db/migrations` are already recorded in the migration ledger.
- `npm run db:migrate`
  - Apply pending SQL files in filename order.
- `npm run db:migrate:baseline -- --through 0017_fair_onboarding_gate`
  - Mark existing migrations as already applied without executing SQL.

## Ledger table

This repository now tracks migration execution in `schema_migrations`.

- `filename`
- `applied_at`

The app previously had raw SQL files but no execution ledger. That made it impossible to tell whether a DB had already received a schema change.

## Existing environments

If an environment was updated manually before this script existed:

1. Verify the target schema is already present.
2. Run `npm run db:migrate:baseline -- --through <latest_migration_tag>`.
3. After that, use `npm run db:migrate` normally.

For the current account deletion and onboarding rollout, the baseline point is:

- `0017_fair_onboarding_gate`

## Notes

- The script reads `DATABASE_URL` from `app/.env`.
- In `production`, SSL is enabled automatically.
- `baseline` only records execution state. It does not modify schema.
