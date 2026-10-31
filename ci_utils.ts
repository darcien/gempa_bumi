import process from "node:process";
import { inspect } from "node:util";

const isCi = process.env.CI === "true";

/**
 * Logs values only in CI.
 * Node.js prints nested objects to depth 2 by default. Deno printed to
 * depth 4, so the CI log showed each earthquake record. Keep depth 4.
 */
export function logIfCi(...data: Array<unknown>) {
  if (isCi) {
    console.log(...data.map((value) => inspect(value, { depth: 4 })));
  }
}
