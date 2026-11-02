// Opens the built site in Chrome with the real Harper engine and checks that
// the example text gets flagged. Run by the deploy workflow before publishing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = process.argv[2] || "site";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, path.endsWith("/") ? path + "index.html" : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
}).listen(4173);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome", args: ["--no-sandbox"] });
let ok = false;
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:4173/", { waitUntil: "load" });

  await page.waitForFunction(() => /ready|err/.test(document.getElementById("engine").className), { timeout: 90000 });
  const engine = await page.$eval("#engine", e => e.textContent);
  console.log("Engine:", engine);

  // Check the built-in example (fresh browser → no saved draft).
  await page.waitForFunction(() => document.querySelectorAll("#issues li .fix, #issues li .ign").length > 0, { timeout: 30000 });
  const tally = await page.$eval("#tally", e => e.textContent);
  const items = await page.$$eval("#issues li", lis => lis.map(li => li.innerText.replace(/\s+/g, " ").trim()));
  const fixed = await page.$eval("#fixed", e => e.textContent);
  console.log("Tally:", tally);
  items.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("Fixed version:\n" + fixed);
  console.log("Console errors:", errors.length ? errors : "none");

  ok = /ready/.test(await page.$eval("#engine", e => e.className)) && items.length >= 2;
} catch (e) {
  console.error("Smoke test error:", e);
} finally {
  await browser.close();
  server.close();
}
if (!ok) { console.error("SMOKE TEST FAILED"); process.exit(1); }
console.log("SMOKE TEST PASSED");
