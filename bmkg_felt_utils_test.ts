import { assertEquals, assertExists } from "@std/assert";
import {
  coordinatesSchema,
  createBmkgApiResSchema,
  depthSchema,
  type Earthquake,
  mergeFeltEarthquakes,
} from "./bmkg_felt_utils.ts";
import feltSample from "./bmkg_felt_response_sample.json" with { type: "json" };

Deno.test("coordinatesSchema - parse positive latitude and longitude", () => {
  const result = coordinatesSchema.parse("1.47,126.34");
  assertEquals(result, { latitude: 1.47, longitude: 126.34 });
});

Deno.test("coordinatesSchema - parse negative latitude and positive longitude", () => {
  const result = coordinatesSchema.parse("-4.46,102.60");
  assertEquals(result, { latitude: -4.46, longitude: 102.60 });
});

Deno.test("coordinatesSchema - parse negative latitude and longitude", () => {
  const result = coordinatesSchema.parse("-8.06,119.24");
  assertEquals(result, { latitude: -8.06, longitude: 119.24 });
});

Deno.test("depthSchema - parse depth in kilometers", () => {
  const result = depthSchema.parse("30 km");
  assertEquals(result, 30);
});

Deno.test("depthSchema - parse single digit depth", () => {
  const result = depthSchema.parse("2 km");
  assertEquals(result, 2);
});

Deno.test("depthSchema - parse triple digit depth", () => {
  const result = depthSchema.parse("102 km");
  assertEquals(result, 102);
});

Deno.test("bmkgApiResSchema - parse complete raw.json sample data", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  // Should parse all 15 earthquakes from raw.json
  assertEquals(result.length, 15);
});

Deno.test("bmkgApiResSchema - parse first earthquake from raw.json", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Check all required fields exist
  assertExists(firstEarthquake.bmkgEarthquakeId);
  assertExists(firstEarthquake.fingerprintSha1);
  assertExists(firstEarthquake.earthquakeAt);
  assertExists(firstEarthquake.shakeMapUrl);

  // Check parsed values
  assertEquals(firstEarthquake.latitude, -4.46);
  assertEquals(firstEarthquake.longitude, 102.6);
  assertEquals(firstEarthquake.magnitude, 4.6);
  assertEquals(firstEarthquake.depthInKm, 30);
  assertEquals(
    firstEarthquake.locationInIndonesian,
    "Pusat gempa berada di laut 34 km barat Bengkulu Selatan",
  );
  assertEquals(
    firstEarthquake.feltOnStations,
    "II-III Bengkulu Utara, II-III Bengkulu Selatan",
  );

  // Check date parsing
  assertEquals(firstEarthquake.earthquakeAt, "2025-12-24T05:30:34.000Z");

  // Check computed bmkgEarthquakeId (WIB is UTC+7, so 05:30:34 UTC = 12:30:34 WIB)
  assertEquals(firstEarthquake.bmkgEarthquakeId, "20251224123034");

  // Check shake map URL
  assertEquals(
    firstEarthquake.shakeMapUrl,
    "https://static.bmkg.go.id/20251224123034.mmi.jpg",
  );
});

Deno.test("bmkgApiResSchema - parse earthquake with negative coordinates", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const earthquake = result[1]; // Second earthquake: -8.06,119.24

  assertEquals(earthquake.latitude, -8.06);
  assertEquals(earthquake.longitude, 119.24);
  assertEquals(earthquake.magnitude, 4.0);
  assertEquals(earthquake.depthInKm, 17);
});

Deno.test("bmkgApiResSchema - parse earthquake with positive coordinates", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const earthquake = result[2]; // Third earthquake: 1.47,126.34

  assertEquals(earthquake.latitude, 1.47);
  assertEquals(earthquake.longitude, 126.34);
  assertEquals(earthquake.magnitude, 5.6);
  assertEquals(earthquake.depthInKm, 27);
});

Deno.test("bmkgApiResSchema - handle future earthquake with meta flag", () => {
  // Set "now" to before the earthquakes to trigger future earthquake flag
  const fixedNow = new Date("2025-12-01T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Should have meta flag for future earthquake
  assertExists(firstEarthquake.meta);
  assertEquals(firstEarthquake.meta?.erroneousDataReason, "FUTURE_EARTHQUAKE");
});

Deno.test("bmkgApiResSchema - no meta flag for past earthquakes", () => {
  // Set "now" to after the earthquakes
  const fixedNow = new Date("2025-12-26T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Should not have meta flag
  assertEquals(firstEarthquake.meta, undefined);
});

Deno.test("bmkgApiResSchema - fingerprint SHA1 is consistent", () => {
  const fixedNow = new Date("2025-12-25T00:00:00Z");
  const schema = createBmkgApiResSchema(fixedNow);
  const result = schema.parse(feltSample);

  const firstEarthquake = result[0];

  // Fingerprint should be a 40-character hex string (SHA1)
  assertEquals(firstEarthquake.fingerprintSha1.length, 40);
  assertEquals(/^[a-f0-9]+$/.test(firstEarthquake.fingerprintSha1), true);
});

Deno.test("mergeFeltEarthquakes - merge by bmkgEarthquakeId", () => {
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
  assertEquals(result.length, 1);

  // Should use fresh data
  assertEquals(result[0].locationInIndonesian, "New location");
  assertEquals(result[0].feltOnStations, "New stations");
  assertEquals(result[0].bmkgEarthquakeId, "20251224123034");
});

Deno.test("mergeFeltEarthquakes - add new earthquake", () => {
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
  assertEquals(result.length, 2);

  // Check both earthquakes exist
  const ids = result.map((e) => e.bmkgEarthquakeId);
  assertEquals(ids.includes("20251224123034"), true);
  assertEquals(ids.includes("20251223111036"), true);
});

Deno.test("mergeFeltEarthquakes - merge by fingerprintSha1", () => {
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
  assertEquals(result.length, 1);

  // Should use fresh data
  assertEquals(result[0].locationInIndonesian, "New location");
  assertEquals(result[0].feltOnStations, "New stations");
  assertEquals(result[0].fingerprintSha1, "abc123");
});

Deno.test("mergeFeltEarthquakes - empty stale earthquakes", () => {
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
  assertEquals(result.length, 1);
  assertEquals(result[0].bmkgEarthquakeId, "20251224123034");
});

Deno.test("mergeFeltEarthquakes - empty fresh earthquakes", () => {
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
  assertEquals(result.length, 1);
  assertEquals(result[0].bmkgEarthquakeId, "20251224123034");
});
