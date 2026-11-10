import { describe, expect, it, vi } from "vitest";
import { bangkokDay } from "../src/slip.js";
import { createSlipOkVerifier, slipVerifierFromEnv } from "../src/slip-verify.js";

/** The example answer in SlipOK's API guide (version 1.13): an invented transfer of 1 baht. */
const PAYLOAD = "004000060000010103002021900021231231212000115102TH91049C30";
const GUIDE_ANSWER = {
  success: true,
  data: {
    success: true,
    message: "✅",
    rqUID: "783_20191108_v4UIS1K2Mobile",
    language: "TH",
    transRef: "010092101507665143",
    sendingBank: "004",
    receivingBank: "004",
    transDate: "20200401",
    transTime: "10:15:07",
    sender: {
      displayName: "นาย ธนาคาร ก",
      name: "Mr. Thanakarn K",
      proxy: { type: null, value: null },
      account: { type: "BANKAC", value: "xxx-x-x0209-x" },
    },
    receiver: {
      displayName: "กสิกร ร",
      name: "KASIKORN R",
      proxy: { type: "", value: "" },
      account: { type: "BANKAC", value: "xxx-x-x3109-x" },
    },
    amount: 1,
    paidLocalAmount: 1,
    paidLocalCurrency: "764",
    countryCode: "TH",
    transFeeAmount: 0,
    ref1: "",
    ref2: "",
    ref3: "",
    toMerchantId: "",
  },
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
const slipOk = (fetchImpl: typeof fetch, over: Partial<Parameters<typeof createSlipOkVerifier>[0]> = {}) =>
  createSlipOkVerifier({ apiKey: "KEY", branchId: "BRANCH1", fetch: fetchImpl, ...over });
const ask = (fetchImpl: typeof fetch) =>
  slipOk(fetchImpl).verify({ payload: PAYLOAD, qr: { sendingBank: "002", transRef: "0002123123121200011" } });
const answerWith = (data: object) => ({ ...GUIDE_ANSWER, data: { ...GUIDE_ANSWER.data, ...data } });
const asFetch = (f: ReturnType<typeof reply>) => f as unknown as typeof fetch;

describe("SlipOK request", () => {
  it("sends the QR text as `data`, with the key in x-authorization, and nothing else", async () => {
    const f = reply(200, GUIDE_ANSWER);
    await ask(asFetch(f));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.slipok.com/api/line/apikey/BRANCH1");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-authorization"]).toBe("KEY");
    expect(headers["Content-Type"]).toBe("application/json");
    // `log: true` would make SlipOK keep the slip's data, and `amount` would be a check we do ourselves
    expect(JSON.parse(init.body as string)).toEqual({ data: PAYLOAD });
  });

  it("puts the branch in the address safely, and can point at another server", async () => {
    const f = reply(200, GUIDE_ANSWER);
    await slipOk(asFetch(f), { branchId: "a/b c", baseUrl: "http://localhost:9999/" }).verify({
      payload: PAYLOAD,
      qr: { sendingBank: "002", transRef: "x" },
    });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:9999/api/line/apikey/a%2Fb%20c");
  });
});

describe("SlipOK answer", () => {
  it("keeps only the figures it needs from the guide's example: no names, accounts or proxies", async () => {
    const check = await ask(asFetch(reply(200, GUIDE_ANSWER)));
    expect(check).toEqual({
      status: "verified",
      bank: {
        transRef: "010092101507665143",
        date: "2020-04-01T10:15:07+07:00",
        amount: 1,
        fee: 0,
        senderBank: "004",
        receiverBank: "004",
      },
    });
    const text = JSON.stringify(check);
    for (const secret of ["Thanakarn", "ธนาคาร ก", "0209", "3109", "KASIKORN"]) expect(text).not.toContain(secret);
  });

  it("reads the date as the slip's day in Thailand", async () => {
    const check = await ask(asFetch(reply(200, GUIDE_ANSWER)));
    if (check.status !== "verified") throw new Error("expected verified");
    expect(bangkokDay(check.bank.date!)).toBe("2020-04-01");
  });

  it("prefers the ISO timestamp when SlipOK gives one", async () => {
    const check = await ask(asFetch(reply(200, answerWith({ transTimestamp: "2020-04-01T03:15:07.000Z" }))));
    expect(check).toMatchObject({ status: "verified", bank: { date: "2020-04-01T03:15:07.000Z" } });
  });

  it("copes with a missing time, and leaves the date empty when it cannot be read", async () => {
    const noTime = await ask(asFetch(reply(200, answerWith({ transTime: undefined }))));
    expect(noTime).toMatchObject({ bank: { date: "2020-04-01T00:00:00+07:00" } });
    for (const transDate of ["20201345", "2020-04-01", "", undefined, 20200401]) {
      const check = await ask(asFetch(reply(200, answerWith({ transDate, transTimestamp: undefined }))));
      expect(check).toMatchObject({ status: "verified", bank: { date: null } });
    }
  });

  it("accepts numbers written as text, as the guide's field table says", async () => {
    const check = await ask(asFetch(reply(200, answerWith({ amount: "2500.00", transFeeAmount: "5" }))));
    expect(check).toMatchObject({ status: "verified", bank: { amount: 2500, fee: 5 } });
    const noFee = await ask(asFetch(reply(200, answerWith({ transFeeAmount: undefined }))));
    expect(noFee).toMatchObject({ bank: { fee: null } });
  });

  it("drops a bank code that is not three digits", async () => {
    const check = await ask(asFetch(reply(200, answerWith({ sendingBank: "KBANK", receivingBank: undefined }))));
    expect(check).toMatchObject({ bank: { senderBank: null, receiverBank: null } });
  });

  it("does not trust an answer that is not shaped like a bank slip", async () => {
    const odd = [
      { success: true },
      { success: true, data: {} },
      { success: false, data: GUIDE_ANSWER.data },
      answerWith({ success: false }),
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
});

describe("SlipOK error codes", () => {
  const err = (status: number, code: number, message = "x", extra: object = {}) => ({ status, body: { code, message, ...extra } });

  it("reads 'expired, or no such transaction' as not found, whichever code the guide's table or example uses", async () => {
    for (const { status, body } of [
      err(400, 1011, "QR Code หมดอายุ หรือ ไม่มีรายการอยู่จริง"),
      err(400, 1007, "QR Code หมดอายุ หรือ ไม่ มี รายการ อยู่จริง"),
      err(400, 1007, "QR Code ไม่มีรายการอยู่จริง"),
    ]) {
      expect(await ask(asFetch(reply(status, body)))).toEqual({ status: "not_found" });
    }
  });

  it("does not call 1007 'not found' when it says the image has no QR code", async () => {
    const { status, body } = err(400, 1007, "รูปภาพไม่มี Qr code");
    expect(await ask(asFetch(reply(status, body)))).toEqual({ status: "unavailable", reason: "error" });
  });

  it("reads a delayed Bangkok Bank / SCB slip as pending", async () => {
    const { status, body } = err(400, 1010, "กรุณารอการตรวจสอบสลิปหลังการโอนประมาณ 8 นาที", {
      data: { qrcodeData: PAYLOAD, bankCode: "002", bankName: "กรุงเทพ", delay: 8 },
    });
    expect(await ask(asFetch(reply(status, body)))).toEqual({ status: "pending" });
  });

  it("says unavailable, with a reason, when the question could not be answered", async () => {
    const cases: [number, number, string][] = [
      [400, 1009, "busy"], // the bank's system is down for now
      [401, 1002, "rejected"], // wrong or missing key
      [400, 1001, "rejected"], // branch not found
      [400, 1015, "rejected"], // package not found
      [400, 1003, "quota"], // package expired
      [400, 1004, "quota"], // over quota
      [400, 1000, "error"],
      [400, 1005, "error"],
      [400, 1006, "error"],
      [400, 1008, "error"],
      [400, 1999, "error"], // a code the guide does not list
      // codes that only come back when the request asks for more than ours does
      [400, 1012, "error"],
      [400, 1013, "error"],
      [400, 1014, "error"],
    ];
    for (const [status, code, reason] of cases) {
      expect(await ask(asFetch(reply(status, { code, message: "x" }))), `${code}`).toEqual({ status: "unavailable", reason });
    }
  });

  it("says unavailable when the answer is not an answer", async () => {
    expect(await ask(asFetch(reply(429, "slow down")))).toEqual({ status: "unavailable", reason: "busy" });
    expect(await ask(asFetch(reply(500, "oops")))).toEqual({ status: "unavailable", reason: "error" });
    expect(await ask(asFetch(reply(200, "not json")))).toEqual({ status: "unavailable", reason: "error" });
    expect(await ask(asFetch(reply(401, "")))).toEqual({ status: "unavailable", reason: "rejected" });
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await ask(failing as unknown as typeof fetch)).toEqual({ status: "unavailable", reason: "error" });
  });
});

describe("slipVerifierFromEnv for SlipOK", () => {
  const env = { SLIP_VERIFY_PROVIDER: "slipok", SLIP_VERIFY_API_KEY: "k", SLIP_VERIFY_BRANCH_ID: "b" };

  it("needs the key and the branch id", () => {
    expect(slipVerifierFromEnv(env)?.name).toBe("slipok");
    expect(slipVerifierFromEnv({ ...env, SLIP_VERIFY_BRANCH_ID: undefined })).toBeNull();
    expect(slipVerifierFromEnv({ ...env, SLIP_VERIFY_BRANCH_ID: "  " })).toBeNull();
    expect(slipVerifierFromEnv({ ...env, SLIP_VERIFY_API_KEY: "" })).toBeNull();
  });

  it("is chosen by name, and EasySlip does not need a branch id", () => {
    expect(slipVerifierFromEnv({ ...env, SLIP_VERIFY_PROVIDER: " SlipOK " })?.name).toBe("slipok");
    expect(slipVerifierFromEnv({ SLIP_VERIFY_PROVIDER: "easyslip", SLIP_VERIFY_API_KEY: "k" })?.name).toBe("easyslip");
  });

  it("uses SLIP_VERIFY_BASE_URL", async () => {
    const f = reply(200, GUIDE_ANSWER);
    vi.stubGlobal("fetch", f);
    try {
      await slipVerifierFromEnv({ ...env, SLIP_VERIFY_BASE_URL: "http://localhost:8766" })!.verify({
        payload: PAYLOAD,
        qr: { sendingBank: "002", transRef: "x" },
      });
      expect((f.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:8766/api/line/apikey/b");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
