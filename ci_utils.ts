const isCi = Deno.env.get("CI") === "true";

// deno-lint-ignore no-explicit-any
export function logIfCi(...data: Array<any>) {
  if (isCi) {
    console.log(...data);
  }
}
