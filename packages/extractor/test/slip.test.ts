import { describe, expect, it, vi } from "vitest";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import type { BankSlip, Receipt } from "../src/schema.js";
import { bangkokDay, crc16CcittFalse, parseSlipQr, verificationFlags } from "../src/slip.js";
import { createEasySlipVerifier, slipVerifierFromEnv } from "../src/slip-verify.js";
import * as fx from "./fixtures/index.js";

const today = new Date("2025-10-14T00:00:00Z");

/** The example in the Slip Verify guide: bank 002, reference 0002123123121200011. */
const DOCUMENTED = "004000060000010103002021900021231231212000115102TH91049C30";

/** Build a payload the way a bank does: sub-items inside tag 00, country, then the checksum. */
function makeQr(bank: string, ref: string, { marker = "000001", dropCrcZeros = false } = {}) {
  const len = (s: string) => String(s.length).padStart(2, "0");
  const inner = `00${len(marker)}${marker}01${len(bank)}${bank}02${len(ref)}${ref}`;
  const body = `00${len(inner)}${inner}5102TH9104`;
  let crc = crc16CcittFalse(body);
  if (dropCrcZeros) crc = crc.replace(/^0+/, "");
  return body + crc;
}

describe("crc16CcittFalse", () => {
  it("matches the checksum of the documented example", () => {
    expect(crc16CcittFalse(DOCUMENTED.slice(0, -4))).toBe("9C30");
  });
  it("matches the standard check value", () => {
    expect(crc16CcittFalse("123456789")).toBe("29B1");
  });
});

describe("parseSlipQr", () => {
  it("reads the documented example", () => {
    expect(parseSlipQr(DOCUMENTED)).toEqual({ sendingBank: "002", transRef: "0002123123121200011" });
  });
  it("reads a payload made for another bank and a reference with letters", () => {
    expect(parseSlipQr(makeQr("004", "202511100912ABC12345"))).toEqual({
      sendingBank: "004",
      transRef: "202511100912ABC12345",
    });
  });
  it("ignores surrounding whitespace", () => {
    expect(parseSlipQr(`  ${DOCUMENTED}\n`)?.sendingBank).toBe("002");
  });
  it("accepts a checksum whose leading zeros a bank app cut off", () => {
    // pick a reference whose checksum starts with 0, then cut that 0 off
    const ref = Array.from({ length: 5000 }, (_, n) => `REF${n}`).find((r) => makeQr("002", r).slice(-4).startsWith("0"));
    expect(ref).toBeDefined();
    const cut = makeQr("002", ref!, { dropCrcZeros: true });
    expect(cut.length).toBeLessThan(makeQr("002", ref!).length);
    expect(parseSlipQr(cut)).toEqual({ sendingBank: "002", transRef: ref });
  });

  it("rejects a payload with one character changed", () => {
    expect(parseSlipQr(DOCUMENTED.replace("0002123123121200011", "0002123123121200012"))).toBeNull();
    expect(parseSlipQr(DOCUMENTED.replace("TH", "TX"))).toBeNull();
  });
  it("rejects text after the checksum, or a wrong checksum", () => {
    expect(parseSlipQr(DOCUMENTED + "00")).toBeNull();
    expect(parseSlipQr(DOCUMENTED.slice(0, -4) + "0000")).toBeNull();
  });
  it("rejects other kinds of QR code", () => {
    // a PromptPay payment QR, a web link, and the TrueMoney layout (different markers)
    expect(parseSlipQr("00020101021129370016A000000677010111011300668123456785802TH5303764540510.006304ABCD")).toBeNull();
    expect(parseSlipQr("https://example.com/slip/12345678901234567890")).toBeNull();
    expect(parseSlipQr("00480002010102010203P2P0313TXN00012345670408250120249104b425")).toBeNull();
    expect(parseSlipQr(makeQr("002", "ABC123", { marker: "000002" }))).toBeNull();
  });
  it("rejects a bank code that is not 3 digits, an empty reference and bad lengths", () => {
    expect(parseSlipQr(makeQr("02", "ABC123"))).toBeNull();
    expect(parseSlipQr(makeQr("002", "AB-123"))).toBeNull();
    expect(parseSlipQr("")).toBeNull();
    expect(parseSlipQr("0".repeat(200))).toBeNull();
  });
});

describe("bangkokDay", () => {
  it("gives the calendar day in Thailand, whatever offset the bank used", () => {
    expect(bangkokDay("2026-11-09T23:30:00+07:00")).toBe("2026-11-09");
    expect(bangkokDay("2026-11-09T17:30:00Z")).toBe("2026-11-10"); // 00:30 in Thailand
    expect(bangkokDay("not a date")).toBeNull();
  });
});

const bank = (over: Partial<BankSlip> = {}): BankSlip => ({
  transRef: "2025090309410001",
  date: "2025-09-03T09:41:00+07:00",
  amount: 2500,
  fee: 0,
  senderBank: "004",
  receiverBank: "014",
  ...over,
});

const slip = (over: Partial<Receipt> = {}): Receipt => ({
  ...normalizeExtraction(fx.transferSlip, { today }),
  total: 2500,
  date: "2025-09-03",
  reference: "2025090309410001",
  ...over,
});

const withBank = (b: BankSlip, over: Partial<Receipt> = {}): Receipt =>
  slip({ verification: { status: "verified", provider: "test", checkedAt: "2025-10-14T00:00:00Z", bank: b }, ...over });

describe("verificationFlags", () => {
  it("has nothing to say when nobody checked", () => {
    expect(verificationFlags(slip())).toEqual([]);
  });
  it("has nothing to say when the bank agrees", () => {
    expect(verificationFlags(withBank(bank()))).toEqual([]);
  });
  it("makes the amount an error when the bank has a different one", () => {
    const flags = verificationFlags(withBank(bank({ amount: 250 })));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "slip_amount_mismatch", severity: "error", path: "total", params: { printed: "2500.00", bank: "250.00" } });
  });
  it("compares to the satang", () => {
    expect(verificationFlags(withBank(bank({ amount: 2500.01 })))[0]?.code).toBe("slip_amount_mismatch");
    expect(verificationFlags(withBank(bank({ amount: 2500.0000001 })))).toEqual([]);
  });
  it("makes the date an error when the bank dates it another day", () => {
    const flags = verificationFlags(withBank(bank({ date: "2025-09-05T09:41:00+07:00" })));
    expect(flags[0]).toMatchObject({ code: "slip_date_mismatch", severity: "error", path: "date", params: { printed: "2025-09-03", bank: "2025-09-05" } });
  });
  it("compares the day in Thailand, not in UTC", () => {
    // 00:30 on the 3rd in Thailand is still the 2nd in UTC
    expect(verificationFlags(withBank(bank({ date: "2025-09-02T17:30:00Z" })))).toEqual([]);
  });
  it("makes the reference a warning, since a slip can show more than one number", () => {
    const flags = verificationFlags(withBank(bank({ transRef: "OTHER123" })));
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "slip_reference_mismatch", severity: "warning", path: "reference" });
  });
  it("ignores case and punctuation in the reference", () => {
    expect(verificationFlags(withBank(bank({ transRef: "2025-0903-0941-0001" })))).toEqual([]);
  });
  it("skips what the slip does not show", () => {
    expect(verificationFlags(withBank(bank({ amount: 1 }), { total: null, date: null, reference: null }))).toEqual([]);
  });
  it("warns, without calling anything an error, when the bank has no such transfer or cannot tell yet", () => {
    const base = { provider: "test", checkedAt: "2025-10-14T00:00:00Z" };
    const none = verificationFlags(slip({ verification: { status: "not_found", ...base } }));
    expect(none).toEqual([expect.objectContaining({ code: "slip_not_found", severity: "warning", path: "verification" })]);
    const pending = verificationFlags(slip({ verification: { status: "pending", ...base } }));
    expect(pending).toEqual([expect.objectContaining({ code: "slip_pending", severity: "warning" })]);
  });
});

describe("a bank check that could not be answered", () => {
  it("raises no flag, since it says nothing about the slip, and is kept through edits", () => {
    const asked = slip({ verification: { status: "unavailable", reason: "quota", provider: "test", checkedAt: "2025-10-14T00:00:00Z" } });
    expect(verificationFlags(asked)).toEqual([]);
    const edited = revalidate({ ...asked, total: 1 }, { today, previous: asked });
    expect(edited.flags.some((f) => f.code.startsWith("slip_"))).toBe(false);
    expect(edited.verification).toMatchObject({ status: "unavailable", reason: "quota" });
  });
});

describe("editing a slip after the bank was asked", () => {
  it("raises the amount error again when the amount is changed, and clears it when put right", () => {
    const checked = withBank(bank());
    expect(revalidate(checked, { today }).flags.some((f) => f.code.startsWith("slip_"))).toBe(false);
    const edited = revalidate({ ...checked, total: 25000 }, { today });
    expect(edited.flags.find((f) => f.code === "slip_amount_mismatch")?.severity).toBe("error");
    const fixed = revalidate({ ...edited, total: 2500 }, { today });
    expect(fixed.flags.some((f) => f.code === "slip_amount_mismatch")).toBe(false);
    // the bank's answer is kept through edits
    expect(fixed.verification?.status).toBe("verified");
  });
});

const BODY_OK = {
  success: true,
  data: {
    isDuplicate: false,
    rawSlip: {
      payload: DOCUMENTED,
      transRef: "2025090309410001",
      date: "2025-09-03T09:41:00+07:00",
      countryCode: "TH",
      amount: { amount: 2500, local: { amount: 2500, currency: "THB" } },
      fee: 0,
      sender: {
        bank: { id: "004", name: "Some Bank", short: "KBANK" },
        account: { name: { th: "นายสมมติ ตัวอย่าง", en: "MR SAMPLE" }, bank: { type: "BANKAC", account: "xxx-x-x1234-x" } },
      },
      receiver: {
        bank: { id: "014", name: "Other Bank", short: "SCB" },
        account: { name: { th: "ร้านตัวอย่าง" }, bank: { type: "BANKAC", account: "xxx-x-x5678-x" } },
      },
    },
  },
  message: "Bank slip verified successfully",
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const errorBody = (code: string) => ({ success: false, error: { code, message: "x" } });
const ask = (fetchImpl: typeof fetch) =>
  createEasySlipVerifier({ apiKey: "KEY", fetch: fetchImpl }).verify({
    payload: DOCUMENTED,
    qr: { sendingBank: "002", transRef: "0002123123121200011" },
  });

describe("EasySlip verifier", () => {
  it("sends only the QR text, with the key as a bearer token", async () => {
    const f = reply(200, BODY_OK);
    await ask(f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.easyslip.com/v2/verify/bank");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer KEY");
    expect(JSON.parse(init.body as string)).toEqual({ payload: DOCUMENTED });
  });

  it("keeps only the figures it needs: no names and no account numbers", async () => {
    const check = await ask(reply(200, BODY_OK) as unknown as typeof fetch);
    expect(check).toEqual({
      status: "verified",
      bank: { transRef: "2025090309410001", date: "2025-09-03T09:41:00+07:00", amount: 2500, fee: 0, senderBank: "004", receiverBank: "014" },
    });
    const text = JSON.stringify(check);
    expect(text).not.toContain("สมมติ");
    expect(text).not.toContain("1234");
  });

  it("reports a missing slip and a too-recent one", async () => {
    expect(await ask(reply(404, errorBody("SLIP_NOT_FOUND")) as unknown as typeof fetch)).toEqual({ status: "not_found" });
    expect(await ask(reply(404, errorBody("SLIP_PENDING")) as unknown as typeof fetch)).toEqual({ status: "pending" });
  });

  it("says unavailable, never verified, when the question could not be answered", async () => {
    const cases: [number, unknown, string][] = [
      [401, errorBody("INVALID_API_KEY"), "rejected"],
      [403, errorBody("BRANCH_INACTIVE"), "rejected"],
      [403, errorBody("QUOTA_EXCEEDED"), "quota"],
      [429, errorBody("RATE_LIMITED"), "busy"],
      [500, errorBody("API_SERVER_ERROR"), "error"],
      [404, "not json", "error"],
      [400, errorBody("VALIDATION_ERROR"), "error"],
    ];
    for (const [status, body, reason] of cases) {
      expect(await ask(reply(status, body) as unknown as typeof fetch)).toEqual({ status: "unavailable", reason });
    }
  });

  it("does not trust an answer that is not shaped like a bank slip", async () => {
    const odd = [
      { success: true, data: {} },
      { success: true },
      { success: false },
      { success: true, data: { rawSlip: { transRef: "X", amount: { amount: "2500" } } } },
      { success: true, data: { rawSlip: { transRef: "X", amount: { amount: -5 } } } },
      { success: true, data: { rawSlip: { amount: { amount: 5 } } } },
    ];
    for (const body of odd) {
      expect(await ask(reply(200, body) as unknown as typeof fetch)).toEqual({ status: "unavailable", reason: "error" });
    }
  });

  it("says unavailable when the network fails", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await ask(failing as unknown as typeof fetch)).toEqual({ status: "unavailable", reason: "error" });
  });

  it("can point at another address", async () => {
    const f = reply(200, BODY_OK);
    await createEasySlipVerifier({ apiKey: "K", baseUrl: "http://localhost:9999/v2/", fetch: f as unknown as typeof fetch }).verify({
      payload: DOCUMENTED,
      qr: { sendingBank: "002", transRef: "0002123123121200011" },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:9999/v2/verify/bank");
  });
});

describe("slipVerifierFromEnv", () => {
  it("is off unless a provider and a key are both set", () => {
    expect(slipVerifierFromEnv({})).toBeNull();
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "easyslip" })).toBeNull();
    expect(slipVerifierFromEnv({ SLIP_VERIFY_API_KEY: "k" })).toBeNull();
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "unknown", SLIP_VERIFY_API_KEY: "k" })).toBeNull();
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "easyslip", SLIP_VERIFY_API_KEY: "  " })).toBeNull();
  });
  it("builds the EasySlip verifier", () => {
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: " EasySlip ", SLIP_VERIFY_API_KEY: "k" })?.name).toBe("easyslip");
  });
});
