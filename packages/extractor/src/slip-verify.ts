import type { BankSlip } from "./schema.js";
import type { SlipQr } from "./slip.js";

/**
 * Asking a verification service whether the bank has a transfer. A service looks
 * the transfer up with the bank from the text of the slip's QR code, so the slip
 * image itself is not sent anywhere.
 *
 * One function per service turns that service's answer into a `SlipCheck`. The rest
 * of the app only knows `SlipVerifier`, so adding a service means adding a function
 * here and a line in `slipVerifierFromEnv`.
 */

/** What a lookup found. `unavailable` means the question could not be answered: it says nothing about the slip. */
export type SlipCheck =
  | { status: "verified"; bank: BankSlip }
  | { status: "not_found" }
  | { status: "pending" }
  | { status: "unavailable"; reason: "rejected" | "quota" | "busy" | "error" };

export interface SlipVerifier {
  /** Short name of the service, recorded with the result. */
  name: string;
  /** `payload` is the QR text exactly as read; `qr` is what was parsed out of it. */
  verify(request: { payload: string; qr: SlipQr; signal?: AbortSignal }): Promise<SlipCheck>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** A number, or a string that is only a number ("2500.00"); services are not always consistent about which. */
const numeric = (v: unknown) => num(v) ?? (typeof v === "string" && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const bankCode = (v: unknown) => (typeof v === "string" && /^\d{3}$/.test(v) ? v : null);

/** What every service needs to be called. */
interface CallOptions {
  /** Default `fetch`. */
  fetch?: typeof fetch;
  /** Give up after this long. Default 15 s. */
  timeoutMs?: number;
}

/** POST JSON and read the JSON answer. Null when the call itself failed (network, timeout, cancelled). */
async function postJson(
  options: CallOptions,
  url: string,
  headers: Record<string, string>,
  body: object,
  signal: AbortSignal | undefined,
): Promise<{ status: number; ok: boolean; body: unknown } | null> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await (options.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch {
    return null;
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // Not JSON: the status alone decides.
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

const unavailable = (reason: "rejected" | "quota" | "busy" | "error"): SlipCheck => ({ status: "unavailable", reason });

// ---------------------------------------------------------------------------
// EasySlip
// ---------------------------------------------------------------------------

export interface EasySlipOptions extends CallOptions {
  apiKey: string;
  /** Default https://api.easyslip.com/v2 . Tests and local stand-ins point this elsewhere. */
  baseUrl?: string;
}

/** Pick the figures we keep out of EasySlip's answer. Null if it does not look like a bank slip. */
function readEasySlip(data: unknown): BankSlip | null {
  if (!isRecord(data) || !isRecord(data.rawSlip)) return null;
  const slip = data.rawSlip;
  const amountBox = isRecord(slip.amount) ? slip.amount : null;
  const amount = amountBox ? num(amountBox.amount) : null;
  const transRef = str(slip.transRef);
  if (amount === null || amount < 0 || transRef === null) return null;
  const bankId = (party: unknown) => {
    const bank = isRecord(party) && isRecord(party.bank) ? party.bank : null;
    return bank ? str(bank.id) : null;
  };
  return {
    transRef,
    date: str(slip.date),
    amount,
    fee: num(slip.fee),
    senderBank: bankId(slip.sender),
    receiverBank: bankId(slip.receiver),
  };
}

/**
 * EasySlip (https://easyslip.com), "verify by payload": the QR text goes in, the
 * bank's record of the transfer comes out. Written from its public documentation
 * (https://document.easyslip.com/en/v2/verify/bank/payload): the request, the
 * response fields and the codes SLIP_NOT_FOUND and SLIP_PENDING come from there;
 * the error shape and the other codes (INVALID_API_KEY, QUOTA_EXCEEDED...) from
 * https://document.easyslip.com/en/v2/ . Anything else (an answer in another
 * shape, an unknown code) is reported as `unavailable`, never as verified.
 */
export function createEasySlipVerifier(options: EasySlipOptions): SlipVerifier {
  const base = (options.baseUrl ?? "https://api.easyslip.com/v2").replace(/\/+$/, "");

  return {
    name: "easyslip",
    async verify({ payload, signal }) {
      const res = await postJson(options, `${base}/verify/bank`, { Authorization: `Bearer ${options.apiKey}` }, { payload }, signal);
      if (!res) return unavailable("error");
      const { status, body } = res;
      const code = isRecord(body) && isRecord(body.error) ? str(body.error.code) : isRecord(body) ? str(body.error) : null;

      if (status === 404) {
        if (code === "SLIP_PENDING") return { status: "pending" };
        if (code === "SLIP_NOT_FOUND") return { status: "not_found" };
        return unavailable("error");
      }
      if (code === "QUOTA_EXCEEDED") return unavailable("quota");
      if (status === 401 || status === 403) return unavailable("rejected");
      if (status === 429) return unavailable("busy");
      if (!res.ok || !isRecord(body) || body.success !== true) return unavailable("error");

      const bank = readEasySlip(body.data);
      return bank ? { status: "verified", bank } : unavailable("error");
    },
  };
}

// ---------------------------------------------------------------------------
// SlipOK
// ---------------------------------------------------------------------------

export interface SlipOkOptions extends CallOptions {
  apiKey: string;
  /** The branch the API key belongs to; it is part of the address. */
  branchId: string;
  /** Default https://api.slipok.com . Tests and local stand-ins point this elsewhere. */
  baseUrl?: string;
}

/** The slip's own date and time: SlipOK's ISO timestamp if given, else its date and time text (Thai time). */
function slipOkDate(data: Record<string, unknown>): string | null {
  const stamp = str(data.transTimestamp);
  if (stamp && !Number.isNaN(Date.parse(stamp))) return stamp;
  const day = typeof data.transDate === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(data.transDate) : null;
  if (!day) return null;
  const time = typeof data.transTime === "string" ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(data.transTime) : null;
  const clock = time ? `${time[1]}:${time[2]}:${time[3] ?? "00"}` : "00:00:00";
  const iso = `${day[1]}-${day[2]}-${day[3]}T${clock}+07:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** Pick the figures we keep out of SlipOK's answer (`data`). Null if it does not look like a bank slip. */
function readSlipOk(data: unknown): BankSlip | null {
  if (!isRecord(data) || data.success !== true) return null;
  const amount = numeric(data.amount);
  const transRef = str(data.transRef);
  if (amount === null || amount < 0 || transRef === null) return null;
  return {
    transRef,
    date: slipOkDate(data),
    amount,
    fee: numeric(data.transFeeAmount),
    senderBank: bankCode(data.sendingBank),
    receiverBank: bankCode(data.receivingBank),
  };
}

/**
 * What a SlipOK error code means for us. The codes come from its guide, version 1.13.
 * The guide contradicts itself on "the QR has expired or no such transaction": the table
 * gives 1011, one example gives 1007 (which the table says is "the image has no QR
 * code", something that cannot happen when only the QR text is sent). Both are read as
 * "not found", 1007 only when its message says so. Codes that only appear when the
 * request asks for more than we ask for (duplicate slip 1012, amount 1013, receiver
 * account 1014) are not expected and are treated as an unanswered question.
 */
function slipOkError(code: number | null, message: string): SlipCheck {
  switch (code) {
    case 1011:
      return { status: "not_found" };
    case 1007:
      return /หมดอายุ|ไม่มีรายการ/.test(message.replace(/\s+/g, "")) ? { status: "not_found" } : unavailable("error");
    case 1010: // a Bangkok Bank or SCB slip: the bank needs a few minutes
      return { status: "pending" };
    case 1009: // the bank's own system is down for now, no quota used
      return unavailable("busy");
    case 1001: // branch not found
    case 1002: // wrong or missing key
    case 1015: // package not found
      return unavailable("rejected");
    case 1003: // package expired
    case 1004: // over quota
      return unavailable("quota");
    default:
      return unavailable("error");
  }
}

/**
 * SlipOK (https://slipok.com): the QR text goes in, the bank's record comes out.
 * Written from its API guide (version 1.13, 28 February 2026): `POST
 * /api/line/apikey/<branch id>` with the key in the `x-authorization` header and the
 * QR text as `data`.
 *
 * The request deliberately leaves out `log`. Without it SlipOK stores nothing and does
 * no duplicate check; with `log: true` it keeps the slip's data for its own dashboard.
 * Each valid check uses one unit of quota, and so does asking about the same slip
 * again. Anything the guide does not cover is reported as `unavailable`, never as
 * verified.
 */
export function createSlipOkVerifier(options: SlipOkOptions): SlipVerifier {
  const base = (options.baseUrl ?? "https://api.slipok.com").replace(/\/+$/, "");
  const url = `${base}/api/line/apikey/${encodeURIComponent(options.branchId)}`;

  return {
    name: "slipok",
    async verify({ payload, signal }) {
      const res = await postJson(options, url, { "x-authorization": options.apiKey }, { data: payload }, signal);
      if (!res) return unavailable("error");
      const { body } = res;

      if (res.ok && isRecord(body) && body.success === true) {
        const bank = readSlipOk(body.data);
        return bank ? { status: "verified", bank } : unavailable("error");
      }
      if (res.status === 429) return unavailable("busy");
      const code = isRecord(body) && typeof body.code === "number" ? body.code : null;
      const message = isRecord(body) && typeof body.message === "string" ? body.message : "";
      if (code === null) return res.status === 401 || res.status === 403 ? unavailable("rejected") : unavailable("error");
      return slipOkError(code, message);
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * The verifier chosen by environment variables, or null when none is set up:
 *  - SLIP_VERIFY_PROVIDER=easyslip with SLIP_VERIFY_API_KEY
 *  - SLIP_VERIFY_PROVIDER=slipok with SLIP_VERIFY_API_KEY and SLIP_VERIFY_BRANCH_ID
 * SLIP_VERIFY_BASE_URL overrides the service address (for tests and local stand-ins).
 */
export function slipVerifierFromEnv(env: Record<string, string | undefined>): SlipVerifier | null {
  const provider = env.SLIP_VERIFY_PROVIDER?.trim().toLowerCase();
  const apiKey = env.SLIP_VERIFY_API_KEY?.trim();
  const branchId = env.SLIP_VERIFY_BRANCH_ID?.trim();
  const baseUrl = env.SLIP_VERIFY_BASE_URL?.trim() || undefined;
  if (!apiKey) return null;
  if (provider === "easyslip") return createEasySlipVerifier({ apiKey, baseUrl });
  if (provider === "slipok" && branchId) return createSlipOkVerifier({ apiKey, branchId, baseUrl });
  return null;
}
