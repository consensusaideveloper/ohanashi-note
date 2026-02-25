# Dev

Start the development server (client + server).

## Steps

1. Check if ports 3000 or 5173 are already in use:
   - Run `lsof -ti :3000` and `lsof -ti :5173`
   - If any processes are found, kill them with `kill -9`
2. Run `cd app && npm run dev`
3. If the server fails with `EADDRINUSE`:
   - Kill the process occupying the port shown in the error
   - Re-run `cd app && npm run dev`
4. If the server fails with an esbuild version mismatch (`Host version does not match binary version`):
   - Run `cd app && rm -rf node_modules package-lock.json && npm install`
   - Re-run `cd app && npm run dev`
5. Confirm both `[client]` and `[server]` show successful startup messages
