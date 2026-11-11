import { describe, expect, it, vi } from "vitest";
import { normalizeExtraction, revalidate } from "../src/normalize.js";
import { ReceiptSchema, type BankSlip, type Receipt } from "../src/schema.js";
import { bangkokDay, bangkokTime, crc16CcittFalse, nameCore, namesAgree, parseSlipQr, qrReferenceFlags, verificationFlags } from "../src/slip.js";
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
    // (the time on the slip is left out: the bank's 00:30 would differ from the slip's 09:41)
    expect(verificationFlags(withBank(bank({ date: "2025-09-02T17:30:00Z" }), { time: null }))).toEqual([]);
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

describe("the reference on the slip against the one in its QR code", () => {
  const qr = { sendingBank: "014", transRef: "20260101AbCdEfGh7JkMnOpIq" };
  const read = (reference: string | null, over: Partial<Receipt> = {}) => slip({ reference, slipQr: qr, ...over });

  it("says nothing when they agree, or when there is no QR code", () => {
    expect(qrReferenceFlags(read("20260101AbCdEfGh7JkMnOpIq"))).toEqual([]);
    expect(qrReferenceFlags(slip({ reference: "anything" }))).toEqual([]);
  });

  it("ignores case, spaces and punctuation, as for the bank's reference", () => {
    expect(qrReferenceFlags(read("2026-0101 abcdefgh7jkmnopiq"))).toEqual([]);
  });

  it("warns, with both values, when a letter was misread (I read as l)", () => {
    const flags = qrReferenceFlags(read("20260101AbCdEfGh7JkMnOplq"));
    expect(flags).toEqual([
      expect.objectContaining({
        code: "slip_qr_reference_mismatch",
        severity: "warning",
        path: "reference",
        params: { printed: "20260101AbCdEfGh7JkMnOplq", qr: "20260101AbCdEfGh7JkMnOpIq" },
      }),
    ]);
  });

  it("warns when a part of the number was dropped, or the slip carries another slip's code", () => {
    expect(qrReferenceFlags(read("175270"))[0]?.code).toBe("slip_qr_reference_mismatch");
    expect(qrReferenceFlags(read("99999999999999999999"))[0]?.code).toBe("slip_qr_reference_mismatch");
  });

  it("says nothing when no reference was read, since there is nothing to compare", () => {
    expect(qrReferenceFlags(read(null))).toEqual([]);
  });

  it("leaves it to the bank's own comparison once the bank has answered, so nothing is said twice", () => {
    const verified = read("20260101AbCdEfGh7JkMnOplq", {
      verification: { status: "verified", provider: "test", checkedAt: "2025-10-14T00:00:00Z", bank: bank({ transRef: "20260101AbCdEfGh7JkMnOpIq", amount: 2500 }) },
    });
    expect(qrReferenceFlags(verified)).toEqual([]);
    expect(verificationFlags(verified).map((f) => f.code)).toEqual(["slip_reference_mismatch"]);
    // an answer that is not a confirmation does not take over
    const none = read("20260101AbCdEfGh7JkMnOplq", { verification: { status: "not_found", provider: "test", checkedAt: "2025-10-14T00:00:00Z" } });
    expect(qrReferenceFlags(none)).toHaveLength(1);
  });

  it("follows the person's edits: put right, it goes; spoilt again, it returns; the QR code is kept", () => {
    const wrong = revalidate(read("20260101AbCdEfGh7JkMnOplq"), { today });
    expect(wrong.flags.map((f) => f.code)).toContain("slip_qr_reference_mismatch");
    const fixed = revalidate({ ...wrong, reference: qr.transRef }, { today, previous: wrong });
    expect(fixed.flags.some((f) => f.code === "slip_qr_reference_mismatch")).toBe(false);
    const spoilt = revalidate({ ...fixed, reference: "0000" }, { today, previous: fixed });
    expect(spoilt.flags.some((f) => f.code === "slip_qr_reference_mismatch")).toBe(true);
    expect(spoilt.slipQr).toEqual(qr);
  });

  it("is kept on the receipt through the schema", () => {
    expect(ReceiptSchema.parse(JSON.parse(JSON.stringify(read("x"))))).toEqual(read("x"));
  });
});

describe("names and time against the bank's record", () => {
  const named = (over: Partial<BankSlip> = {}, receipt: Partial<Receipt> = {}) =>
    verificationFlags(
      withBank(bank({ senderName: "นาย ตัวอย่าง ทดสอบ", receiverName: "SAMPLE KITCHEN (ชื่อบัญชี: น", ...over }), {
        payer: "นาย ตัวอย่าง ทดสอบ",
        merchant: "SAMPLE KITCHEN",
        recipientName: null,
        time: "09:41",
        ...receipt,
      }),
    );
  const codes = (flags: ReturnType<typeof named>) => flags.map((f) => f.code);

  it("says nothing when everything agrees, however the name is cut or written", () => {
    expect(named()).toEqual([]);
    // the slip shows an initial, the bank the whole name, and the title is attached or not
    expect(named({ senderName: "นายตัวอย่าง ทดสอบสมมติ" }, { payer: "นาย ตัวอย่าง ท." })).toEqual([]);
    // a company's legal form is written differently
    expect(named({ receiverName: "บริษัท ตัวอย่าง ราเมน จำกัด" }, { merchant: "บจก.ตัวอย่าง ราเมน" })).toEqual([]);
    // a name that wraps onto a second line, and capital letters
    expect(named({ receiverName: "Sample Retail Co.,Ltd. Head Office" }, { merchant: "SAMPLE RETAIL CO.,LTD." })).toEqual([]);
  });

  it("warns when the payer differs, with both names, as a warning on the payer", () => {
    const flags = named({ senderName: "นาย คนอื่น ทดสอบ" });
    expect(flags).toEqual([
      expect.objectContaining({
        code: "slip_payer_mismatch",
        severity: "warning",
        path: "payer",
        params: { printed: "นาย ตัวอย่าง ทดสอบ", bank: "นาย คนอื่น ทดสอบ" },
      }),
    ]);
  });

  it("warns when a letter of a name was misread, since the bank's name is the right one", () => {
    expect(codes(named({ senderName: "นาย ตัวอย่าง ทดสอบ" }, { payer: "นาย ตัวอย่าง ทตสอบ" }))).toEqual(["slip_payer_mismatch"]);
  });

  it("compares the receiver with the shop name or the account holder's name, whichever the bank holds", () => {
    // the bank holds the person's name; the slip also shows a shop name
    expect(named({ receiverName: "น.ส. ตัวอย่าง สมมติ" }, { merchant: "SAMPLE KITCHEN", recipientName: "น.ส. ตัวอย่าง สมมติ" })).toEqual([]);
    // the bank holds the shop name followed by a cut-off account holder's name
    expect(named({ receiverName: "SAMPLE KITCHEN (ชื่อบัญชี: น" }, { merchant: "SAMPLE KITCHEN", recipientName: "น.ส. ตัวอย่าง สมมติ" })).toEqual([]);
    // neither agrees: one warning, naming what the slip shows
    const flags = named({ receiverName: "ร้านอื่น" }, { merchant: "SAMPLE KITCHEN", recipientName: "น.ส. ตัวอย่าง สมมติ" });
    expect(flags).toEqual([
      expect.objectContaining({
        code: "slip_receiver_mismatch",
        severity: "warning",
        path: "merchant",
        params: { printed: "SAMPLE KITCHEN / น.ส. ตัวอย่าง สมมติ", bank: "ร้านอื่น" },
      }),
    ]);
  });

  it("warns for a name written in another language than the bank's, which the person can dismiss", () => {
    expect(codes(named({ receiverName: "ร้านตัวอย่าง" }, { merchant: "SAMPLE SHOP" }))).toEqual(["slip_receiver_mismatch"]);
  });

  it("says nothing when the slip or the bank has no name to compare", () => {
    expect(named({}, { payer: null, merchant: null })).toEqual([]);
    expect(named({ senderName: null, receiverName: null })).toEqual([]);
    expect(named({ senderName: undefined, receiverName: undefined })).toEqual([]);
    expect(named({ senderName: "ก" }, { payer: "ข" })).toEqual([]); // too short to say
  });

  it("compares the time to the minute, allowing one minute, and in Thai time whatever the offset", () => {
    expect(named({ date: "2025-09-03T09:41:52+07:00" })).toEqual([]);
    expect(named({ date: "2025-09-03T09:42:10+07:00" })).toEqual([]); // one minute apart
    expect(named({ date: "2025-09-03T02:41:00Z" })).toEqual([]); // 09:41 in Thailand
    const flags = named({ date: "2025-09-03T09:44:00+07:00" });
    expect(flags).toEqual([
      expect.objectContaining({ code: "slip_time_mismatch", severity: "warning", path: "time", params: { printed: "09:41", bank: "09:44" } }),
    ]);
    // across midnight a minute apart is still a minute apart: only the date differs, and that is the date check's to say
    expect(named({ date: "2025-09-04T00:00:20+07:00" }, { time: "23:59", date: "2025-09-03" }).map((f) => f.code)).toEqual(["slip_date_mismatch"]);
  });

  it("says nothing until the bank has confirmed the transfer", () => {
    const base = { payer: "นาย คนอื่น", merchant: "ร้านอื่น", time: "01:00" };
    expect(verificationFlags(slip(base))).toEqual([]);
    expect(verificationFlags(slip({ ...base, verification: { status: "not_found", provider: "t", checkedAt: "2025-10-14T00:00:00Z" } })).map((f) => f.code)).toEqual(["slip_not_found"]);
  });

  it("follows the person's edits: put right, the warning goes; spoilt again, it returns", () => {
    const wrong = revalidate(
      withBank(bank({ senderName: "นาย ตัวอย่าง ทดสอบ", receiverName: "SAMPLE KITCHEN" }), { payer: "นาย คนอื่น ทดสอบ", merchant: "SAMPLE KITCHEN", time: "09:41" }),
      { today },
    );
    expect(wrong.flags.map((f) => f.code)).toContain("slip_payer_mismatch");
    const fixed = revalidate({ ...wrong, payer: "นาย ตัวอย่าง ทดสอบ" }, { today, previous: wrong });
    expect(fixed.flags.some((f) => f.code === "slip_payer_mismatch")).toBe(false);
    const spoilt = revalidate({ ...fixed, payer: "ใครสักคน" }, { today, previous: fixed });
    expect(spoilt.flags.some((f) => f.code === "slip_payer_mismatch")).toBe(true);
  });
});

describe("nameCore, namesAgree and bangkokTime", () => {
  it("reduces a name to what identifies it", () => {
    expect(nameCore("นาย ตัวอย่าง ทดสอบ")).toBe("ตัวอย่างทดสอบ");
    expect(nameCore("น.ส. ตัวอย่าง")).toBe("ตัวอย่าง");
    expect(nameCore("Mr. Sample Test")).toBe("sampletest");
    expect(nameCore("บริษัท ตัวอย่าง จำกัด (มหาชน)")).toBe("ตัวอย่าง");
    expect(nameCore("SAMPLE CO.,LTD.")).toBe("sample");
  });

  it("takes a title off only where a word starts: a surname ending in คุณ keeps it", () => {
    expect(nameCore("น.ส. สมมติ ตัวอย่างคุณ")).toBe("สมมติตัวอย่างคุณ");
    expect(nameCore("คุณตัวอย่าง")).toBe("ตัวอย่าง");
  });

  it("agrees when one name holds the other, disagrees otherwise, and is unsure for a very short name", () => {
    expect(namesAgree("ตัวอย่าง ท.", "นาย ตัวอย่าง ทดสอบ")).toBe(true);
    expect(namesAgree("นาย ตัวอย่าง ทดสอบ", "ตัวอย่าง ท")).toBe(true);
    expect(namesAgree("ตัวอย่าง ทดสอบ", "คนอื่น ทดสอบ")).toBe(false);
    expect(namesAgree("ก", "ตัวอย่าง")).toBeNull();
    expect(namesAgree("นาย", "ตัวอย่าง")).toBeNull();
  });

  it("gives the time of day in Thailand", () => {
    expect(bangkokTime("2025-09-03T09:41:52+07:00")).toBe("09:41");
    expect(bangkokTime("2025-09-03T17:30:00Z")).toBe("00:30");
    expect(bangkokTime("2025-09-03T00:00:00+07:00")).toBe("00:00");
    expect(bangkokTime("not a date")).toBeNull();
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

  it("keeps the figures and the two names (Thai first), but no account numbers", async () => {
    const check = await ask(reply(200, BODY_OK) as unknown as typeof fetch);
    expect(check).toEqual({
      status: "verified",
      bank: {
        transRef: "2025090309410001",
        date: "2025-09-03T09:41:00+07:00",
        amount: 2500,
        fee: 0,
        senderBank: "004",
        receiverBank: "014",
        senderName: "นายสมมติ ตัวอย่าง",
        receiverName: "ร้านตัวอย่าง",
      },
    });
    const text = JSON.stringify(check);
    expect(text).not.toContain("1234");
    expect(text).not.toContain("5678");
    expect(text).not.toContain("MR SAMPLE"); // the English name is only a fallback
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
