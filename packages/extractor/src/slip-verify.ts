import type { BankSlip } from "./schema.js";
import type { SlipQr } from "./slip.js";

/**
 * Asking a verification service whether the bank has a transfer. A service looks
 * the transfer up with the bank from the text of the slip's QR code, so the slip
 * image itself is not sent anywhere.
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

export interface EasySlipOptions {
  apiKey: string;
  /** Default https://api.easyslip.com/v2 . Tests and local stand-ins point this elsewhere. */
  baseUrl?: string;
  /** Default `fetch`. */
  fetch?: typeof fetch;
  /** Give up after this long. Default 15 s. */
  timeoutMs?: number;
}

/** Pick the figures we keep out of the service's answer. Null if it does not look like a bank slip. */
function readBankSlip(data: unknown): BankSlip | null {
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
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    name: "easyslip",
    async verify({ payload, signal }) {
      let res: Response;
      try {
        res = await doFetch(`${base}/verify/bank`, {
          method: "POST",
          headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ payload }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return { status: "unavailable", reason: "error" };
      }

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // Not JSON: handled by the status below.
      }
      const code = isRecord(body) && isRecord(body.error) ? str(body.error.code) : isRecord(body) ? str(body.error) : null;

      if (res.status === 404) {
        if (code === "SLIP_PENDING") return { status: "pending" };
        if (code === "SLIP_NOT_FOUND") return { status: "not_found" };
        return { status: "unavailable", reason: "error" };
      }
      if (code === "QUOTA_EXCEEDED") return { status: "unavailable", reason: "quota" };
      if (res.status === 401 || res.status === 403) return { status: "unavailable", reason: "rejected" };
      if (res.status === 429) return { status: "unavailable", reason: "busy" };
      if (!res.ok || !isRecord(body) || body.success !== true) return { status: "unavailable", reason: "error" };

      const bank = readBankSlip(body.data);
      return bank ? { status: "verified", bank } : { status: "unavailable", reason: "error" };
    },
  };
}

/**
 * The verifier chosen by environment variables, or null when none is set up:
 * SLIP_VERIFY_PROVIDER=easyslip and SLIP_VERIFY_API_KEY. SLIP_VERIFY_BASE_URL
 * overrides the service address (for tests and local stand-ins).
 */
export function slipVerifierFromEnv(env: Record<string, string | undefined>): SlipVerifier | null {
  const provider = env.SLIP_VERIFY_PROVIDER?.trim().toLowerCase();
  const apiKey = env.SLIP_VERIFY_API_KEY?.trim();
  if (provider === "easyslip" && apiKey) {
    return createEasySlipVerifier({ apiKey, baseUrl: env.SLIP_VERIFY_BASE_URL?.trim() || undefined });
  }
  return null;
}
