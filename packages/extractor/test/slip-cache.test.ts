import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BankSlip } from "../src/schema.js";
import { cachedVerifier } from "../src/slip-cache.js";
import { slipVerifierFromEnv, type SlipCheck, type SlipVerifier } from "../src/slip-verify.js";

const QR = "004000060000010103002021900021231231212000115102TH91049C30";
const request = { payload: QR, qr: { sendingBank: "002", transRef: "0002123123121200011" } };
const bank: BankSlip = {
  transRef: "2025090309410001",
  date: "2025-09-03T09:41:00+07:00",
  amount: 2500,
  fee: 0,
  senderBank: "004",
  receiverBank: "014",
  senderName: "นายสมมติ ตัวอย่าง",
  receiverName: "ร้านตัวอย่าง",
};

/** A verifier that gives these answers in turn and counts how often it was asked. */
function inner(name: string, ...answers: SlipCheck[]) {
  let calls = 0;
  const v: SlipVerifier = { name, verify: async () => answers[Math.min(calls++, answers.length - 1)]! };
  return { v, calls: () => calls };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "slip-cache-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("cachedVerifier", () => {
  it("asks the service the first time and gives the saved answer afterwards", async () => {
    const { v, calls } = inner("svc", { status: "verified", bank });
    const cached = cachedVerifier(v, dir);
    expect(await cached.verify(request)).toEqual({ status: "verified", bank });
    expect(await cached.verify(request)).toEqual({ status: "verified", bank });
    expect(await cachedVerifier(v, dir).verify(request)).toEqual({ status: "verified", bank }); // a new instance too
    expect(calls()).toBe(1);
  });

  it("keeps the service's name", () => {
    expect(cachedVerifier(inner("svc").v, dir).name).toBe("svc");
  });

  it("does not keep an answer that can change: not found, pending, could not answer", async () => {
    for (const answer of [{ status: "not_found" }, { status: "pending" }, { status: "unavailable", reason: "busy" }] as SlipCheck[]) {
      const { v, calls } = inner("svc", answer);
      const cached = cachedVerifier(v, dir);
      await cached.verify(request);
      await cached.verify(request);
      expect(calls(), answer.status).toBe(2);
    }
    expect(await readdir(dir).catch(() => [])).toEqual([]);
  });

  it("asks again when a kept answer has gone, so a later confirmation is picked up", async () => {
    const { v, calls } = inner("svc", { status: "not_found" }, { status: "verified", bank });
    const cached = cachedVerifier(v, dir);
    expect((await cached.verify(request)).status).toBe("not_found");
    expect((await cached.verify(request)).status).toBe("verified");
    expect((await cached.verify(request)).status).toBe("verified");
    expect(calls()).toBe(2);
  });

  it("keeps one answer per slip and per service", async () => {
    const a = inner("one", { status: "verified", bank });
    const b = inner("two", { status: "verified", bank: { ...bank, amount: 1 } });
    await cachedVerifier(a.v, dir).verify(request);
    await cachedVerifier(b.v, dir).verify(request);
    await cachedVerifier(a.v, dir).verify({ ...request, payload: QR.replace("0002123123121200011", "0002123123121200012") });
    expect(a.calls() + b.calls()).toBe(3);
    expect((await readdir(dir)).length).toBe(3);
  });

  it("stores the figures and names but neither the QR text nor anything like a key", async () => {
    await cachedVerifier(inner("svc", { status: "verified", bank }).v, dir).verify(request);
    const [file] = await readdir(dir);
    const text = await readFile(join(dir, file!), "utf-8");
    expect(text).toContain("2500");
    expect(text).toContain("นายสมมติ ตัวอย่าง");
    expect(text).not.toContain(QR);
    expect(text).not.toMatch(/bearer|authorization|api[-_ ]?key/i);
  });

  it("asks the service when a saved file is damaged or not an answer, and saves a good one over it", async () => {
    const { v, calls } = inner("svc", { status: "verified", bank });
    await cachedVerifier(v, dir).verify(request);
    const [file] = await readdir(dir);
    for (const bad of ["not json", "{}", JSON.stringify({ check: { status: "verified", bank: { amount: "lots" } } })]) {
      await writeFile(join(dir, file!), bad);
      const before = calls();
      expect((await cachedVerifier(v, dir).verify(request)).status).toBe("verified");
      expect(calls()).toBe(before + 1);
      expect(JSON.parse(await readFile(join(dir, file!), "utf-8")).check.status).toBe("verified");
    }
  });

  it("still answers when the folder cannot be written to", async () => {
    const blocked = join(dir, "a-file");
    await writeFile(blocked, "x");
    const { v } = inner("svc", { status: "verified", bank });
    expect(await cachedVerifier(v, join(blocked, "inside")).verify(request)).toEqual({ status: "verified", bank });
  });
});

describe("SLIP_VERIFY_CACHE_DIR", () => {
  it("is off unless set, and when set the service is asked once per slip", async () => {
    const answer = { code: "200000", data: { transRef: "015073144041ATF00999", dateTime: "2025-10-05T14:48:00.000Z", amount: 1, sender: { bank: { id: "014" }, account: { name: "นาย ก" } }, receiver: { bank: { id: "004" }, account: { name: "ร้านข" } } } };
    const fetchMock = vi.fn(async () => Response.json(answer));
    vi.stubGlobal("fetch", fetchMock);
    const base = { SLIP_VERIFY_PROVIDER: "slip2go", SLIP_VERIFY_API_KEY: "k" };

    const off = slipVerifierFromEnv(base)!;
    await off.verify(request);
    await off.verify(request);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockClear();
    const on = slipVerifierFromEnv({ ...base, SLIP_VERIFY_CACHE_DIR: dir })!;
    const first = await on.verify(request);
    const second = await on.verify(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(second).toMatchObject({ status: "verified", bank: { senderName: "นาย ก", receiverName: "ร้านข" } });
    expect(on.name).toBe("slip2go");
  });

  it("does not turn a missing setup into a verifier", () => {
    expect(slipVerifierFromEnv({ SLIP_VERIFY_CACHE_DIR: dir })).toBeNull();
  });
});
