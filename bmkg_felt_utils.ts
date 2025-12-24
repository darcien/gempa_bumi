/**
 * @module bmkg_felt_utils
 *
 * Utilities for processing BMKG (Indonesian Meteorology, Climatology, and Geophysics Agency)
 * earthquake data. Includes Zod schemas for parsing API responses, date/ID computation,
 * and merging earthquake datasets.
 */

import hash from "hash";
import { deepMerge } from "@std/collections/deep-merge";
import { z } from "@zod/zod";

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
 * import { assertEquals } from "@std/assert";
 *
 * const earthquakeAt = new Date("2022-12-18T22:50:14.000Z");
 * const id = computeBmkgEarthquakeId(earthquakeAt);
 * assertEquals(id, "20221219055014");
 * ```
 *
 * @example
 * ```ts
 * import { computeBmkgEarthquakeId } from "./bmkg_felt_utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * // Pads single digit date components
 * const earthquakeAt = new Date("2022-01-09T02:03:05.000Z");
 * const id = computeBmkgEarthquakeId(earthquakeAt);
 * assertEquals(id, "20220109090305");
 * assertEquals(id.length, 14);
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
 * import { assertEquals } from "@std/assert";
 *
 * const id = "20221219055014" as BmkgEarthquakeId;
 * const url = getBmkgShakeMapUrl(id);
 * assertEquals(url, "https://static.bmkg.go.id/20221219055014.mmi.jpg");
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
 * import { assertEquals } from "@std/assert";
 *
 * const result = coordinatesSchema.parse("1.47,126.34");
 * assertEquals(result, { latitude: 1.47, longitude: 126.34 });
 * ```
 *
 * @example
 * ```ts
 * import { coordinatesSchema } from "./bmkg_felt_utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const result = coordinatesSchema.parse("-4.46,102.60");
 * assertEquals(result, { latitude: -4.46, longitude: 102.60 });
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
 * import { assertEquals } from "@std/assert";
 *
 * const result = depthSchema.parse("30 km");
 * assertEquals(result, 30);
 * ```
 *
 * @example
 * ```ts
 * import { depthSchema } from "./bmkg_felt_utils.ts";
 * import { assertEquals } from "@std/assert";
 *
 * const result = depthSchema.parse("102 km");
 * assertEquals(result, 102);
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
            Tanggal: z.unknown(),
            Jam: z.unknown(),
            DateTime: z.iso.datetime({ offset: true }).pipe(z.coerce.date()),
            Coordinates: coordinatesSchema,
            Lintang: z.unknown(),
            Bujur: z.unknown(),
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
          fingerprintSha1: hash.sha1({
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
      })
    );
}

/**
 * Key used for merging earthquake datasets.
 */
export type MergeKey =
  | "fingerprintSha1"
  | "bmkgEarthquakeId";

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

const DEEP_MERGE_OPTIONS = {
  arrays: "replace",
  maps: "replace",
  sets: "replace",
} as const;

/**
 * Merges stale (existing) earthquake data with fresh (new) earthquake data.
 * Uses deep merge to update existing records and add new ones.
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
      merged.set(
        key,
        deepMerge(old, fresh, DEEP_MERGE_OPTIONS),
      );
    } else {
      merged.set(key, fresh);
    }
  });

  return Array.from(merged.values());
}
