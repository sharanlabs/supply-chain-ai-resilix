import { rm } from "node:fs/promises";
import path from "node:path";

await rm(path.join(process.cwd(), ".next", "dev", "types"), {
  force: true,
  recursive: true
});
