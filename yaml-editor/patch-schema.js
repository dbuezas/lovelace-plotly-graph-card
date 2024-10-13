import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.join(__dirname, "src/schema.json"); // Create relative path for reading

const patched = fs
  .readFileSync(file)
  .toString()
  .replaceAll(
    "^.*\\\\$ex\\\\$fn_REPLACER$",
    "^[\\\\s]*\\\\$(ex|fn)\\\\s[\\\\s\\\\S]+$",
  );

fs.writeFileSync(file, patched);

console.log("Patch completed.");
