/**
 * @module bmkg_felt
 *
 * Script for fetching and syncing felt earthquake data from BMKG API.
 *
 * @example Run the script
 * ```sh
 * deno run --allow-net --allow-read --allow-write --allow-env bmkg_felt.ts
 * ```
 */

import { logIfCi } from "./ci_utils.ts";
import { readJsonFile, writeJsonFile } from "./utils.ts";
import {
  createBmkgApiResSchema,
  mergeFeltEarthquakes,
} from "./bmkg_felt_utils.ts";

const EARTHQUAKE_FELT_JSON_PATH = "./earthquakes/bmkg_earthquakes_felt.json";

const EARTHQUAKE_FELT_URL =
  "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json";

/**
 * Fetches earthquake data from BMKG API and syncs with local storage.
 * Merges fresh data with existing records using bmkgEarthquakeId as the key.
 *
 * @throws {Error} If the fetch fails or JSON parsing fails
 */
export async function syncFeltEarthquakes() {
  const res = await fetch(EARTHQUAKE_FELT_URL);
  const json = await res.json();
  logIfCi(json);

  const bmkgApiResSchema = createBmkgApiResSchema();
  const freshEarthquakes = bmkgApiResSchema.parse(json);

  const staleEarthquakes = await readJsonFile(EARTHQUAKE_FELT_JSON_PATH);
  const updated = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "bmkgEarthquakeId",
  });
  logIfCi({
    staleEarthquakes,
    freshEarthquakes,
    updated,
  });

  await writeJsonFile(EARTHQUAKE_FELT_JSON_PATH, updated);
}

try {
  await syncFeltEarthquakes();
} catch (error) {
  console.error(error);
  Deno.exit(1);
}
