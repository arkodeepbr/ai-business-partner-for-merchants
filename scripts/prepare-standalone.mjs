import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");

for (const [sourcePath, targetPath] of [
  ["public", resolve(standalone, "public")],
  [".next/static", resolve(standalone, ".next/static")],
]) {
  const source = resolve(root, sourcePath);
  await mkdir(resolve(targetPath, ".."), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await cp(source, targetPath, { recursive: true, force: true });
}
