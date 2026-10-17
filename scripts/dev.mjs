import { fileURLToPath, pathToFileURL } from "node:url";

// Watchpack's native macOS watcher can exhaust available file-watch handles in
// this source tree. Polling keeps Next's dev server responsive and HMR active.
process.env.WATCHPACK_POLLING ??= "1000";

const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
process.argv = [process.execPath, nextBin, "dev", "--webpack", ...process.argv.slice(2)];
await import(pathToFileURL(nextBin).href);
