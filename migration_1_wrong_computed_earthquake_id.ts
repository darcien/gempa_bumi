import { computeBmkgEarthquakeId, getBmkgShakeMapUrl } from "./bmkg_utils.ts";
import oldData from "./earthquakes/bmkg_earthquakes_felt.json" assert { type: "json" };
import { writeJsonFile } from "./utils.ts";

const savePath = "./earthquakes/bmkg_earthquakes_felt.json";

// Old data has invalid earthquake id
// On dates with single digit date or month,
// `computeBmkgEarthquakeId()` will join
// the date and month directly without padding the value
// to 2 digits, creating an invalid id.
const fixedData = oldData.map((earthquake) => {
  const fixedEarthquakeId = computeBmkgEarthquakeId(
    new Date(earthquake.earthquakeAt)
  );
  return {
    ...earthquake,
    bmkgEarthquakeId: fixedEarthquakeId,
    shakeMapUrl: getBmkgShakeMapUrl(fixedEarthquakeId),
  };
});

await writeJsonFile(savePath, fixedData);
