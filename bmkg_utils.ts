import { HOUR } from "https://deno.land/std@0.170.0/datetime/mod.ts";

// WIB is UTC +7
const WIB_OFFSET = 7 * HOUR;

/** WIB text like: `19/12/202212:50:14 WIB` */
export function parseWibTextDate(text: string) {
  const [day, month, year] = text.slice(0, 10).split("/");
  const [hours, minutes, seconds] = text.slice(10, 18).split(":");

  // Constructing ISO date here to avoid specifying time components to
  // Date constructor like `new Date(year, month, ...)` or `new Date(ms)`
  // as it will be evaluated against local timezone, not UTC.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
  return new Date(
    `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000+07:00`
  );
}

const bmkgEarthquakeIdSymbol: unique symbol = Symbol();
export type BmkgEarthquakeId = string & {
  [bmkgEarthquakeIdSymbol]: "bmkgEarthquakeId";
};

function padTimeComponent(part: number) {
  return String(part).padStart(2, "0");
}
// TODO: Elaborate the id here
export function computeBmkgEarthquakeId(earthquakeAt: Date): BmkgEarthquakeId {
  const wibDate = new Date(earthquakeAt.getTime() + WIB_OFFSET);
  return [
    wibDate.getUTCFullYear(),
    wibDate.getUTCMonth() + 1,
    wibDate.getUTCDate(),
    padTimeComponent(wibDate.getUTCHours()),
    padTimeComponent(wibDate.getUTCMinutes()),
    padTimeComponent(wibDate.getUTCSeconds()),
  ].join("") as BmkgEarthquakeId;
}

export function getBmkgShakeMapUrl(bmkgEarthquakeId: BmkgEarthquakeId) {
  return `https://ews.bmkg.go.id/TEWS/data/${bmkgEarthquakeId}.mmi.jpg`;
}

/** Example text: `2.09 LU 98.94 BT` */
export function parseLatitudeLongitudeText(text: string) {
  const [rUnsignedLat, rLatSign, rUnsignedLong, rLongSign] = text.split(" ");

  const unsignedLat = parseFloat(rUnsignedLat);
  const unsignedLong = parseFloat(rUnsignedLong);

  // LU(Lintang Utara, Latitude Postive) vs LS(Lintang Selatan, Latitude Negative).
  const latSign = rLatSign.toUpperCase() === "LU" ? 1 : -1;
  // BT(Bujur Timur, Longitude Postive) vs BB(Bujur Barat, Longitude Negative).
  const longSign = rLongSign.toUpperCase() === "BT" ? 1 : -1;

  return {
    latitude: unsignedLat * latSign,
    longitude: unsignedLong * longSign,
  };
}

/** Example text: `10 Km` */
export function parseDepthText(text: string) {
  if (!text.includes(" Km")) {
    throw new Error(
      `Unexpected depth unit, received: '${text}', expected: 'xx Km'`
    );
  }

  const [depth] = text.split(" ");
  return parseFloat(depth);
}

/** Example text: `Pusat gempa berada di laut TimurLaut Karangasem\\nIII\\tKarangasem\\nII - III\\tMataram\\nII - III\\tLombok Barat\\nII\\tDenpasar\\nII\\tGianyar\\nII\\tKlungkung\\nII\\tKuta\\nII\\tTejakula\\nII\\tLombok Utara\\n\\n\\n` */
export function parseFeltOnText(text: string) {
  const [rLocationText, ...rStations] = text
    .split("\n")
    .filter((l) => l.trim());

  return {
    locationText: rLocationText.trim(),
    stations: rStations.map((rStation) =>
      rStation.replaceAll("\t", " ").trim()
    ),
  };
}
