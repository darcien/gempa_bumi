/**
 * @module bmkg_felt_utils
 *
 * Utilities for processing BMKG (Indonesian Meteorology, Climatology, and Geophysics Agency)
 * earthquake data. Includes Zod schemas for parsing API responses, date/ID computation,
 * and merging earthquake datasets.
 */

import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * The number of milliseconds in an hour.
 */
const HOUR = 3_600_000;

/**
 * WIB (Western Indonesia Time) is UTC +7
 */
const WIB_OFFSET = 7 * HOUR;

const bmkgEarthquakeIdSymbol: unique symbol = Symbol();
export type BmkgEarthquakeId = string & {
  [bmkgEarthquakeIdSymbol]: "bmkgEarthquakeId";
};

/**
 * Fields used to compute `fingerprintSha1`.
 */
export type FingerprintInput = {
  earthquakeAt: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depthInKm: number;
};

/**
 * Serialization prefix for a plain object, as written by
 * `deno.land/x/object_hash@2.0.3.1` when it runs on Deno.
 * Deno deletes `Object.prototype.__proto__`, so `__proto__` is `Undefined`.
 * The npm `object-hash` package on Node.js serializes `Object.prototype`
 * here instead, and gives a different hash. Do not replace this function
 * with npm `object-hash`.
 */
const FINGERPRINT_OBJECT_PREFIX =
  "object:8:" +
  "string:9:prototype:Undefined," +
  "string:9:__proto__:Undefined," +
  "string:11:constructor:fn:string:8:[native]string:20:function-name:Objectobject:0:,";

/**
 * Computes the SHA-1 fingerprint of an earthquake.
 * The output is identical to `hash.sha1()` from
 * `deno.land/x/object_hash@2.0.3.1` on Deno, which made all stored fingerprints.
 */
export function computeFingerprintSha1(input: FingerprintInput): string {
  let serialized = FINGERPRINT_OBJECT_PREFIX;
  for (const key of Object.keys(input).sort() as Array<
    keyof FingerprintInput
  >) {
    const value = input[key];
    serialized += `string:${key.length}:${key}:`;
    serialized +=
      typeof value === "number"
        ? `number:${value}`
        : `string:${value.length}:${value}`;
    serialized += ",";
  }
  return createHash("sha1").update(serialized, "utf8").digest("hex");
}

function padTimeComponent(part: number) {
  return String(part).padStart(2, "0");
}

/**
 * Computes a BMKG earthquake ID from a Date object.
 * The ID is in WIB timezone formatted as YYYYMMDDHHmmss.
 *
 * @param earthquakeAt - The earthquake timestamp in UTC
 * @returns A 14-character string representing the earthquake ID in WIB timezone
 *
 * @example
 * ```ts
 * import { computeBmkgEarthquakeId } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const earthquakeAt = new Date("2022-12-18T22:50:14.000Z");
 * const id = computeBmkgEarthquakeId(earthquakeAt);
 * assert.deepStrictEqual(id, "20221219055014");
 * ```
 *
 * @example
 * ```ts
 * import { computeBmkgEarthquakeId } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * // Pads single digit date components
 * const earthquakeAt = new Date("2022-01-09T02:03:05.000Z");
 * const id = computeBmkgEarthquakeId(earthquakeAt);
 * assert.deepStrictEqual(id, "20220109090305");
 * assert.deepStrictEqual(id.length, 14);
 * ```
 */
export function computeBmkgEarthquakeId(earthquakeAt: Date): BmkgEarthquakeId {
  const wibDate = new Date(earthquakeAt.getTime() + WIB_OFFSET);
  return [
    wibDate.getUTCFullYear(),
    padTimeComponent(wibDate.getUTCMonth() + 1),
    padTimeComponent(wibDate.getUTCDate()),
    padTimeComponent(wibDate.getUTCHours()),
    padTimeComponent(wibDate.getUTCMinutes()),
    padTimeComponent(wibDate.getUTCSeconds()),
  ].join("") as BmkgEarthquakeId;
}

/**
 * Generates the shake map image URL for a given BMKG earthquake ID.
 *
 * @param bmkgEarthquakeId - The BMKG earthquake ID
 * @returns The URL to the shake map image
 *
 * @example
 * ```ts
 * import { getBmkgShakeMapUrl, type BmkgEarthquakeId } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const id = "20221219055014" as BmkgEarthquakeId;
 * const url = getBmkgShakeMapUrl(id);
 * assert.deepStrictEqual(url, "https://static.bmkg.go.id/20221219055014.mmi.jpg");
 * ```
 */
export function getBmkgShakeMapUrl(bmkgEarthquakeId: BmkgEarthquakeId): string {
  return `https://static.bmkg.go.id/${bmkgEarthquakeId}.mmi.jpg`;
}

/**
 * Zod schema for parsing coordinate strings in the format "latitude,longitude".
 *
 * @example
 * ```ts
 * import { coordinatesSchema } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const result = coordinatesSchema.parse("1.47,126.34");
 * assert.deepStrictEqual(result, { latitude: 1.47, longitude: 126.34 });
 * ```
 *
 * @example
 * ```ts
 * import { coordinatesSchema } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const result = coordinatesSchema.parse("-4.46,102.60");
 * assert.deepStrictEqual(result, { latitude: -4.46, longitude: 102.60 });
 * ```
 */
export const coordinatesSchema = z
  .templateLiteral([z.number(), ",", z.number()])
  .pipe(
    z.transform((arg) => {
      const [rLatitude, rLongitude] = arg.split(",");
      return {
        latitude: parseFloat(rLatitude),
        longitude: parseFloat(rLongitude),
      };
    }),
  );

/**
 * Zod schema for parsing depth strings in the format "XX km".
 *
 * @example
 * ```ts
 * import { depthSchema } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const result = depthSchema.parse("30 km");
 * assert.deepStrictEqual(result, 30);
 * ```
 *
 * @example
 * ```ts
 * import { depthSchema } from "./bmkg_felt_utils.ts";
 * import assert from "node:assert/strict";
 *
 * const result = depthSchema.parse("102 km");
 * assert.deepStrictEqual(result, 102);
 * ```
 */
export const depthSchema = z
  .templateLiteral([z.number(), " km"])
  .pipe(z.transform((str) => parseFloat(str.slice(0, -3))));

/**
 * Creates a Zod schema for parsing BMKG API responses.
 * The schema validates and transforms the raw API response into typed Earthquake objects.
 *
 * @param now - The current time for detecting future earthquakes (defaults to new Date())
 * @returns A Zod schema that parses and transforms BMKG API responses
 */
export function createBmkgApiResSchema(now: Date = new Date()) {
  return z
    .object({
      Infogempa: z.object({
        gempa: z.array(
          z.object({
            // The code does not read Tanggal, Jam, Lintang, and Bujur.
            // Since zod 4.4, `z.unknown()` fails on a missing key, so
            // these fields are optional to accept a missing key.
            Tanggal: z.unknown().optional(),
            Jam: z.unknown().optional(),
            // Since zod 4.5, `z.iso.datetime()` requires seconds. The union also
            // accepts a time without seconds, as zod 4.2.1 did.
            DateTime: z
              .union([
                z.iso.datetime({ offset: true }),
                z.iso.datetime({ offset: true, precision: -1 }),
              ])
              .pipe(z.coerce.date()),
            Coordinates: coordinatesSchema,
            Lintang: z.unknown().optional(),
            Bujur: z.unknown().optional(),
            Magnitude: z.string().transform((value) => parseFloat(value)),
            Kedalaman: depthSchema,
            Wilayah: z.string(),
            Dirasakan: z.string(),
          }),
        ),
      }),
    })
    .transform((arg) =>
      arg.Infogempa.gempa.map((earthquake) => {
        const fresh = {
          earthquakeAt: earthquake.DateTime,
          latitude: earthquake.Coordinates.latitude,
          longitude: earthquake.Coordinates.longitude,
          magnitude: earthquake.Magnitude,
          depthInKm: earthquake.Kedalaman,
          locationInIndonesian: earthquake.Wilayah,
          feltOnStations: earthquake.Dirasakan,
        };

        const isFutureEarthquake = fresh.earthquakeAt > now;

        const bmkgEarthquakeId = computeBmkgEarthquakeId(fresh.earthquakeAt);
        const shakeMapUrl = getBmkgShakeMapUrl(bmkgEarthquakeId);
        const earthquakeAtIso = fresh.earthquakeAt.toISOString();
        return {
          ...fresh,
          earthquakeAt: earthquakeAtIso,
          bmkgEarthquakeId,
          shakeMapUrl,
          fingerprintSha1: computeFingerprintSha1({
            earthquakeAt: earthquakeAtIso,
            latitude: fresh.latitude,
            longitude: fresh.longitude,
            magnitude: fresh.magnitude,
            depthInKm: fresh.depthInKm,
          }),
          ...(isFutureEarthquake
            ? { meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" as const } }
            : null),
        } satisfies Earthquake;
      }),
    );
}

/**
 * Key used for merging earthquake datasets.
 */
export type MergeKey = "fingerprintSha1" | "bmkgEarthquakeId";

/**
 * Reason for marking earthquake data as erroneous.
 */
export type ErroneousDataReason = "FUTURE_EARTHQUAKE";

/**
 * Represents a processed earthquake record from BMKG.
 */
export type Earthquake = {
  bmkgEarthquakeId: string;
  fingerprintSha1: string;
  earthquakeAt: string;
  latitude: number;
  longitude: number;
  magnitude: number;
  depthInKm: number;
  locationInIndonesian: string;
  feltOnStations: string;
  shakeMapUrl: string;
  meta?: { erroneousDataReason?: ErroneousDataReason };
};

/**
 * Merges a stale earthquake record with the fresh record for the same key.
 * Fresh values replace stale values. Keys that only the stale record has stay.
 * `meta` is the only nested field, and it is merged one level deep.
 * The result keeps the key order of the stale record, then adds new fresh keys.
 * This gives the same result as `deepMerge()` from `@std/collections`,
 * which this function replaces, only while these conditions are true:
 * - `meta` is a plain object or is not set.
 * - All other fields are primitive values.
 * - No record has a `__proto__` key.
 * If a new field holds an object, update this function.
 */
function mergeEarthquake(stale: Earthquake, fresh: Earthquake): Earthquake {
  const merged = { ...stale, ...fresh };
  if (stale.meta && fresh.meta) {
    merged.meta = { ...stale.meta, ...fresh.meta };
  }
  return merged;
}

/**
 * Merges stale (existing) earthquake data with fresh (new) earthquake data.
 * Updates existing records with `mergeEarthquake()` and adds new ones.
 *
 * @param staleEarthquakes - Existing earthquake records
 * @param freshEarthquakes - New earthquake records from API
 * @param options - Merge configuration including the key to use for matching
 * @returns Merged array of earthquake records
 */
export function mergeFeltEarthquakes(
  staleEarthquakes: Array<Earthquake>,
  freshEarthquakes: Array<Earthquake>,
  options: {
    mergeKey: MergeKey;
  },
): Array<Earthquake> {
  const { mergeKey } = options;

  const merged = new Map(
    staleEarthquakes.map((earthquake) => [earthquake[mergeKey], earthquake]),
  );

  freshEarthquakes.forEach((fresh) => {
    const key = fresh[mergeKey];
    const old = merged.get(key);
    if (old) {
      merged.set(key, mergeEarthquake(old, fresh));
    } else {
      merged.set(key, fresh);
    }
  });

  return Array.from(merged.values());
}
