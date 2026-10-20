#!/usr/bin/env node
// Compare vision models on your own receipts through Vercel AI Gateway.
//   pnpm bench                          default models, 2 runs each
//   pnpm bench -- --models a/b,c/d --runs 3
//   pnpm bench -- --only thai,notes    only cases whose name contains one of these
//   pnpm bench -- --thinking 0          Gemini thinking budget in tokens (0 = off)
//   pnpm bench -- --dry-run             show the plan and estimated cost only
//
// Cases: bench/private/<name>.(jpg|png|webp) + <name>.expected.json
// (bench/private is git-ignored; see bench/README.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractReceipt, scoreReceipt } from "../packages/extractor/dist/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const DEFAULT_MODELS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4o-mini",
  "openai/gpt-4.1-mini",
  "mistral/mistral-small",
];
const models = (opt("models") ?? DEFAULT_MODELS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const runs = Number(opt("runs", 2));
// bench/cases = synthetic documents kept in the repo; bench/private = yours (git-ignored).
const casesDirs = (opt("cases") ? [path.resolve(opt("cases"))] : [path.join(root, "cases"), path.join(root, "private")]);
const concurrency = Number(opt("concurrency", 3));
// --thinking N: cap Gemini's thinking at N tokens (0 = off) instead of the library default.
const thinking = opt("thinking");
const providerOptions = thinking === undefined ? undefined : { google: { thinkingConfig: { thinkingBudget: Number(thinking) } } };

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const only = (opt("only") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const allCases = casesDirs.filter((d) => fs.existsSync(d)).flatMap((casesDir) =>
  fs.readdirSync(casesDir)
    .filter((f) => MIME[path.extname(f).toLowerCase()])
    .map((f) => {
      const base = f.slice(0, -path.extname(f).length);
      const expectedPath = path.join(casesDir, `${base}.expected.json`);
      return fs.existsSync(expectedPath)
        ? { name: base, file: path.join(casesDir, f), mediaType: MIME[path.extname(f).toLowerCase()], expected: JSON.parse(fs.readFileSync(expectedPath, "utf8")) }
        : null;
    })
    .filter(Boolean),
);
const cases = only.length ? allCases.filter((c) => only.some((o) => c.name.includes(o))) : allCases;

if (cases.length === 0) {
  console.error(`No cases in ${casesDirs.join(", ")}. Add <name>.jpg and <name>.expected.json (see bench/README.md).`);
  process.exit(1);
}

// Public catalog: per-token prices for the cost column. Never sent any image.
let prices = {};
try {
  const res = await fetch("https://ai-gateway.vercel.sh/v1/models");
  for (const m of (await res.json()).data) prices[m.id] = { in: Number(m.pricing?.input), out: Number(m.pricing?.output) };
} catch {
  console.warn("Could not load the price list; cost will show as n/a.");
}
const unknown = models.filter((m) => !prices[m] && Object.keys(prices).length);
if (unknown.length) console.warn(`Not in the Gateway catalog (will probably fail): ${unknown.join(", ")}`);

const total = models.length * cases.length * runs;
const estUsd = models.reduce((s, m) => s + (prices[m] ? (3000 * prices[m].in + 2000 * prices[m].out) : 0), 0) * cases.length * runs;
console.log(`Models: ${models.length}  Cases: ${cases.length} (${cases.map((c) => c.name).join(", ")})  Runs each: ${runs}  Calls: ${total}`);
console.log(`Rough cost: about $${estUsd.toFixed(3)} (assumes ~3k input + ~2k output tokens per call)`);
if (flag("dry-run")) process.exit(0);

if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error("Set AI_GATEWAY_API_KEY (e.g. in apps/web/.env.local; `pnpm bench` loads it).");
  process.exit(1);
}

const jobs = [];
for (const model of models) for (const c of cases) for (let run = 1; run <= runs; run++) jobs.push({ model, c, run });

async function runJob({ model, c, run }) {
  const image = new Uint8Array(fs.readFileSync(c.file));
  const t0 = Date.now();
  try {
    const { receipt, usage } = await extractReceipt({ image, mediaType: c.mediaType, model, providerOptions, abortSignal: AbortSignal.timeout(120_000) });
    const score = scoreReceipt(receipt, c.expected);
    const p = prices[model];
    const cost = p && usage?.inputTokens != null && usage?.outputTokens != null ? usage.inputTokens * p.in + usage.outputTokens * p.out : null;
    return { model, case: c.name, run, ok: true, ms: Date.now() - t0, score, usage, cost, flags: receipt.flags.length, receipt };
  } catch (e) {
    // A handwritten test document is supposed to be refused; that is the right answer.
    if (e?.name === "HandwritingNotSupportedError" && c.expected.handwritten === true) {
      return { model, case: c.name, run, ok: true, ms: Date.now() - t0, flags: 0, cost: null,
        score: { accuracy: 1, passed: 1, total: 1, descriptionSimilarity: null, checks: [{ field: "refusedHandwriting", pass: true }] } };
    }
    return { model, case: c.name, run, ok: false, ms: Date.now() - t0, error: `${e?.name ?? "Error"}${e?.statusCode ? ` ${e.statusCode}` : ""}${e?.lastError?.statusCode ? ` (last HTTP ${e.lastError.statusCode})` : ""}` };
  }
}

const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const r = await runJob(job);
      results.push(r);
      console.log(`  ${r.ok ? "ok  " : "FAIL"} ${job.model} / ${job.c.name} #${job.run}  ${(r.ms / 1000).toFixed(1)}s ${r.ok ? `${Math.round(r.score.accuracy * 100)}%` : r.error}`);
    }
  }),
);

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v, f) => (v == null ? "n/a" : f(v));
const rows = models.map((model) => {
  const rs = results.filter((r) => r.model === model);
  const ok = rs.filter((r) => r.ok);
  return {
    model,
    ok: `${ok.length}/${rs.length}`,
    acc: avg(ok.map((r) => r.score.accuracy)),
    perfect: ok.filter((r) => r.score.accuracy === 1).length,
    desc: avg(ok.map((r) => r.score.descriptionSimilarity).filter((v) => v != null)),
    secs: avg(ok.map((r) => r.ms / 1000)),
    cost: avg(ok.map((r) => r.cost).filter((v) => v != null)),
    flags: avg(ok.map((r) => r.flags)),
    fab: (() => {
      const neg = ok.filter((r) => r.score.checks.some((c) => c.field === "noFabrication"));
      return neg.length ? `${neg.filter((r) => r.score.checks.find((c) => c.field === "noFabrication" && !c.pass)).length}/${neg.length}` : "n/a";
    })(),
    err: [...new Set(rs.filter((r) => !r.ok).map((r) => r.error))].join(", "),
  };
}).sort((a, b) => (b.acc ?? -1) - (a.acc ?? -1) || (a.cost ?? 9) - (b.cost ?? 9));

console.log("\nmodel".padEnd(34) + "ok".padEnd(6) + "accuracy".padEnd(10) + "perfect".padEnd(9) + "desc-sim".padEnd(10) + "secs".padEnd(7) + "US¢/receipt".padEnd(13) + "flags".padEnd(7) + "invented");
for (const r of rows) {
  console.log(
    r.model.padEnd(33) + " " + r.ok.padEnd(6) + fmt(r.acc, (v) => `${Math.round(v * 100)}%`).padEnd(10) +
      `${r.perfect}`.padEnd(9) + fmt(r.desc, (v) => `${Math.round(v * 100)}%`).padEnd(10) + fmt(r.secs, (v) => v.toFixed(1)).padEnd(7) +
      fmt(r.cost, (v) => (v * 100).toFixed(2)).padEnd(13) + fmt(r.flags, (v) => v.toFixed(1)).padEnd(7) + r.fab + (r.err ? `   errors: ${r.err}` : ""),
  );
}
console.log("\ninvented = runs on non-receipt images where the model still returned a merchant, amounts or items (lower is better).");
console.log("accuracy = share of field checks passed (merchant, totals, item count/amounts, no invented qty/price).");
console.log("desc-sim = how closely item names match the printed text. Cost uses Gateway list prices and reported token counts.");

const outDir = path.join(root, "results");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(out, JSON.stringify({ models, runs, rows, results }, null, 2));
console.log(`Details (includes extracted text, git-ignored): ${path.relative(process.cwd(), out)}`);
