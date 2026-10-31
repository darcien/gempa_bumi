import { readFile, writeFile } from "node:fs/promises";

export async function readJsonFile(path: string) {
  const text = await readFile(path, "utf8");
  return JSON.parse(text);
}

// biome-ignore lint/suspicious/noExplicitAny: callers pass any JSON value.
export async function writeJsonFile(path: string, value: any) {
  await writeFile(path, JSON.stringify(value, null, 2));
}
