// Tests the features added on 18 Oct against the live site, in a real browser, and writes a report:
// the playbook API, the simulated customer app with every ready-made scam story, the AI investigator on the
// dashboard, the in-app call, and the analyst's case. Runs in Google Cloud Shell only (see verify.sh).
// Everything it types is made-up data. It writes video/out/verify/report.json, report.txt and screenshots.
//
//   node verify-new.mjs                 every ready-made story
//   STORIES=2 node verify-new.mjs       only the first two (a quick check)
//   SITE=https://example.web.app node verify-new.mjs

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = (process.env.SITE || "https://lastmileguard.web.app").replace(/\/$/, "");
const LIMIT = Number(process.env.STORIES || 99);
const OUT = path.resolve(HERE, "../out/verify");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { site: SITE, startedAt: new Date().toISOString(), checks: [], stories: [], call: null, caseReview: null };
const say = (...parts) => console.log("[verify]", ...parts);

function check(name, ok, detail = "") {
  report.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  say(ok ? "PASS" : "FAIL", name, detail ? `- ${detail}` : "");
}

async function shot(page, name) {
  try { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); } catch { /* a missing picture is not a failed check */ }
}

// ---------- 1. the API, with no browser ----------
async function apiChecks() {
  try {
    const health = await (await fetch(`${SITE}/api/health`)).json();
    check("health: Gemini configured and Firestore storage", health.ok && health.ai_configured && health.storage === "firestore", JSON.stringify(health));
  } catch (e) { check("health", false, e.message); }
  try {
    const res = await fetch(`${SITE}/api/playbook`);
    const body = await res.json();
    const types = body.types || [];
    check("playbook API: 200 and eight scam types", res.status === 200 && types.length === 8, `${res.status}, ${types.length} types`);
    check("playbook: every type has red flags, safe advice and a public source link", types.every((t) => t.red_flags?.length && t.safe_advice && /^https:\/\//.test(t.source?.url || "")), "");
  } catch (e) { check("playbook API", false, e.message); }
  try {
    const res = await fetch(`${SITE}/api/cases`);
    const body = await res.json().catch(() => ({}));
    const count = Array.isArray(body) ? body.length : (body.cases || []).length;
    check("privacy: an anonymous visitor sees no cases", res.status === 200 ? count === 0 : res.status === 401 || res.status === 403, `${res.status}, ${count} cases`);
  } catch (e) { check("cases privacy", false, e.message); }
}

// ---------- 2. the browser ----------
async function signIn(page) {
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  const open = page.getByRole("button", { name: /Get started|Open command centre|Check a payment|Sign in/i }).first();
  await open.click();
  const box = page.locator("#analyst-name, [role=dialog] input").first();
  await box.waitFor({ timeout: 10000 });
  await box.fill("Verifier");
  await box.press("Enter");
  await sleep(2000);
}

async function pressPin(cust) {
  for (const digit of ["1", "2", "3", "4"]) await cust.locator(`.phone-screen button[aria-label="${digit}"]`).first().click();
}

// Waits for the phone to reach a final screen, or to ask a question. Returns which one.
async function waitForOutcome(cust, ms = 120000) {
  const start = Date.now();
  const marks = [
    ["allow", /Payment sent/], ["ask", /One quick question/], ["warn", /Please check before you send/], ["hold", /paused your payment/i],
  ];
  while (Date.now() - start < ms) {
    for (const [name, re] of marks) {
      if (await cust.getByRole("heading", { name: re }).first().isVisible().catch(() => false)) return { name, seconds: (Date.now() - start) / 1000 };
    }
    const error = await cust.locator(".phone-error").first().textContent({ timeout: 300 }).catch(() => "");
    if (error) return { name: "error", seconds: (Date.now() - start) / 1000, error };
    await sleep(400);
  }
  return { name: "timeout", seconds: ms / 1000 };
}

async function investigatorOnDashboard(dash) {
  const panel = dash.locator('section[aria-label="AI investigator"]').first();
  const found = await panel.waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  if (!found) return { shown: false };
  await sleep(1500);
  return {
    shown: true,
    heading: (await panel.locator("h3").first().textContent().catch(() => "")) || "",
    steps: await panel.locator(".agent-steps li").count(),
    cited: await panel.locator(".agent-cite.on").count(),
    hasSummary: (await panel.locator(".agent-summary").count()) > 0,
    stoppedEarly: (await panel.getByText(/stopped early/).count()) > 0,
    unavailable: (await panel.getByText(/Investigator unavailable/).count()) > 0,
  };
}

async function runStories(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dash = await ctx.newPage();
  const cust = await ctx.newPage();
  await cust.setViewportSize({ width: 430, height: 900 });
  // headless Chrome has a voice-recognition object that never works, so make the app use its typed path
  await cust.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; });
  const logs = [];
  for (const p of [dash, cust]) p.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

  await signIn(dash);
  check("dashboard: sign-in works", /#\//.test(dash.url()), dash.url());
  await dash.evaluate(() => { window.location.hash = "#/analyzer"; });
  await sleep(1200);

  await cust.goto(`${SITE}/#/customer`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  check("customer app: opens without a sign-in", await cust.getByText("Your Bank").first().isVisible().catch(() => false));
  await shot(cust, "00-customer-home");

  await cust.locator(".phone-demo-btn").click();
  const labels = await cust.locator(".presenter-stories .chip-btn").allTextContents();
  check("customer app: ready-made scam stories are listed", labels.length >= 6, `${labels.length}: ${labels.join(" | ")}`);
  await shot(cust, "01-presenter-controls");

  let heldOnce = false;
  for (let i = 0; i < Math.min(labels.length, LIMIT); i += 1) {
    const label = labels[i].trim();
    const row = { label, outcome: null, seconds: null, investigator: null, error: null, asked: false };
    say(`story ${i + 1} of ${labels.length}: ${label}`);
    try {
      if (!(await cust.locator(".presenter-stories").isVisible().catch(() => false))) await cust.locator(".phone-demo-btn").click();
      await cust.locator(".presenter-stories .chip-btn").nth(i).click();
      await sleep(500);
      await cust.locator(".phone-btn.primary", { hasText: /^Pay / }).click();
      await pressPin(cust);
      let result = await waitForOutcome(cust);
      row.seconds = Math.round(result.seconds * 10) / 10;
      if (result.name === "ask") {
        row.asked = true;
        const genuine = /genuine|legit|rent|salary|family|friend|supplier|invoice|grocer|bill/i.test(label);
        await cust.locator("textarea.phone-input, input.phone-input").last().fill(genuine
          ? "It is the rent for my flat, I pay the same landlord every month."
          : "A man from the bank phoned me and told me to move the money to a safe account. He is still on the line.");
        await cust.getByRole("button", { name: /Send answer/ }).click();
        result = await waitForOutcome(cust);
        row.seconds = Math.round((row.seconds + result.seconds) * 10) / 10;
      }
      row.outcome = result.name;
      row.error = result.error || null;
      if (result.name === "warn" || result.name === "hold") row.investigator = await investigatorOnDashboard(dash);
      await shot(cust, `story-${String(i + 1).padStart(2, "0")}-phone`);
      await shot(dash, `story-${String(i + 1).padStart(2, "0")}-dashboard`);
      if (result.name === "hold" && !heldOnce) { heldOnce = true; row.keptForCall = true; }
    } catch (e) {
      row.error = (e.message || "").split("\n")[0];
    }
    report.stories.push(row);
    check(`story "${label}" reached a result`, ["allow", "warn", "hold"].includes(row.outcome), `${row.outcome}${row.error ? ` (${row.error})` : ""}, ${row.seconds}s${row.asked ? ", asked a question first" : ""}`);
    if (row.investigator) check(`story "${label}": the AI investigator shows its lookups and a cited summary`, row.investigator.shown && row.investigator.steps > 0 && row.investigator.hasSummary && !row.investigator.unavailable, JSON.stringify(row.investigator));
    if (row.keptForCall) await runCall(cust, dash);
    if (row.outcome === "error" && /wait|limit|too many/i.test(row.error || "")) { say("the site asked to slow down; stopping the story loop"); break; }
    await cust.evaluate(() => { window.location.hash = "#/customer"; });
    await cust.reload({ waitUntil: "domcontentloaded" });
    await sleep(1200);
  }
  report.pageErrors = logs.slice(0, 10);
  check("no page errors in the browser console", logs.length === 0, logs.slice(0, 3).join(" ; "));
  await reviewCase(dash);
  await ctx.close();
}

// ---------- 3. the in-app call, on the phone that just got a hold ----------
async function runCall(cust, dash) {
  const call = { started: false, finished: false, seconds: null, error: null };
  const t0 = Date.now();
  try {
    await cust.getByRole("button", { name: /Call fraud team/ }).click();
    const boxes = cust.locator(".phone-call textarea");
    await boxes.first().waitFor({ timeout: 30000 });
    call.started = true;
    await boxes.nth(0).fill("A man from the bank phoned me first. He said my account was hacked.");
    if (await boxes.nth(1).count()) await boxes.nth(1).fill("Yes, he is still on the phone with me and told me not to tell anyone.");
    await cust.getByRole("button", { name: /Send answers/ }).click();
    await cust.getByText(/Thank you|specialist will confirm|Back to the payment/i).first().waitFor({ timeout: 90000 });
    call.finished = true;
  } catch (e) { call.error = (e.message || "").split("\n")[0]; }
  call.seconds = Math.round((Date.now() - t0) / 100) / 10;
  report.call = call;
  await shot(cust, "call-phone");
  await shot(dash, "call-dashboard");
  check("in-app call: questions shown, answers sent, result returned", call.started && call.finished, JSON.stringify(call));
}

// ---------- 4. the analyst's side ----------
async function reviewCase(dash) {
  const review = { cases: 0, investigatorInCase: false, decided: false, error: null };
  try {
    await dash.evaluate(() => { window.location.hash = "#/cases"; });
    await sleep(2000);
    review.cases = await dash.locator("tr, .case-row, [data-case], .case-card").count();
    await shot(dash, "cases-list");
    const open = dash.getByRole("button", { name: /Open the case|Open case|Review/i }).first();
    if (await open.isVisible().catch(() => false)) { await open.click(); await sleep(1500); }
    review.investigatorInCase = (await dash.locator('section[aria-label="AI investigator"]').count()) > 0;
    const keep = dash.getByRole("button", { name: /Keep on hold/ }).first();
    if (await keep.isVisible().catch(() => false)) { await keep.click(); await sleep(1200); review.decided = true; }
    await shot(dash, "cases-review");
  } catch (e) { review.error = (e.message || "").split("\n")[0]; }
  report.caseReview = review;
  check("analyst: cases are listed after the payments", review.cases > 0, `${review.cases} rows`);
  check("analyst: the case shows the AI investigator's findings", review.investigatorInCase, "");
  check("analyst: a decision can be made on a held case", review.decided, review.error || "");
}

// ---------- run ----------
let browser;
try {
  await apiChecks();
  browser = await chromium.launch({ headless: true });
  await runStories(browser);
} catch (e) {
  check("the test run finished without crashing", false, (e.message || "").split("\n")[0]);
  if (/libraries|Executable/i.test(e.message || "")) process.exitCode = 42;
} finally {
  await browser?.close().catch(() => {});
  report.finishedAt = new Date().toISOString();
  const passed = report.checks.filter((c) => c.ok).length;
  const lines = [`Checked ${SITE} at ${report.finishedAt}`, `${passed} of ${report.checks.length} checks passed`, ""];
  for (const c of report.checks) lines.push(`${c.ok ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  [${c.detail}]` : ""}`);
  lines.push("", "Stories:");
  for (const s of report.stories) lines.push(`  ${s.label}: ${s.outcome}${s.asked ? " (asked first)" : ""} in ${s.seconds}s; investigator ${s.investigator ? (s.investigator.shown ? `${s.investigator.steps} lookups, ${s.investigator.cited} cited` : "not shown") : "n/a"}`);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "report.txt"), lines.join("\n") + "\n");
  console.log("\n" + lines.join("\n"));
}
