# Build

Build the project and fix any compilation errors.

## Steps

1. Run `cd app && npm run build`
2. If there are errors:
   - **TypeScript errors**: Read the error output, fix each error in the source files
   - **Native module errors** (e.g., `Cannot find module '../lightningcss.darwin-arm64.node'` or esbuild `Host version does not match binary version`): Run `cd app && rm -rf node_modules package-lock.json && npm install`, then retry
   - **Other build errors**: Read the error output carefully and fix
3. Re-run `cd app && npm run build`
4. Repeat until the build succeeds with zero errors
5. Report the final build status
