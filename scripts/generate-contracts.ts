// Writes contracts/*.schema.json from components/rally-player/contract.ts.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contractFiles } from "../components/rally-player/contract-files.ts";

const directory = join(import.meta.dirname, "../contracts");
for (const [name, text] of Object.entries(contractFiles())) {
  await writeFile(join(directory, name), text);
  console.log(`wrote contracts/${name}`);
}
