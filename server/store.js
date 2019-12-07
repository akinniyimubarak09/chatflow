import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "store.json");

export async function readStore() {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return { users: [], conversations: [], messages: [], groups: [] };
  }
}

export async function writeStore(data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
  return data;
}
