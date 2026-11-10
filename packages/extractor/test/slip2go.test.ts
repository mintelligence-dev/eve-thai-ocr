import { describe, expect, it, vi } from "vitest";
import { createSlip2GoVerifier, slipVerifierFromEnv } from "../src/slip-verify.js";

/** The example answer on Slip2Go's QR-code guide (account names and numbers are its own placeholders). */
const QR = "004100060000010103004022001424208254 7BPM049885102TH91049C30".replace(" ", "");
const GUIDE_ANSWER = {
  code: "200000",
  message: "Slip found.",
  data: {
    referenceId: "92887bd5-60d3-4744-9a98-b8574eaxxxxx-xx",
    decode: "0041000600000101030040220014242082547BPM049885102TH9104xxxx",
    transRef: "015073144041ATF00999",
    dateTime: "2025-10-05T14:48:00.000Z",
    amount: 1,
    ref1: null,
    ref2: null,
    ref3: null,
    receiver: {
      account: { name: "บริษัท สลิปทูโก จำกัด", bank: { account: "xxx-x-x5366-x" }, proxy: { type: "NATID", account: "xxx-x-x5366-x" } },
      bank: { id: "004", name: "ธนาคารกสิกรไทย" },
    },
    sender: {
      account: { name: "บริษัท สลิปทูโก จำกัด", bank: { account: "xxx-x-x9866-x" } },
      bank: { id: "014", name: "ธนาคารไทยพาณิชย์" },
    },
  },
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const asFetch = (f: ReturnType<typeof reply>) => f as unknown as typeof fetch;
const slip2go = (fetchImpl: typeof fetch, over: Partial<Parameters<typeof createSlip2GoVerifier>[0]> = {}) =>
  createSlip2GoVerifier({ secretKey: "SECRET", fetch: fetchImpl, ...over });
const ask = (fetchImpl: typeof fetch) => slip2go(fetchImpl).verify({ payload: QR, qr: { sendingBank: "004", transRef: "x" } });
const answerWith = (data: object) => ({ ...GUIDE_ANSWER, data: { ...GUIDE_ANSWER.data, ...data } });

describe("Slip2Go request", () => {
  it("sends the QR text as payload.qrCode, with the secret as a bearer token, and no extra checks", async () => {
    const f = reply(200, GUIDE_ANSWER);
    await ask(asFetch(f));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connect.slip2go.com/api/verify-slip/qr-code/info");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer SECRET");
    expect(headers["Content-Type"]).toBe("application/json");
    // no checkCondition: duplicate, amount, date and receiver are not asked of Slip2Go
    expect(JSON.parse(init.body as string)).toEqual({ payload: { qrCode: QR } });
  });

  it("can point at another server", async () => {
    const f = reply(200, GUIDE_ANSWER);
    await slip2go(asFetch(f), { baseUrl: "http://localhost:9999/" }).verify({ payload: QR, qr: { sendingBank: "004", transRef: "x" } });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:9999/api/verify-slip/qr-code/info");
  });
});

describe("Slip2Go answer", () => {
  it("keeps only the figures it needs from the guide's example: no names, accounts or ids", async () => {
    const check = await ask(asFetch(reply(200, GUIDE_ANSWER)));
    expect(check).toEqual({
      status: "verified",
      bank: { transRef: "015073144041ATF00999", date: "2025-10-05T14:48:00.000Z", amount: 1, fee: null, senderBank: "014", receiverBank: "004" },
    });
    const text = JSON.stringify(check);
    for (const secret of ["สลิปทูโก", "5366", "9866", "92887bd5", "ธนาคาร"]) expect(text).not.toContain(secret);
  });

  it("also reads 'Slip is valid' (200200)", async () => {
    const check = await ask(asFetch(reply(200, { ...GUIDE_ANSWER, code: "200200", message: "Slip is valid." })));
    expect(check).toMatchObject({ status: "verified", bank: { amount: 1 } });
  });

  it("accepts a number written as text, and leaves a bad date or bank id empty", async () => {
    expect(await ask(asFetch(reply(200, answerWith({ amount: "2500.00" }))))).toMatchObject({ bank: { amount: 2500 } });
    const odd = await ask(asFetch(reply(200, answerWith({ dateTime: "yesterday", sender: { bank: { id: "SCB" } }, receiver: undefined }))));
    expect(odd).toMatchObject({ status: "verified", bank: { date: null, senderBank: null, receiverBank: null } });
  });

  it("does not trust an answer that is not shaped like a bank slip", async () => {
    const odd = [
      { code: "200000" },
      { code: "200000", data: {} },
      { code: "200200", message: "Slip is valid." }, // valid, but nothing to compare
      answerWith({ amount: undefined }),
      answerWith({ amount: "lots" }),
      answerWith({ amount: -1 }),
      answerWith({ transRef: "" }),
      answerWith({ transRef: undefined }),
    ];
    for (const body of odd) {
      expect(await ask(asFetch(reply(200, body)))).toEqual({ status: "unavailable", reason: "error" });
    }
  });

  it("does not call a slip verified on a non-200 status, whatever the body says", async () => {
    expect(await ask(asFetch(reply(500, GUIDE_ANSWER)))).toEqual({ status: "unavailable", reason: "error" });
  });
});

describe("Slip2Go result codes", () => {
  const withCode = (status: number, code: string | number) => reply(status, { code, message: "x" });

  it("reads 'slip not found' and 'slip is fraud' as not found", async () => {
    for (const code of ["200404", "200500"]) {
      expect(await ask(asFetch(withCode(200, code))), code).toEqual({ status: "not_found" });
    }
  });

  it("says unavailable, with a reason, when the question could not be answered", async () => {
    const cases: [number, string, string][] = [
      [200, "200502", "busy"], // an error from the bank
      [429, "429000", "busy"],
      [503, "500503", "busy"], // maintenance
      [401, "401001", "rejected"], // token mismatch
      [401, "401002", "rejected"], // shop not found
      [401, "401003", "rejected"], // account not found or suspended
      [401, "401007", "rejected"], // IP not allowed
      [401, "401004", "quota"], // package expired
      [401, "401005", "quota"], // out of tokens
      [401, "401006", "quota"], // out of credit
      [400, "400001", "error"], // no QR text
      [400, "400400", "error"],
      [400, "400409", "error"],
      [500, "500500", "error"],
      [200, "299999", "error"], // a code the guide does not list
      // codes that only come back when the request asks for conditions, which ours never does
      [200, "200401", "error"],
      [200, "200402", "error"],
      [200, "200403", "error"],
      [200, "200501", "error"],
    ];
    for (const [status, code, reason] of cases) {
      expect(await ask(asFetch(withCode(status, code))), code).toEqual({ status: "unavailable", reason });
    }
  });

  it("accepts the code as a number too", async () => {
    expect(await ask(asFetch(withCode(200, 200404)))).toEqual({ status: "not_found" });
  });

  it("says unavailable when the answer is not an answer", async () => {
    expect(await ask(asFetch(reply(429, "slow down")))).toEqual({ status: "unavailable", reason: "busy" });
    expect(await ask(asFetch(reply(401, "")))).toEqual({ status: "unavailable", reason: "rejected" });
    expect(await ask(asFetch(reply(500, "oops")))).toEqual({ status: "unavailable", reason: "error" });
    expect(await ask(asFetch(reply(200, "not json")))).toEqual({ status: "unavailable", reason: "error" });
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await ask(failing as unknown as typeof fetch)).toEqual({ status: "unavailable", reason: "error" });
  });
});

describe("slipVerifierFromEnv for Slip2Go", () => {
  it("needs only the key", () => {
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "slip2go", SLIP_VERIFY_API_KEY: "k" })?.name).toBe("slip2go");
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: " Slip2Go ", SLIP_VERIFY_API_KEY: "k" })?.name).toBe("slip2go");
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "slip2go" })).toBeNull();
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "slip2go", SLIP_VERIFY_API_KEY: " " })).toBeNull();
  });

  it("uses SLIP_VERIFY_BASE_URL", async () => {
    const f = reply(200, GUIDE_ANSWER);
    vi.stubGlobal("fetch", f);
    try {
      await slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "slip2go", SLIP_VERIFY_API_KEY: "k", SLIP_VERIFY_BASE_URL: "http://localhost:8768" })!.verify({
        payload: QR,
        qr: { sendingBank: "004", transRef: "x" },
      });
      expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:8768/api/verify-slip/qr-code/info");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
