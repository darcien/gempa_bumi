import { Earthquake } from "./bmkg_felt.ts";
import oldData from "./earthquakes/bmkg_earthquakes_felt.json" with {
  type: "json",
};
import { writeJsonFile } from "./utils.ts";

const savePath = "./earthquakes/bmkg_earthquakes_felt.json";

// BMKG could return earthquake with the wrong or inconistent timestamp.
// e.g. https://ews.bmkg.go.id/TEWS/data/20241023175558.mmi.jpg
// This earthquake has:
// - earthquakeAt: `2024-10-23T10:55:58.000Z`
// - rendered shakemap timestamp: "OCT 23, 2024 17:55:58 WIB"
// - rendered shakemap processed timestamp: "Mon Oct 23, 2023 18:51:59 WIB"
// - seen in the year: 2023, not 2024
// Which make the timestamp erroneous because the year is wrong.
// There's no 100% accurate way to automatically fix this type of error.
// So the only thing we will do here is to mark the earthquake as erroneous.

// This migration will be run at this timestamp.
// Any earthquakes happened after this timestamp will be considered
// as future earthquake and will be marked as erroneous.
const MIGRATION_TIMESTAMP = new Date("2024-03-20T18:39:23.388Z");

let affectedCount = 0;
const fixedData = (oldData as Array<Earthquake>).map((earthquake) => {
  if (new Date(earthquake.earthquakeAt) > MIGRATION_TIMESTAMP) {
    affectedCount += 1;
    return {
      ...earthquake,
      meta: {
        ...earthquake.meta,
        erroneousDataReason: "FUTURE_EARTHQUAKE",
      },
    };
  }

  return earthquake;
});

await writeJsonFile(savePath, fixedData);

console.log(`Updated ${affectedCount} row(s).`);
