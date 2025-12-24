import { BmkgEarthquakeId, getBmkgShakeMapUrl } from "./bmkg_felt_utils.ts";
import oldData from "./earthquakes/bmkg_earthquakes_felt.json" with {
  type: "json",
};
import { writeJsonFile } from "./utils.ts";

const savePath = "./earthquakes/bmkg_earthquakes_felt.json";

/**
 * Not sure since when, but the ews URL stopped serving the shake map images.
 * i.e. `https://ews.bmkg.go.id/TEWS/data/${bmkgEarthquakeId}.mmi.jpg`
 *
 * Current bmkg website now uses static.bmkg.go.id and seems to serve
 * old shake map images too.
 * So we could update all URLs instead of using mix of both.
 */
const fixedData = oldData.map((earthquake) => {
  return {
    ...earthquake,
    shakeMapUrl: getBmkgShakeMapUrl(
      earthquake.bmkgEarthquakeId as BmkgEarthquakeId,
    ),
  };
});

await writeJsonFile(savePath, fixedData);
