import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import feltSample from "./bmkg_felt_response_sample.json" with { type: "json" };
import {
  type BmkgEarthquakeId,
  computeBmkgEarthquakeId,
  computeFingerprintSha1,
  coordinatesSchema,
  createBmkgApiResSchema,
  depthSchema,
  type Earthquake,
  getBmkgShakeMapUrl,
  mergeFeltEarthquakes,
} from "./bmkg_felt_utils.ts";

test("coordinatesSchema - parse positive latitude and longitude", () => {
  const result = coordinatesSchema.parse("1.47,126.34");
  assert.deepStrictEqual(result, { latitude: 1.47, longitude: 126.34 });
});

test("coordinatesSchema - parse negative latitude and positive longitude", () => {
  const result = coordinatesSchema.parse("-4.46,102.60");
  assert.deepStrictEqual(result, { latitude: -4.46, longitude: 102.6 });
});

test("coordinatesSchema - parse negative latitude and longitude", () => {
  const result = coordinatesSchema.parse("-8.06,119.24");
  assert.deepStrictEqual(result, { latitude: -8.06, longitude: 119.24 });
});

test("depthSchema - parse depth in kilometers", () => {
  const result = depthSchema.parse("30 km");
  assert.deepStrictEqual(result, 30);
});

test("depthSchema - parse single digit depth", () => {
  const result = depthSchema.parse("2 km");
  assert.deepStrictEqual(result, 2);
});

test("depthSchema - parse triple digit depth", () => {
  const result = depthSchema.parse("102 km");
  assert.deepStrictEqual(result, 102);
});

test("bmkgApiResSchema - parse complete raw.json sample data", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  // Should parse all 15 earthquakes from raw.json
  assert.deepStrictEqual(result.length, 15);
});

test("bmkgApiResSchema - parse first earthquake from raw.json", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Check all required fields exist
  assert.ok(firstEarthquake.bmkgEarthquakeId != null);
  assert.ok(firstEarthquake.fingerprintSha1 != null);
  assert.ok(firstEarthquake.earthquakeAt != null);
  assert.ok(firstEarthquake.shakeMapUrl != null);

  // Check parsed values
  assert.deepStrictEqual(firstEarthquake.latitude, -4.46);
  assert.deepStrictEqual(firstEarthquake.longitude, 102.6);
  assert.deepStrictEqual(firstEarthquake.magnitude, 4.6);
  assert.deepStrictEqual(firstEarthquake.depthInKm, 30);
  assert.deepStrictEqual(
    firstEarthquake.locationInIndonesian,
    "Pusat gempa berada di laut 34 km barat Bengkulu Selatan",
  );
  assert.deepStrictEqual(
    firstEarthquake.feltOnStations,
    "II-III Bengkulu Utara, II-III Bengkulu Selatan",
  );

  // Check date parsing
  assert.deepStrictEqual(
    firstEarthquake.earthquakeAt,
    "2025-12-24T05:30:34.000Z",
  );

  // Check computed bmkgEarthquakeId (WIB is UTC+7, so 05:30:34 UTC = 12:30:34 WIB)
  assert.deepStrictEqual(firstEarthquake.bmkgEarthquakeId, "20251224123034");

  // Check shake map URL
  assert.deepStrictEqual(
    firstEarthquake.shakeMapUrl,
    "https://static.bmkg.go.id/20251224123034.mmi.jpg",
  );
});

test("bmkgApiResSchema - parse earthquake with negative coordinates", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const earthquake = result[1]; // Second earthquake: -8.06,119.24

  assert.deepStrictEqual(earthquake.latitude, -8.06);
  assert.deepStrictEqual(earthquake.longitude, 119.24);
  assert.deepStrictEqual(earthquake.magnitude, 4.0);
  assert.deepStrictEqual(earthquake.depthInKm, 17);
});

test("bmkgApiResSchema - parse earthquake with positive coordinates", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const earthquake = result[2]; // Third earthquake: 1.47,126.34

  assert.deepStrictEqual(earthquake.latitude, 1.47);
  assert.deepStrictEqual(earthquake.longitude, 126.34);
  assert.deepStrictEqual(earthquake.magnitude, 5.6);
  assert.deepStrictEqual(earthquake.depthInKm, 27);
});

test("bmkgApiResSchema - handle future earthquake with meta flag", () => {
  // Set "now" to before the earthquakes to trigger future earthquake flag
  const fixedNow = new Date("2025-12-01T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Should have meta flag for future earthquake
  assert.ok(firstEarthquake.meta != null);
  assert.deepStrictEqual(
    firstEarthquake.meta?.erroneousDataReason,
    "FUTURE_EARTHQUAKE",
  );
});

test("bmkgApiResSchema - no meta flag for past earthquakes", () => {
  // Set "now" to after the earthquakes
  const fixedNow = new Date("2025-12-26T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Should not have meta flag
  assert.deepStrictEqual(firstEarthquake.meta, undefined);
});

test("bmkgApiResSchema - fingerprint SHA1 is consistent", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Fingerprint should be a 40-character hex string (SHA1)
  assert.deepStrictEqual(firstEarthquake.fingerprintSha1.length, 40);
  assert.deepStrictEqual(
    /^[a-f0-9]+$/.test(firstEarthquake.fingerprintSha1),
    true,
  );
});

test("mergeFeltEarthquakes - merge by bmkgEarthquakeId", () => {
  const staleEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "Old location",
      feltOnStations: "Old stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const freshEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "def456",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "New location",
      feltOnStations: "New stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const result = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "bmkgEarthquakeId",
  });

  // Should have 1 earthquake (merged)
  assert.deepStrictEqual(result.length, 1);

  // Should use fresh data
  assert.deepStrictEqual(result[0].locationInIndonesian, "New location");
  assert.deepStrictEqual(result[0].feltOnStations, "New stations");
  assert.deepStrictEqual(result[0].bmkgEarthquakeId, "20251224123034");
});

test("mergeFeltEarthquakes - add new earthquake", () => {
  const staleEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "Location 1",
      feltOnStations: "Stations 1",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const freshEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251223111036",
      fingerprintSha1: "def456",
      earthquakeAt: "2025-12-23T04:10:36.000Z",
      latitude: -8.06,
      longitude: 119.24,
      magnitude: 4.0,
      depthInKm: 17,
      locationInIndonesian: "Location 2",
      feltOnStations: "Stations 2",
      shakeMapUrl: "https://static.bmkg.go.id/20251223111036.mmi.jpg",
    },
  ];

  const result = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "bmkgEarthquakeId",
  });

  // Should have 2 earthquakes (1 old + 1 new)
  assert.deepStrictEqual(result.length, 2);

  // Check both earthquakes exist
  const ids = result.map((e) => e.bmkgEarthquakeId);
  assert.deepStrictEqual(ids.includes("20251224123034"), true);
  assert.deepStrictEqual(ids.includes("20251223111036"), true);
});

test("mergeFeltEarthquakes - merge by fingerprintSha1", () => {
  const staleEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "Old location",
      feltOnStations: "Old stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const freshEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "New location",
      feltOnStations: "New stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const result = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "fingerprintSha1",
  });

  // Should have 1 earthquake (merged)
  assert.deepStrictEqual(result.length, 1);

  // Should use fresh data
  assert.deepStrictEqual(result[0].locationInIndonesian, "New location");
  assert.deepStrictEqual(result[0].feltOnStations, "New stations");
  assert.deepStrictEqual(result[0].fingerprintSha1, "abc123");
});

test("mergeFeltEarthquakes - empty stale earthquakes", () => {
  const staleEarthquakes: Earthquake[] = [];

  const freshEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "Location",
      feltOnStations: "Stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const result = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "bmkgEarthquakeId",
  });

  // Should have 1 earthquake
  assert.deepStrictEqual(result.length, 1);
  assert.deepStrictEqual(result[0].bmkgEarthquakeId, "20251224123034");
});

test("mergeFeltEarthquakes - empty fresh earthquakes", () => {
  const staleEarthquakes: Earthquake[] = [
    {
      bmkgEarthquakeId: "20251224123034",
      fingerprintSha1: "abc123",
      earthquakeAt: "2025-12-24T05:30:34.000Z",
      latitude: -4.46,
      longitude: 102.6,
      magnitude: 4.6,
      depthInKm: 30,
      locationInIndonesian: "Location",
      feltOnStations: "Stations",
      shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    },
  ];

  const freshEarthquakes: Earthquake[] = [];

  const result = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: "bmkgEarthquakeId",
  });

  // Should keep stale earthquake
  assert.deepStrictEqual(result.length, 1);
  assert.deepStrictEqual(result[0].bmkgEarthquakeId, "20251224123034");
});

function makeEarthquake(overrides: Partial<Earthquake> = {}): Earthquake {
  return {
    bmkgEarthquakeId: "20251224123034",
    fingerprintSha1: "abc123",
    earthquakeAt: "2025-12-24T05:30:34.000Z",
    latitude: -4.46,
    longitude: 102.6,
    magnitude: 4.6,
    depthInKm: 30,
    locationInIndonesian: "Location",
    feltOnStations: "Stations",
    shakeMapUrl: "https://static.bmkg.go.id/20251224123034.mmi.jpg",
    ...overrides,
  };
}

test("mergeFeltEarthquakes - keep stale meta when fresh has no meta", () => {
  // A stored FUTURE_EARTHQUAKE flag stays after the earthquake time passes.
  const stale = makeEarthquake({
    meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
  });
  const fresh = makeEarthquake({ locationInIndonesian: "New location" });

  const result = mergeFeltEarthquakes([stale], [fresh], {
    mergeKey: "bmkgEarthquakeId",
  });

  assert.deepStrictEqual(result, [
    makeEarthquake({
      locationInIndonesian: "New location",
      meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
    }),
  ]);
});

test("mergeFeltEarthquakes - add fresh meta when stale has no meta", () => {
  const stale = makeEarthquake();
  const fresh = makeEarthquake({
    meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
  });

  const result = mergeFeltEarthquakes([stale], [fresh], {
    mergeKey: "bmkgEarthquakeId",
  });

  assert.deepStrictEqual(result, [
    makeEarthquake({ meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" } }),
  ]);
});

test("mergeFeltEarthquakes - merge meta when both have meta", () => {
  // `legacyNote` is only in stale meta, so a replace drops it.
  const staleMeta = { legacyNote: "kept" } as Earthquake["meta"];
  const stale = makeEarthquake({ meta: staleMeta });
  const fresh = makeEarthquake({
    meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
  });

  const result = mergeFeltEarthquakes([stale], [fresh], {
    mergeKey: "bmkgEarthquakeId",
  });

  // Compare JSON text, because `deepStrictEqual` ignores key order.
  assert.strictEqual(
    JSON.stringify(result),
    JSON.stringify([
      makeEarthquake({
        meta: {
          legacyNote: "kept",
          erroneousDataReason: "FUTURE_EARTHQUAKE",
        } as Earthquake["meta"],
      }),
    ]),
  );
});

test("mergeFeltEarthquakes - add no meta when neither has meta", () => {
  // An empty `meta` in every row would rewrite the data file on each run.
  const stale = makeEarthquake();
  const fresh = makeEarthquake({ locationInIndonesian: "New location" });

  const result = mergeFeltEarthquakes([stale], [fresh], {
    mergeKey: "bmkgEarthquakeId",
  });

  assert.strictEqual(
    JSON.stringify(result),
    JSON.stringify([makeEarthquake({ locationInIndonesian: "New location" })]),
  );
});

test("mergeFeltEarthquakes - do not mutate input records", () => {
  const stale = makeEarthquake({ meta: {} });
  const fresh = makeEarthquake({
    locationInIndonesian: "New location",
    meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
  });
  const staleBefore = structuredClone(stale);
  const freshBefore = structuredClone(fresh);

  mergeFeltEarthquakes([stale], [fresh], { mergeKey: "bmkgEarthquakeId" });

  assert.deepStrictEqual(stale, staleBefore);
  assert.deepStrictEqual(fresh, freshBefore);
});

test("mergeFeltEarthquakes - keep stale key order in JSON output", () => {
  // The output is written to the data file. A change in key order
  // rewrites every stored row in the next commit.
  const stale = {
    ...makeEarthquake({ meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" } }),
    legacyField: "kept",
  } as Earthquake;
  const { bmkgEarthquakeId, ...rest } = makeEarthquake({
    feltOnStations: "New stations",
  });
  // Same fields, but `bmkgEarthquakeId` is last.
  const fresh: Earthquake = { ...rest, bmkgEarthquakeId };

  const result = mergeFeltEarthquakes([stale], [fresh], {
    mergeKey: "bmkgEarthquakeId",
  });

  assert.deepStrictEqual(
    JSON.stringify(result),
    JSON.stringify([
      {
        ...makeEarthquake({
          feltOnStations: "New stations",
          meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" },
        }),
        legacyField: "kept",
      },
    ]),
  );
});

// Node.js does not run the JSDoc examples as tests (`deno test --doc` did).
// These tests cover the examples that had no test.
test("computeBmkgEarthquakeId - convert UTC to WIB", () => {
  const id = computeBmkgEarthquakeId(new Date("2022-12-18T22:50:14.000Z"));
  assert.deepStrictEqual(id, "20221219055014");
});

test("computeBmkgEarthquakeId - pad single digit date components", () => {
  const id = computeBmkgEarthquakeId(new Date("2022-01-09T02:03:05.000Z"));
  assert.deepStrictEqual(id, "20220109090305");
  assert.deepStrictEqual(id.length, 14);
});

test("getBmkgShakeMapUrl - build shake map URL", () => {
  const url = getBmkgShakeMapUrl("20221219055014" as BmkgEarthquakeId);
  assert.deepStrictEqual(
    url,
    "https://static.bmkg.go.id/20221219055014.mmi.jpg",
  );
});

test("computeFingerprintSha1 - reproduce every stored fingerprint", async () => {
  // The stored fingerprints were made on Deno. A change in the
  // serialization changes the hash, and the merge then rewrites old rows.
  const stored: Array<Earthquake> = JSON.parse(
    await readFile("./earthquakes/bmkg_earthquakes_felt.json", "utf8"),
  );
  const mismatched = stored.filter(
    (e) =>
      computeFingerprintSha1({
        earthquakeAt: e.earthquakeAt,
        latitude: e.latitude,
        longitude: e.longitude,
        magnitude: e.magnitude,
        depthInKm: e.depthInKm,
      }) !== e.fingerprintSha1,
  );
  assert.deepStrictEqual(
    mismatched.map((e) => e.bmkgEarthquakeId),
    [],
  );
});
