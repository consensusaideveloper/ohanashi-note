# Verify

Run all quality checks: format, lint, type-check, build, and test.
Fix all errors before completing.

## Steps

1. Run `cd app && npm run format:check`
   - If formatting issues are found, run `cd app && npm run format` to fix them
2. Run `cd app && npm run lint`
   - If errors are found, fix them and re-run until clean
3. Run `cd app && npm run typecheck`
   - If errors are found, fix them and re-run until clean
4. Run `cd app && npm run build`
   - If errors are found, fix them and re-run until clean
5. Run `cd app && npm run test`
   - If tests fail, fix them and re-run until all pass
6. Report the final status of all checks

All five checks must pass before marking verification as complete.
