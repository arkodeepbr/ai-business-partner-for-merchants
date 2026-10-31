import nextEnv from "@next/env";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// The standalone output intentionally omits local secret files. Load them from
// the project root before Next's server starts so local API routes receive the
// same server-only keys as `next dev` / `next start`.
nextEnv.loadEnvConfig(process.cwd());
await import(pathToFileURL(resolve(process.cwd(), ".next/standalone/server.js")).href);
