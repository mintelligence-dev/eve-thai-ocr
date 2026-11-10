import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A real-looking slip QR text (the example from the Slip Verify guide). */
const PAYLOAD = "004000060000010103002021900021231231212000115102TH91049C30";

const BANK_ANSWER = {
  success: true,
  data: {
    isDuplicate: false,
    rawSlip: {
      transRef: "2025090309410001",
      date: "2025-09-03T09:41:00+07:00",
      amount: { amount: 2500 },
      fee: 0,
      sender: { bank: { id: "004" }, account: { name: { th: "นายสมมติ ตัวอย่าง" } } },
      receiver: { bank: { id: "014" }, account: { name: { th: "ร้านตัวอย่าง" } } },
    },
  },
};

let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/verify-slip", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const answer = (status: number, body: unknown) => vi.fn(async () => Response.json(body, { status }));

async function loadRoute() {
  vi.resetModules();
  return await import("../app/api/verify-slip/route");
}

const ENV = ["SLIP_VERIFY_PROVIDER", "SLIP_VERIFY_API_KEY", "SLIP_VERIFY_BRANCH_ID", "SLIP_VERIFY_BASE_URL", "SLIP_RATE_LIMIT_PER_HOUR"] as const;

beforeEach(() => {
  for (const k of ENV) vi.stubEnv(k, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const enable = () => {
  vi.stubEnv("SLIP_VERIFY_PROVIDER", "easyslip");
  vi.stubEnv("SLIP_VERIFY_API_KEY", "test-key");
};

describe("GET /api/verify-slip", () => {
  it("says whether a verification service is set up", async () => {
    const { GET } = await loadRoute();
    expect(await GET().json()).toEqual({ enabled: false });
    enable();
    expect(await GET().json()).toEqual({ enabled: true, provider: "easyslip" });
  });
});

describe("with SlipOK", () => {
  const SLIPOK_ANSWER = {
    success: true,
    data: { success: true, transRef: "010092101507665143", sendingBank: "004", receivingBank: "014", transDate: "20200401", transTime: "10:15:07", amount: 1, transFeeAmount: 0 },
  };
  const enableSlipOk = (branch = "BRANCH1") => {
    vi.stubEnv("SLIP_VERIFY_PROVIDER", "slipok");
    vi.stubEnv("SLIP_VERIFY_API_KEY", "test-key");
    vi.stubEnv("SLIP_VERIFY_BRANCH_ID", branch);
  };

  it("is on only with a branch id, and says which service it is", async () => {
    vi.stubEnv("SLIP_VERIFY_PROVIDER", "slipok");
    vi.stubEnv("SLIP_VERIFY_API_KEY", "test-key");
    const { GET } = await loadRoute();
    expect(await GET().json()).toEqual({ enabled: false });
    enableSlipOk();
    expect(await GET().json()).toEqual({ enabled: true, provider: "slipok" });
  });

  it("sends SlipOK only the QR text and returns the same kind of result", async () => {
    enableSlipOk();
    const fetchMock = answer(200, SLIPOK_ANSWER);
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(post({ payload: PAYLOAD }));
    expect(res.status).toBe(200);
    const { verification } = await res.json();
    expect(verification).toMatchObject({
      status: "verified",
      provider: "slipok",
      bank: { transRef: "010092101507665143", date: "2020-04-01T10:15:07+07:00", amount: 1, fee: 0, senderBank: "004", receiverBank: "014" },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.slipok.com/api/line/apikey/BRANCH1");
    expect(JSON.parse(init.body as string)).toEqual({ data: PAYLOAD });
  });

  it("passes on a delayed slip as pending, and a used-up package as unavailable", async () => {
    enableSlipOk();
    const { POST } = await loadRoute();
    vi.stubGlobal("fetch", answer(400, { code: 1010, message: "wait", data: { delay: 8 } }));
    expect((await (await POST(post({ payload: PAYLOAD }))).json()).verification.status).toBe("pending");

    vi.stubGlobal("fetch", answer(400, { code: 1004, message: "over quota" }));
    const res = await POST(post({ payload: PAYLOAD }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "slip_unavailable", reason: "quota" });
  });
});

describe("POST /api/verify-slip", () => {
  it("refuses when no service is set up, and asks nobody", async () => {
    const fetchMock = answer(200, BANK_ANSWER);
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();
    const res = await POST(post({ payload: PAYLOAD }));
    expect(res.status).toBe(501);
    expect((await res.json()).code).toBe("slip_verify_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bad requests before they reach the service", async () => {
    enable();
    const fetchMock = answer(200, BANK_ANSWER);
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();

    for (const body of ["not json", "{}", JSON.stringify({ payload: 123 }), "null"]) {
      const res = await POST(post(body));
      expect([res.status, (await res.json()).code]).toEqual([400, "bad_request"]);
    }
    // text that is not a bank slip QR code, a payload with one character changed, a web link
    for (const payload of ["hello", PAYLOAD.replace("0002123123121200011", "0002123123121200012"), "https://example.com/pay/1234567890"]) {
      const res = await POST(post({ payload }));
      expect([res.status, (await res.json()).code]).toEqual([400, "invalid_qr"]);
    }
    const big = await POST(post({ payload: "x".repeat(5000) }));
    expect(big.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the bank's figures, and sends the service only the QR text", async () => {
    enable();
    const fetchMock = answer(200, BANK_ANSWER);
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await loadRoute();

    const res = await POST(post({ payload: ` ${PAYLOAD} ` }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { verification } = await res.json();
    expect(verification).toMatchObject({
      status: "verified",
      provider: "easyslip",
      bank: { transRef: "2025090309410001", date: "2025-09-03T09:41:00+07:00", amount: 2500, fee: 0, senderBank: "004", receiverBank: "014" },
    });
    expect(new Date(verification.checkedAt).getTime()).not.toBeNaN();
    // no names or account numbers are passed on to the page
    expect(JSON.stringify(verification)).not.toContain("สมมติ");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ payload: PAYLOAD });
  });

  it("passes on 'not found' and 'pending' as results, not as failures", async () => {
    enable();
    const { POST } = await loadRoute();
    vi.stubGlobal("fetch", answer(404, { success: false, error: { code: "SLIP_NOT_FOUND", message: "x" } }));
    const none = await (await POST(post({ payload: PAYLOAD }))).json();
    expect(none.verification).toMatchObject({ status: "not_found", provider: "easyslip" });
    expect(none.verification.bank).toBeUndefined();

    vi.stubGlobal("fetch", answer(404, { success: false, error: { code: "SLIP_PENDING", message: "x" } }));
    expect((await (await POST(post({ payload: PAYLOAD }))).json()).verification.status).toBe("pending");
  });

  it("answers 503 with a reason when the service cannot answer, and never says verified", async () => {
    enable();
    const { POST } = await loadRoute();
    vi.stubGlobal("fetch", answer(403, { success: false, error: { code: "QUOTA_EXCEEDED", message: "x" } }));
    const res = await POST(post({ payload: PAYLOAD }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "slip_unavailable", reason: "quota" });
  });

  it("limits how often one visitor can ask", async () => {
    enable();
    vi.stubEnv("SLIP_RATE_LIMIT_PER_HOUR", "2");
    vi.stubGlobal("fetch", answer(200, BANK_ANSWER));
    const { POST } = await loadRoute();
    const headers = { "x-forwarded-for": "203.0.113.9" };
    expect((await POST(post({ payload: PAYLOAD }, headers))).status).toBe(200);
    expect((await POST(post({ payload: PAYLOAD }, headers))).status).toBe(200);
    const third = await POST(post({ payload: PAYLOAD }, headers));
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).not.toBeNull();
    // another visitor is not affected
    expect((await POST(post({ payload: PAYLOAD }, { "x-forwarded-for": "203.0.113.10" }))).status).toBe(200);
  });
});
