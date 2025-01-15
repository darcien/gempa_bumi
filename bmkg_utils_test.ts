import { assertEquals } from "jsr:@std/assert";
import {
  computeBmkgEarthquakeId,
  parseDepthText,
  parseLatitudeLongitudeText,
  parseWibTextDate,
} from "./bmkg_utils.ts";

Deno.test("parseWibTextDate should return UTC Date", () => {
  const wibTextDate = "19/12/202212:50:14 WIB";
  const parsed = parseWibTextDate(wibTextDate);
  const expected = new Date("2022-12-19T05:50:14.000Z");
  assertEquals(parsed, expected);
});

Deno.test("compute bmkg earthquake id", () => {
  const earthquakeAt = new Date("2022-12-18T22:50:14.000Z");
  const bmkgEarthquakeId = computeBmkgEarthquakeId(earthquakeAt);
  const expected = "20221219055014";
  assertEquals(bmkgEarthquakeId, expected);
});

// this will fail at year 10000+
Deno.test("pad all date time components for bmkg earthquake id", () => {
  const earthquakeAt = new Date("2022-01-09T02:03:05.000Z");
  const bmkgEarthquakeId = computeBmkgEarthquakeId(earthquakeAt);
  const expected = "20220109090305";
  assertEquals(bmkgEarthquakeId, expected);
  assertEquals(bmkgEarthquakeId.length, 14);
});

Deno.test("parse all latitude longitude text variations", () => {
  const luBt = "2.09 LU 98.94 BT";
  const parsedLuBt = parseLatitudeLongitudeText(luBt);
  const expectedLuBt = { latitude: 2.09, longitude: 98.94 };
  assertEquals(parsedLuBt, expectedLuBt);

  const luBb = "2.09 LU 103.45 BB";
  const parsedLuBb = parseLatitudeLongitudeText(luBb);
  const expectedLuBb = { latitude: 2.09, longitude: -103.45 };
  assertEquals(parsedLuBb, expectedLuBb);

  const lsBt = "2.09 LS 98.94 BT";
  const parsedLsBt = parseLatitudeLongitudeText(lsBt);
  const expectedLsBt = { latitude: -2.09, longitude: 98.94 };
  assertEquals(parsedLsBt, expectedLsBt);

  const lsBb = "2.09 LS 98.94 BB";
  const parsedLsBb = parseLatitudeLongitudeText(lsBb);
  const expectedLsBb = { latitude: -2.09, longitude: -98.94 };
  assertEquals(parsedLsBb, expectedLsBb);
});

Deno.test("depth parsing", () => {
  const parsed = parseDepthText("59 Km");
  const expected = 59;
  assertEquals(parsed, expected);
});
