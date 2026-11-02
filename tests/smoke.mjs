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
  page.on("response", r => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
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

  // Second check: a longer email with a name Harper doesn't know.
  const SAMPLE = `Dear Ms. Novak,

I hope this email find you well. I am writing to follow up on the the order we discussed last week. Unfortunately, we have not recieve the payment yet, and i would like to confirm if their was any problem on your side.

Our team have already prepared an updated invoice. It include all the changes you requested, and we definately want to make sure everything is correct before we sent it. Could you please check it and let me know if you has any comments?

We could of shipped the goods earlier, but we was waiting for an confirmation from your warehouse. I think it is a important step, so we dont want to skip it.

Thank you for you patience. I am looking forward to receive your reply until Friday.`;
  await page.$eval("#src", (el, v) => { el.value = v; el.dispatchEvent(new Event("input")); }, SAMPLE);
  await new Promise(r => setTimeout(r, 2500));
  const tally2 = await page.$eval("#tally", e => e.textContent);
  const items2 = await page.$$eval("#issues li", lis => lis.map(li => li.innerText.replace(/\s+/g, " ").trim()));
  const fixed2 = await page.$eval("#fixed", e => e.textContent);
  console.log("\n== Sample email ==\nTally:", tally2);
  items2.forEach((t, i) => console.log(`  ${i + 1}. ${t.slice(0, 160)}`));
  console.log("Fixed version:\n" + fixed2);
  const keepsName = fixed2.includes("Ms. Novak");
  const usesRules = /finds you well/.test(fixed2) && /It includes/.test(fixed2);
  console.log("Keeps name:", keepsName, "| Custom rules applied:", usesRules);
  ok = ok && keepsName && usesRules;

  // Third check: quantity + singular noun.
  await page.$eval("#src", el => { el.value = "Many apple. Every days we get two order."; el.dispatchEvent(new Event("input")); });
  await new Promise(r => setTimeout(r, 2000));
  const fixed3 = await page.$eval("#fixed", e => e.textContent);
  console.log("\n== Quantity check ==\n" + fixed3);
  ok = ok && /Many apples/.test(fixed3) && /Every day /.test(fixed3) && /two orders/.test(fixed3);
} catch (e) {
  console.error("Smoke test error:", e);
} finally {
  await browser.close();
  server.close();
}
if (!ok) { console.error("SMOKE TEST FAILED"); process.exit(1); }
console.log("SMOKE TEST PASSED");
