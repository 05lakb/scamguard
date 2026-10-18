// Records the live site for the demo video, and takes fresh screenshots for the deck.
// Runs in Google Cloud Shell only (see run.sh). Everything it types is made-up data.
//
//   node record.mjs                 video and screenshots
//   ONLY=shots node record.mjs      screenshots only (a quick check, about 3 minutes)
//   ONLY=video node record.mjs      video only
//   ONLY=dashboard node record.mjs  just the command-centre screenshot, with the recorded examples switched on
//   SITE=https://example.web.app    record a different copy of the site
//
// The video is paced by the narration: it reads how long each spoken scene is (public/audio/durations.json) and
// does each click at a planned moment inside that scene, so the pictures and the voice line up.
// It writes public/footage/demo.webm and public/footage/marks.json (when each recorded scene starts).

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findFlash } from "./lag.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = (process.env.SITE || "https://lastmileguard.web.app").replace(/\/$/, "");
const ONLY = process.env.ONLY || "all";
const OUT = path.resolve(HERE, "../out");
const SHOTS = path.join(OUT, "shots");
const FOOTAGE = path.resolve(HERE, "../public/footage");
const durations = JSON.parse(fs.readFileSync(path.resolve(HERE, "../public/audio/durations.json"), "utf8"));

const FPS = 30;
const LEAD = 0.6; // the same pauses the video adds around each spoken scene
const TAIL = 1.2;
const lengthOf = (id) => Math.ceil((durations[id].seconds + LEAD + TAIL) * FPS) / FPS;

// The recorded part of the video is 1280 wide and 620 tall; a title strip and the captions fill the rest of the frame.
const VIDEO_SIZE = { width: 1280, height: 620 };
// Full HD: the page is laid out at 1280 by 620 but drawn at 1.5 times the pixels, and the recording is 1920 by 930.
const HD = Number(process.env.HD_SCALE || 1.5);
const VIDEO_FILE_SIZE = { width: Math.round(VIDEO_SIZE.width * HD), height: Math.round(VIDEO_SIZE.height * HD) };
const SHOT_SIZE = { width: 1440, height: 810 };

const ANSWERS = [
  "A man from the bank phoned me first. He said my account was hacked.",
  "Yes, he is still on the phone with me, and he told me not to tell anyone.",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log("[record]", ...parts);

function clock() {
  const start = Date.now();
  const now = () => (Date.now() - start) / 1000;
  return { now, until: async (seconds) => { const wait = seconds - now(); if (wait > 0) await sleep(wait * 1000); } };
}

// A visible pointer, because a screen recording made this way does not draw the mouse.
function pointerScript() {
  const make = () => {
    if (document.getElementById("rec-cursor") || !document.body) return false;
    const dot = document.createElement("div");
    dot.id = "rec-cursor";
    Object.assign(dot.style, {
      position: "fixed", left: "-60px", top: "-60px", width: "24px", height: "24px", borderRadius: "50%",
      background: "rgba(45,212,191,0.35)", border: "2px solid #2dd4bf", zIndex: "2147483647",
      pointerEvents: "none", transform: "translate(-50%, -50%)", transition: "width .12s, height .12s, background .12s",
    });
    document.body.appendChild(dot);
    return true;
  };
  const timer = setInterval(() => { if (make()) clearInterval(timer); }, 50);
  const set = (size, background) => { const d = document.getElementById("rec-cursor"); if (d) { d.style.width = d.style.height = size; d.style.background = background; } };
  window.addEventListener("mousemove", (e) => { const d = document.getElementById("rec-cursor"); if (d) { d.style.left = e.clientX + "px"; d.style.top = e.clientY + "px"; } }, true);
  window.addEventListener("mousedown", () => set("38px", "rgba(45,212,191,0.7)"), true);
  window.addEventListener("mouseup", () => set("24px", "rgba(45,212,191,0.35)"), true);
}

async function launch() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    console.error("[record] The browser could not start:", error.message.split("\n")[0]);
    console.error("[record] If it says libraries are missing, run:  sudo npx playwright install-deps chromium");
    process.exit(42);
  }
}

// ---------- the steps of the story, shared by the video and the screenshots ----------

async function glide(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
}

async function click(page, locator) {
  await glide(page, locator);
  await sleep(250);
  await locator.click();
}

async function goTo(page, hash) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(900);
}

async function signIn(page, name = "Demo") {
  await click(page, page.getByRole("button", { name: /^Get started$|Open command centre/ }).first());
  // The name box is the one field in the sign-in window (it has the id analyst-name and no type attribute).
  const box = page.locator("#analyst-name, [role=dialog] input").first();
  await box.waitFor({ timeout: 10000 });
  await box.pressSequentially(name, { delay: 90 });
  await sleep(300);
  await box.press("Enter");
  await page.waitForFunction(() => window.location.hash.startsWith("#/"), null, { timeout: 8000 }).catch(() => {});
  await sleep(900);
}

async function pickScenario(page) {
  await click(page, page.getByRole("button", { name: /^Bank-impersonation call$/ }).first());
  await sleep(500);
}

async function analyse(page) {
  await click(page, page.getByRole("button", { name: /Analyse transaction/ }).first());
  await page.getByText(/HELD FOR REVIEW/i).first().waitFor({ timeout: 60000 });
  await sleep(600);
}

async function callFraudTeam(page) {
  await click(page, page.getByRole("button", { name: /Call fraud team/ }).first());
  // The Voice AI page also has a big transcript box, so look for the answer boxes inside the call panel only.
  const boxes = page.locator(".verify-panel textarea");
  try {
    // With no microphone the call falls back to typing by itself.
    await boxes.first().waitFor({ timeout: 3500 });
  } catch {
    await page.getByRole("button", { name: /End call/ }).click().catch(() => {});
    await sleep(500);
    await page.getByRole("button", { name: /Type the answers instead/ }).click();
    await boxes.first().waitFor({ timeout: 8000 });
  }
}

async function typeAnswers(page, until) {
  const boxes = page.locator(".verify-panel textarea");
  const count = await boxes.count();
  for (let i = 0; i < Math.min(count, ANSWERS.length); i += 1) {
    await glide(page, boxes.nth(i));
    await boxes.nth(i).click();
    await boxes.nth(i).pressSequentially(ANSWERS[i], { delay: 24 });
    if (until) await until(i);
  }
}

async function sendAnswers(page) {
  await click(page, page.getByRole("button", { name: /^Send answers$/ }));
  await page.locator(".verify-result").first().waitFor({ timeout: 90000 });
  await sleep(500);
}

async function openCase(page) {
  // After the answers are checked, the call page offers a way back to the payment (and returns by itself after a few
  // seconds). Go back at once if it is still there, then open the case from the payment page.
  const back = page.getByRole("button", { name: /Back to the payment/ }).first();
  await back.waitFor({ timeout: 4000 }).catch(() => {});
  if (await back.isVisible().catch(() => false)) await click(page, back);
  await sleep(700);
  await click(page, page.getByRole("button", { name: /Open the case|case for the analyst|Open case/i }).first());
  await sleep(1200);
}

async function decide(page) {
  const keep = page.getByRole("button", { name: /Keep on hold/ }).first();
  await keep.waitFor({ timeout: 8000 });
  await click(page, keep);
  await sleep(600);
}

async function startRedTeam(page) {
  // The site allows only a few live runs an hour per visitor. If it asks to wait, wait and try again.
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await click(page, page.getByRole("button", { name: /Start a live run|Run again/ }).first());
    await sleep(3500);
    const refused = await page.getByText(/Please wait|are paused|already going/i).first().isVisible().catch(() => false);
    if (!refused) return;
    log("the site asked to wait before another live run; waiting 70 s (try " + attempt + " of 4)");
    await sleep(70000);
  }
}

async function scrollBy(page, pixels) {
  for (let i = 0; i < 6; i += 1) { await page.mouse.wheel(0, pixels / 6); await sleep(90); }
}

// ---------- the video ----------

async function recordVideo(browser) {
  fs.mkdirSync(FOOTAGE, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(OUT, "video-"));
  const context = await browser.newContext({ viewport: VIDEO_SIZE, deviceScaleFactor: HD, recordVideo: { dir: tmp, size: VIDEO_FILE_SIZE }, bypassCSP: true });
  await context.addInitScript(pointerScript);
  const page = await context.newPage();
  const time = clock();
  const L3 = lengthOf("scene3");
  const L4 = lengthOf("scene4");
  const marks = { fps: FPS, lag: 0, scene3: { start: 0, end: 0 }, scene4: { start: 0, end: 0 }, scene4v: { start: 0, end: 0 }, scene4r: { start: 0, end: 0 } };

  // A short lead-in so the landing page is already on screen when the first scene starts.
  await page.goto(SITE + "/", { waitUntil: "networkidle" }).catch(() => {});
  const flashAt = time.now() + 0.4;
  await time.until(flashAt);
  await page.evaluate(() => {
    const cue = document.createElement("div");
    cue.id = "sync-cue";
    cue.style.cssText = "position:fixed;inset:0;background:#ff00ff;z-index:2147483647";
    document.body.appendChild(cue);
  });
  await sleep(900);
  await page.evaluate(() => document.getElementById("sync-cue")?.remove());
  await time.until(time.now() + 1.0);

  // Scene 3: the live site, sign in, choose the case, analyse, and read the result.
  const s3 = time.now();
  marks.scene3.start = s3;
  log("scene3 starts at", s3.toFixed(2), "s, planned length", L3.toFixed(1), "s");
  await time.until(s3 + 0.04 * L3);
  await signIn(page);
  await time.until(s3 + 0.22 * L3);
  await goTo(page, "#/analyzer");
  await time.until(s3 + 0.36 * L3);
  await pickScenario(page);
  await time.until(s3 + 0.48 * L3);
  await analyse(page);
  await time.until(s3 + 0.76 * L3);
  await scrollBy(page, 420);
  await time.until(s3 + 0.88 * L3);
  await scrollBy(page, 520);
  await time.until(s3 + L3);
  marks.scene3.end = time.now();
  log("scene3 ended at", time.now().toFixed(2), "s (late by", Math.max(0, time.now() - (s3 + L3)).toFixed(1), "s)");

  // Scene 4: the in-app call, the typed answers, and the analyst's decision.
  const s4 = time.now();
  marks.scene4.start = s4;
  log("scene4 starts at", s4.toFixed(2), "s, planned length", L4.toFixed(1), "s");
  const note = (what) => log("scene4:", what, "at", (time.now() - s4).toFixed(1), "s into the scene");
  await time.until(s4 + 0.10 * L4);
  await callFraudTeam(page);
  note("call panel and typing boxes ready");
  await typeAnswers(page);
  note("answers typed");
  await sendAnswers(page);
  note("answers checked");
  await openCase(page);
  note("case opened");
  await time.until(s4 + 0.78 * L4);
  await decide(page).catch((error) => log("decision step skipped:", error.message.split("\n")[0]));
  note("decision made");
  await sleep(1800); // a short tail so the decision stays on screen
  await time.until(s4 + L4);
  marks.scene4.end = time.now();
  log("scene4 ended at", time.now().toFixed(2), "s (late by", Math.max(0, time.now() - (s4 + L4)).toFixed(1), "s)");
  // Scene: the Voice AI page reads a pasted digital-arrest call.
  const LV = lengthOf("scene4v");
  const sv = time.now();
  marks.scene4v.start = sv;
  log("scene4v (Voice AI) starts at", sv.toFixed(2), "s, planned length", LV.toFixed(1), "s");
  await goTo(page, "#/voice");
  await time.until(sv + 0.10 * LV);
  await click(page, page.getByRole("button", { name: /^Digital arrest$/ }));
  await time.until(sv + 0.30 * LV);
  await click(page, page.getByRole("button", { name: /Analyse for phishing/ }));
  await page.getByText(/risk level/i).first().waitFor({ timeout: 45000 });
  await time.until(sv + 0.55 * LV);
  await scrollBy(page, 360);
  await sleep(3500); // keep the result on screen
  await time.until(sv + LV);
  marks.scene4v.end = time.now();
  log("scene4v ended at", marks.scene4v.end.toFixed(2), "s");

  // Scene: the live red team, four cases. The real run takes a minute or two, so the video plays it sped up.
  const LR = lengthOf("scene4r");
  const sr = time.now();
  marks.scene4r.start = sr;
  log("scene4r (red team) starts at", sr.toFixed(2), "s, planned length", LR.toFixed(1), "s");
  await goTo(page, "#/lab");
  await time.until(sr + 0.08 * LR);
  await page.getByLabel(/Scenarios/).selectOption("4");
  await startRedTeam(page);
  await page.getByRole("button", { name: /Skip animation/ }).click().catch(() => {});
  await page.getByText(/This run in summary/).waitFor({ timeout: 240000 });
  await sleep(800);
  await page.getByText(/Live feed/i).first().scrollIntoViewIfNeeded();
  await sleep(2200);
  await page.getByText(/This run in summary/).scrollIntoViewIfNeeded();
  await sleep(5000); // keep the summary on screen
  await time.until(sr + LR);
  marks.scene4r.end = time.now();
  log("scene4r ended at", marks.scene4r.end.toFixed(2), "s; real run took", (marks.scene4r.end - sr).toFixed(1), "s");
  await sleep(7000);

  const video = page.video();
  await context.close(); // the file is only finished once the page is closed
  const source = await video.path();
  fs.copyFileSync(source, path.join(FOOTAGE, "demo.webm"));
  const seen = findFlash(path.join(FOOTAGE, "demo.webm"), 24, log);
  marks.flashAt = flashAt;
  marks.lag = seen === null ? 0 : Math.min(8, Math.max(-1, seen - flashAt));
  log(seen === null ? "lag not measured, using 0" : "the video runs " + marks.lag.toFixed(2) + " s behind the clock (flash planned at " + flashAt.toFixed(2) + " s, seen at " + seen.toFixed(2) + " s)");
  fs.writeFileSync(path.join(FOOTAGE, "marks.json"), JSON.stringify(marks, null, 2) + "\n");
  log("saved footage/demo.webm", Math.round(fs.statSync(path.join(FOOTAGE, "demo.webm")).size / 1024), "KB and marks.json", JSON.stringify(marks));
}

// ---------- the screenshots ----------

async function takeScreenshots(browser) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const context = await browser.newContext({ viewport: SHOT_SIZE, deviceScaleFactor: 1.5, bypassCSP: true });
  const page = await context.newPage();
  const shot = async (name) => {
    await sleep(700);
    await page.screenshot({ path: path.join(SHOTS, name + ".png") });
    log("screenshot", name);
  };
  const attempt = async (label, work) => {
    try { await work(); } catch (error) { log("SKIPPED", label, "-", error.message.split("\n")[0]); }
  };

  await page.goto(SITE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await attempt("landing", () => shot("landing"));
  await attempt("sign in", () => signIn(page));
  await attempt("dashboard", async () => { await goTo(page, "#/dashboard"); await sleep(1500); await shot("dashboard"); });
  await attempt("transactions", async () => {
    await goTo(page, "#/analyzer");
    await pickScenario(page);
    await analyse(page);
    await page.getByText(/HELD FOR REVIEW/i).first().scrollIntoViewIfNeeded();
    await shot("transactions-held");
    await scrollBy(page, 600);
    await shot("transactions-notice");
  });
  await attempt("agent call", async () => {
    await callFraudTeam(page);
    await typeAnswers(page);
    await page.locator(".verify-panel").first().scrollIntoViewIfNeeded();
    await shot("ai-agent-call");
    await sendAnswers(page);
    await page.locator(".verify-result").first().scrollIntoViewIfNeeded();
    await shot("agent-outcome");
    await openCase(page);
    await shot("cases-review");
  });
  await attempt("voice phishing", async () => {
    await goTo(page, "#/voice");
    await click(page, page.getByRole("button", { name: /^Digital arrest$/ }));
    await click(page, page.getByRole("button", { name: /Analyse for phishing/ }));
    await page.getByText(/risk/i).first().waitFor({ timeout: 40000 });
    await sleep(2500);
    await shot("voice-phishing");
  });
  await attempt("red team", async () => {
    // Four scenarios keep the run short. Skip the replay animation so the results appear as soon as they are ready.
    await goTo(page, "#/lab");
    await page.getByLabel(/Scenarios/).selectOption("4");
    await click(page, page.getByRole("button", { name: /Start a live run/ }));
    await sleep(4000);
    await page.getByRole("button", { name: /Skip animation/ }).click().catch(() => {});
    await page.getByText(/This run in summary/).waitFor({ timeout: 180000 });
    await sleep(1000);
    await page.getByText(/Live feed/i).first().scrollIntoViewIfNeeded();
    await shot("red-team");
    await page.getByText(/This run in summary/).scrollIntoViewIfNeeded();
    await shot("red-team-summary");
  });
  await attempt("evidence", async () => { await goTo(page, "#/evidence"); await sleep(1500); await shot("evidence"); });
  await attempt("architecture", async () => { await goTo(page, "#/architecture"); await sleep(1800); await shot("architecture"); });
  await context.close();
}

// ---------- the command-centre screenshot with real numbers ----------

async function dashboardShot(browser) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const context = await browser.newContext({ viewport: SHOT_SIZE, deviceScaleFactor: 1.5, bypassCSP: true });
  const page = await context.newPage();
  await page.goto(SITE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await signIn(page);
  await goTo(page, "#/dashboard");
  // A fresh session has no checked payments yet, so show the recorded examples to fill in the numbers.
  await click(page, page.getByRole("button", { name: /Include recorded examples/ })).catch((error) => log("recorded examples switch skipped:", error.message.split("\n")[0]));
  await sleep(2500);
  await page.screenshot({ path: path.join(SHOTS, "dashboard.png") });
  log("screenshot dashboard (with recorded examples)");
  await context.close();
}

// ---------- go ----------

fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  if (ONLY === "dashboard") {
    await dashboardShot(browser);
  } else {
    if (ONLY !== "shots") await recordVideo(browser);
    if (ONLY !== "video") await takeScreenshots(browser);
  }
} finally {
  await browser.close();
}
log("done");
