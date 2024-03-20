import hash from "https://deno.land/x/object_hash@2.0.3.1/mod.ts";
import { deepMerge } from "https://deno.land/std@0.170.0/collections/deep_merge.ts";
import { z } from "https://deno.land/x/zod@v3.20.2/mod.ts";
import { logIfCi } from "./ci_utils.ts";
import { readJsonFile, writeJsonFile } from "./utils.ts";
import { computeBmkgEarthquakeId, getBmkgShakeMapUrl } from "./bmkg_utils.ts";

const savePath = "./earthquakes/bmkg_earthquakes_felt.json";

const url = "https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json";

const coordinatesRegex = /^-?\d+\.\d+,-?\d+\.\d+$/;
const coordinatesSchema = z.custom<`${number},${number}`>((value) =>
  coordinatesRegex.test(String(value))
);

const depthRegex = /^\d+ km$/;
const depthSchema = z.custom<`${number} km`>((value) =>
  depthRegex.test(String(value))
);

const now = new Date();

const bmkgApiResSchema = z
  .object({
    Infogempa: z.object({
      gempa: z.array(
        z.object({
          Tanggal: z.string(),
          Jam: z.string(),
          DateTime: z
            .string()
            .datetime({ offset: true })
            .transform((value) => new Date(value)),
          Coordinates: coordinatesSchema.transform((arg) => {
            const [rLatitude, rLongitude] = arg.split(",");
            return {
              latitude: parseFloat(rLatitude),
              longitude: parseFloat(rLongitude),
            };
          }),
          Lintang: z.string(),
          Bujur: z.string(),
          // Not using z.coerce.number() here as it uses Number(...)
          Magnitude: z.preprocess(
            (value) => parseFloat(String(value)),
            z.number(),
          ),
          Kedalaman: depthSchema.transform((arg) =>
            parseFloat(arg.split(" km").shift() || "")
          ),
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
        // From observation,
        // felt on stations might be updated days
        // after the earthquake happens,
        // so this field is unstable.
        feltOnStations: earthquake.Dirasakan,
      };

      const isFutureEarthquake = fresh.earthquakeAt > now;

      // Looking at the DOM,
      // looks like BMKG site use the date for keying the earthquake,
      // not sure how this works if the are multiple earthquakes in
      // the same seconds.
      // But we can use this id for computing a direct link to
      // the shake map.
      // On https://data.bmkg.go.id/gempabumi/, this id also referred to
      // as `kode_shakemap`.
      const bmkgEarthquakeId = computeBmkgEarthquakeId(fresh.earthquakeAt);
      const shakeMapUrl = getBmkgShakeMapUrl(bmkgEarthquakeId);
      return {
        ...fresh,
        earthquakeAt: fresh.earthquakeAt.toISOString(),
        bmkgEarthquakeId,
        shakeMapUrl,
        // BMKG doesn't expose the earthquake id,
        // so we use the raw data to fingerprint each earthquake.
        // And if any of the column data is different, we assume it's
        // a new earthquake.
        // If the row from BMKG page is updated,
        // we might introduce duplicate here.
        // TODO: Consider a better duplicate prevention here.
        fingerprintSha1: hash.sha1({
          earthquakeAt: fresh.earthquakeAt.toISOString(),
          latitude: fresh.latitude,
          longitude: fresh.longitude,
          magnitude: fresh.magnitude,
          depthInKm: fresh.depthInKm,
        }),
        ...(isFutureEarthquake
          ? { meta: { erroneousDataReason: "FUTURE_EARTHQUAKE" } }
          : null),
      } satisfies Earthquake;
    })
  );

enum MergeKey {
  FingerprintSha1 = "fingerprintSha1",
  BmkgEarthquakeId = "bmkgEarthquakeId",
}

type ErroneousDataReason = "FUTURE_EARTHQUAKE";

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

type FreshEarthquakes = z.infer<typeof bmkgApiResSchema>;
type FreshEarthquake = FreshEarthquakes[number];

function mergeFeltEarthquakes(
  staleEarthquakes: Array<Earthquake>,
  freshEarthquakes: Array<FreshEarthquake>,
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
        deepMerge(old, fresh, {
          arrays: "replace",
          maps: "replace",
          sets: "replace",
        }),
      );
    } else {
      merged.set(key, fresh);
    }
  });

  return Array.from(merged.values());
}

try {
  const res = await fetch(url);
  const json = await res.json();
  logIfCi(json);
  const freshEarthquakes = bmkgApiResSchema.parse(json);

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
