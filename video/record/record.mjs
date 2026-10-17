// Records the live site for the demo video, and takes fresh screenshots for the deck.
// Runs in Google Cloud Shell only (see run.sh). Everything it types is made-up data.
//
//   node record.mjs                 video and screenshots
//   ONLY=shots node record.mjs      screenshots only (a quick check, about 3 minutes)
//   ONLY=video node record.mjs      video only
//   SITE=https://example.web.app    record a different copy of the site
//
// The video is paced by the narration: it reads how long each spoken scene is (public/audio/durations.json) and
// does each click at a planned moment inside that scene, so the pictures and the voice line up.
// It writes public/footage/demo.webm and public/footage/marks.json (when each recorded scene starts).

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const box = page.locator("input[type=text]").first();
  await box.waitFor({ timeout: 8000 });
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
  const boxes = page.locator("textarea.f-area");
  try {
    // With no microphone the call falls back to typing by itself.
    await boxes.first().waitFor({ timeout: 12000 });
  } catch {
    await page.getByRole("button", { name: /End call/ }).click().catch(() => {});
    await sleep(500);
    await page.getByRole("button", { name: /Type the answers instead/ }).click();
    await boxes.first().waitFor({ timeout: 8000 });
  }
}

async function typeAnswers(page, until) {
  const boxes = page.locator("textarea.f-area");
  const count = await boxes.count();
  for (let i = 0; i < Math.min(count, ANSWERS.length); i += 1) {
    await glide(page, boxes.nth(i));
    await boxes.nth(i).click();
    await boxes.nth(i).pressSequentially(ANSWERS[i], { delay: 38 });
    if (until) await until(i);
  }
}

async function sendAnswers(page) {
  await click(page, page.getByRole("button", { name: /^Send answers$/ }));
  await page.locator(".verify-result").first().waitFor({ timeout: 90000 });
  await sleep(500);
}

async function openCase(page) {
  await click(page, page.getByRole("button", { name: /Open the case|case for the analyst|Open case/i }).first());
  await sleep(1200);
}

async function decide(page) {
  const keep = page.getByRole("button", { name: /Keep on hold/ }).first();
  await keep.waitFor({ timeout: 8000 });
  await click(page, keep);
  await sleep(600);
}

async function scrollBy(page, pixels) {
  for (let i = 0; i < 6; i += 1) { await page.mouse.wheel(0, pixels / 6); await sleep(90); }
}

// ---------- the video ----------

async function recordVideo(browser) {
  fs.mkdirSync(FOOTAGE, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(OUT, "video-"));
  const context = await browser.newContext({ viewport: VIDEO_SIZE, recordVideo: { dir: tmp, size: VIDEO_SIZE }, bypassCSP: true });
  await context.addInitScript(pointerScript);
  const page = await context.newPage();
  const time = clock();
  const L3 = lengthOf("scene3");
  const L4 = lengthOf("scene4");
  const marks = { fps: FPS, scene3: { start: 0 }, scene4: { start: 0 } };

  // A short lead-in so the landing page is already on screen when the first scene starts.
  await page.goto(SITE + "/", { waitUntil: "networkidle" }).catch(() => {});
  await time.until(2.2);

  // Scene 3: the live site, sign in, choose the case, analyse, and read the result.
  const s3 = time.now();
  marks.scene3.start = s3;
  log("scene3 starts at", s3.toFixed(2), "s, planned length", L3.toFixed(1), "s");
  await time.until(s3 + 0.10 * L3);
  await signIn(page);
  await time.until(s3 + 0.30 * L3);
  await goTo(page, "#/analyzer");
  await time.until(s3 + 0.38 * L3);
  await pickScenario(page);
  await time.until(s3 + 0.46 * L3);
  await analyse(page);
  await time.until(s3 + 0.74 * L3);
  await scrollBy(page, 420);
  await time.until(s3 + 0.88 * L3);
  await scrollBy(page, 520);
  await time.until(s3 + L3);
  log("scene3 ended at", time.now().toFixed(2), "s (late by", Math.max(0, time.now() - (s3 + L3)).toFixed(1), "s)");

  // Scene 4: the in-app call, the typed answers, and the analyst's decision.
  const s4 = time.now();
  marks.scene4.start = s4;
  log("scene4 starts at", s4.toFixed(2), "s, planned length", L4.toFixed(1), "s");
  await time.until(s4 + 0.04 * L4);
  await callFraudTeam(page);
  await time.until(s4 + 0.20 * L4);
  await typeAnswers(page, async (i) => { await time.until(s4 + (0.34 + 0.12 * i) * L4); });
  await time.until(s4 + 0.58 * L4);
  await sendAnswers(page);
  await time.until(s4 + 0.74 * L4);
  await openCase(page);
  await time.until(s4 + 0.86 * L4);
  await decide(page).catch((error) => log("decision step skipped:", error.message.split("\n")[0]));
  await time.until(s4 + L4);
  log("scene4 ended at", time.now().toFixed(2), "s (late by", Math.max(0, time.now() - (s4 + L4)).toFixed(1), "s)");
  await sleep(800);

  const video = page.video();
  await context.close(); // the file is only finished once the page is closed
  const source = await video.path();
  fs.copyFileSync(source, path.join(FOOTAGE, "demo.webm"));
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
    await goTo(page, "#/lab");
    await click(page, page.getByRole("button", { name: /Start a live run/ }));
    await sleep(45000); // a few cases finish while Gemini plays the customer
    await shot("red-team");
  });
  await attempt("evidence", async () => { await goTo(page, "#/evidence"); await sleep(1500); await shot("evidence"); });
  await attempt("architecture", async () => { await goTo(page, "#/architecture"); await sleep(1800); await shot("architecture"); });
  await context.close();
}

// ---------- go ----------

fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  if (ONLY !== "shots") await recordVideo(browser);
  if (ONLY !== "video") await takeScreenshots(browser);
} finally {
  await browser.close();
}
log("done");
