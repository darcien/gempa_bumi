import { cheerio } from "https://deno.land/x/cheerio@1.0.7/mod.ts";
import hash from "https://deno.land/x/object_hash@2.0.3.1/mod.ts";
import { deepMerge } from "https://deno.land/std@0.170.0/collections/deep_merge.ts";
import { assertEquals } from "https://deno.land/std@0.167.0/testing/asserts.ts";
import { logIfCi } from "./ci_utils.ts";
import { readJsonFile, writeJsonFile } from "./utils.ts";
import {
  computeBmkgEarthquakeId,
  getBmkgShakeMapUrl,
  parseDepthText,
  parseFeltOnText,
  parseLatitudeLongitudeText,
  parseWibTextDate,
} from "./bmkg_utils.ts";

const url = "https://www.bmkg.go.id/gempabumi-dirasakan.html";

const savePath = "./earthquakes/bmkg_earthquakes_felt.json";

const knownTableHeaders = [
  "#",
  "Waktu Gempa",
  "Lintang - Bujur",
  "Magnitudo",
  "Kedalaman",
  "Dirasakan (Skala MMI)",
];

enum MergeKey {
  FingerprintSha1 = "fingerprintSha1",
  BmkgEarthquakeId = "bmkgEarthquakeId",
}

type Earthquake = {
  bmkgEarthquakeId: string;
  fingerprintSha1: string;
  // This should have other properties.
};

function mergeFeltEarthquakes(
  staleEarthquakes: Array<Earthquake>,
  freshEarthquakes: Array<Earthquake>,
  options: {
    mergeKey: MergeKey;
  }
): Array<Earthquake> {
  const { mergeKey } = options;
  const merged = new Map(
    staleEarthquakes.map((earthquake) => [earthquake[mergeKey], earthquake])
  );

  freshEarthquakes.forEach((fresh) => {
    const key = fresh[mergeKey];
    const old = merged.get(key);
    if (old) {
      merged.set(
        key,
        deepMerge(old, fresh, {
          arrays: "replace",
          maps: "replace",
          sets: "replace",
        })
      );
    } else {
      merged.set(key, fresh);
    }
  });

  return Array.from(merged.values());
}

try {
  const res = await fetch(url);
  const html = await res.text();

  const $ = cheerio.load(html);

  const eqTableHeaderEl = $("table > thead > tr > th");

  const eqTableheaders = eqTableHeaderEl
    .map((_, element) => $(element).text())
    .toArray();

  // If the table headers does not match the known headers,
  // we assume the table structure has been changed
  // and we need to update the code.
  assertEquals(eqTableheaders, knownTableHeaders);

  const eqTableRowEls = $("table > tbody > tr");

  const rawEqTableRows = eqTableRowEls
    // Because of how cheerio (and jQuery) works,
    // doing nested map will flatten the resulting array.
    // See https://github.com/cheeriojs/cheerio/issues/1182
    // We want array of tupple here, so we map the row selector
    // into regular array first before iterating over each column.
    .map((_, rowEl) => $(rowEl).children("td"))
    .toArray()
    .map((tdEls) =>
      tdEls
        .map((columnIndex, tdEl) =>
          columnIndex === 5
            ? // 5th column has multiline content and
              // invisible div for earthquake details.
              // Want to keep the rows separated by newline
              // and get rid the hidden div.
              $(tdEl).children().remove("div").parent().text()
            : // $(tdEl).text()
              $(tdEl).text()
        )
        .toArray()
    );

  const freshEarthquakes = rawEqTableRows.map((row) => {
    const [
      _no,
      rEarthquakeAt,
      rLatitudeLongitude,
      rMagnitude,
      rDepth,
      rFeltOn,
    ] = row;

    const rawData = {
      earthquakeAt: rEarthquakeAt,
      latitudeLongitude: rLatitudeLongitude,
      magnitude: rMagnitude,
      depth: rDepth,
      // From observation,
      // felt on stations might be updated days
      // after the earthquake happens,
      // so this field is unstable.
      feltOn: rFeltOn,
    };

    // BMKG doesn't expose the earthquake id,
    // so we use the raw data to fingerprint each earthquake.
    // And if any of the column data is different, we assume it's
    // a new earthquake.
    // If the row from BMKG page is updated,
    // we might introduce duplicate here.
    // TODO: Consider a better duplicate prevention here.
    const fingerprintSha1Input = {
      earthquakeAt: rEarthquakeAt,
      latitudeLongitude: rLatitudeLongitude,
      magnitude: rMagnitude,
      depth: rDepth,
    };
    const rowSha1 = hash.sha1(fingerprintSha1Input);

    const earthquakeAt = parseWibTextDate(rEarthquakeAt);
    // Looking at the DOM,
    // looks like BMKG site use the date for keying the earthquake,
    // not sure how this works if the are multiple earthquakes in
    // the same seconds.
    // But we can use this id for computing a direct link to
    // the shake map.
    const bmkgEarthquakeId = computeBmkgEarthquakeId(earthquakeAt);

    const { latitude, longitude } =
      parseLatitudeLongitudeText(rLatitudeLongitude);
    const { locationText, stations } = parseFeltOnText(rFeltOn);
    return {
      earthquakeAt: earthquakeAt.toISOString(),
      latitude,
      longitude,
      magnitude: parseFloat(rMagnitude),
      depthInKm: parseDepthText(rDepth),
      shakeMapUrl: getBmkgShakeMapUrl(bmkgEarthquakeId),
      locationInIndonesian: locationText,
      feltOnStations: stations.join("|"),
      bmkgEarthquakeId,
      fingerprintSha1: rowSha1,
      rawData,
    };
  });

  const staleEarthquakes = await readJsonFile(savePath);
  const updated = mergeFeltEarthquakes(staleEarthquakes, freshEarthquakes, {
    mergeKey: MergeKey.BmkgEarthquakeId,
  });
  logIfCi({
    staleEarthquakes,
    freshEarthquakes,
    updated,
  });

  await writeJsonFile(savePath, updated);
} catch (error) {
  console.log(error);
}
