export async function readJsonFile(path: string) {
  const text = await Deno.readTextFile(path);
  return JSON.parse(text);
}

// deno-lint-ignore no-explicit-any
export async function writeJsonFile(path: string, value: any) {
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2));
}
