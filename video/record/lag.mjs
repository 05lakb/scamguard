// Finds the magenta flash that the recorder shows at a known moment, inside the finished video, so we know how far
// the video runs behind the recorder's clock. Used by record.mjs and by measure-lag.mjs. Runs in Cloud Shell only.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RATE = 20; // frames a second, read at a tiny size
const WIDTH = 16;
const HEIGHT = 9;

// The video tools that can read a video file: the one the recorder's browser brought, then the one Remotion brings.
function readers() {
  const found = [];
  const playwrightRoot = path.join(os.homedir(), ".cache", "ms-playwright");
  try {
    for (const dir of fs.readdirSync(playwrightRoot)) {
      const file = path.join(playwrightRoot, dir, "ffmpeg-linux");
      if (dir.startsWith("ffmpeg-") && fs.existsSync(file)) found.push({ name: "Playwright's ffmpeg", command: file, before: [] });
    }
  } catch { /* the folder may not exist */ }
  const remotion = path.resolve(HERE, "..", "node_modules", ".bin", "remotion");
  if (fs.existsSync(remotion)) found.push({ name: "Remotion's ffmpeg", command: remotion, before: ["ffmpeg"] });
  return found;
}

function framesFrom(reader, file, seconds) {
  const args = [...reader.before, "-v", "error", "-i", file, "-t", String(seconds), "-vf", `fps=${RATE},scale=${WIDTH}:${HEIGHT}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"];
  const run = spawnSync(reader.command, args, { maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0 || !run.stdout || run.stdout.length === 0) {
    return { error: String(run.stderr || run.error || "no output").split("\n")[0].slice(0, 200) };
  }
  return { data: run.stdout };
}

// Returns the time in seconds, inside the video, when the screen first turns magenta, or null.
export function findFlash(file, seconds = 24, log = console.log) {
  const tools = readers();
  if (tools.length === 0) { log("[lag] no tool found to read the video"); return null; }
  for (const tool of tools) {
    const result = framesFrom(tool, file, seconds);
    if (result.error) { log(`[lag] ${tool.name} could not read the video: ${result.error}`); continue; }
    const size = WIDTH * HEIGHT * 3;
    const frames = Math.floor(result.data.length / size);
    for (let i = 0; i < frames; i += 1) {
      let r = 0, g = 0, b = 0;
      for (let p = 0; p < size; p += 3) { r += result.data[i * size + p]; g += result.data[i * size + p + 1]; b += result.data[i * size + p + 2]; }
      const n = size / 3;
      if (r / n > 170 && b / n > 170 && g / n < 100) { log(`[lag] ${tool.name} found the flash at frame ${i} (${(i / RATE).toFixed(2)} s into the video)`); return i / RATE; }
    }
    log(`[lag] ${tool.name} read ${frames} frames but none was magenta`);
  }
  return null;
}
