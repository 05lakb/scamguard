// Measures how far the recording runs behind the recorder's clock, from the footage already on disk, and writes it
// into public/footage/marks.json. Run it in Cloud Shell after recording; build.sh does this before rendering.
//
//   node measure-lag.mjs
//
// If the flash cannot be found it uses a growing-gap model instead of nothing, because the video has been seen to run
// behind the clock by about 4%, and says so clearly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFlash } from "./lag.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FOOTAGE = path.resolve(HERE, "../public/footage");
const DEFAULT_DRIFT = 0.04; // measured by eye on earlier drafts: the video runs about 4% behind the clock
const FLASH_TO_SCENE3 = 1.95; // the flash is shown 0.9 s, then there is a 1 s pause before scene 3 starts

const marksFile = path.join(FOOTAGE, "marks.json");
const marks = JSON.parse(fs.readFileSync(marksFile, "utf8"));
// record.mjs writes when it showed the flash. Older footage did not, so estimate it from where scene 3 starts.
const flashAt = marks.flashAt ?? Math.max(0, marks.scene3.start - FLASH_TO_SCENE3);

const seen = findFlash(path.join(FOOTAGE, "demo.webm"));
if (seen === null) {
  marks.lag = 0;
  marks.drift = marks.drift ?? DEFAULT_DRIFT;
  console.log(`[lag] The flash was not found. Using the growing-gap model: the video runs ${(marks.drift * 100).toFixed(1)}% behind the clock. Check the video by eye.`);
} else {
  marks.lag = Math.min(8, Math.max(-1, seen - flashAt));
  marks.drift = marks.drift ?? 0;
  console.log(`[lag] The video runs ${marks.lag.toFixed(2)} s behind the recorder's clock (flash shown at ${flashAt.toFixed(2)} s, seen at ${seen.toFixed(2)} s).`);
}
fs.writeFileSync(marksFile, JSON.stringify(marks, null, 2) + "\n");
