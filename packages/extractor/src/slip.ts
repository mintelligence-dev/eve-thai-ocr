import type { BankSlip, Flag, Receipt } from "./schema.js";

/**
 * Checking a transfer slip against the bank's records.
 *
 * A picture of a slip cannot prove that the transfer happened: a forged slip
 * looks as real as a genuine one. What can be checked is the small "Slip
 * Verify" QR code that banks print on a slip. It holds the sending bank and the
 * transaction reference, so the transfer can be looked up with the bank, and the
 * amount and date the bank reports can be compared with what the slip shows.
 * A copied QR code on an edited slip is caught by that comparison.
 *
 * This file only reads the QR text and compares figures. Asking the bank (through
 * a verification service) is done by a `SlipVerifier`, see slip-verify.ts.
 */

/** CRC-16/CCITT-FALSE as 4 uppercase hex digits (the checksum used by Thai QR codes). */
export function crc16CcittFalse(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= (text.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

interface Tlv {
  tag: string;
  value: string;
  /** Where this item starts, and where its value starts, in the text read. */
  start: number;
  valueStart: number;
}

/** Read "tag (2 digits) + length (2 digits) + value" items. Null if the text is not laid out that way. */
function readTlv(text: string, allowShortLast = false): Tlv[] | null {
  const items: Tlv[] = [];
  let i = 0;
  while (i < text.length) {
    const tag = text.slice(i, i + 2);
    const len = text.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(len)) return null;
    const n = Number(len);
    const value = text.slice(i + 4, i + 4 + n);
    if (value.length < n) {
      // Some bank apps cut leading zeros off the checksum at the very end.
      if (!(allowShortLast && tag === "91" && i + 4 + value.length === text.length)) return null;
    }
    items.push({ tag, value, start: i, valueStart: i + 4 });
    i += 4 + n;
  }
  return items;
}

/** What the slip's QR code says: which bank sent the money, and the transaction reference. */
export interface SlipQr {
  /** 3-digit Bank of Thailand code of the sending bank. */
  sendingBank: string;
  transRef: string;
}

/**
 * Read the text of a bank's "Slip Verify" QR code. Returns null for anything
 * else: another kind of QR code (a payment QR, a web link), a different layout,
 * or text whose checksum does not match, which means it was misread or altered.
 *
 * Layout: an EMVCo-style list of (tag, length, value). Tag 00 holds the sub-items
 * 00 = "000001", 01 = sending bank, 02 = transaction reference, and the last item
 * is tag 91, the CRC-16 of everything before its value. The layout and the example
 * come from https://thai-qr-payment.js.org/guide/slip-verify/ ; the checksum rule
 * was confirmed against the example given there.
 */
export function parseSlipQr(payload: string): SlipQr | null {
  const text = payload.trim();
  if (text.length < 20 || text.length > 128) return null;
  const items = readTlv(text, true);
  if (!items || items.length < 2) return null;

  const crcItem = items[items.length - 1]!;
  if (crcItem.tag !== "91" || items.some((it, k) => it.tag === "91" && k !== items.length - 1)) return null;
  if (!/^[0-9A-Fa-f]{1,4}$/.test(crcItem.value)) return null;
  // The checksum covers the text up to and including the "91" tag and its length.
  const covered = text.slice(0, crcItem.valueStart);
  if (crc16CcittFalse(covered) !== crcItem.value.toUpperCase().padStart(4, "0")) return null;

  const root = items.find((it) => it.tag === "00");
  if (!root) return null;
  const inner = readTlv(root.value);
  if (!inner) return null;
  const get = (tag: string) => inner.find((it) => it.tag === tag)?.value;

  if (get("00") !== "000001") return null;
  const sendingBank = get("01");
  const transRef = get("02");
  if (!sendingBank || !/^\d{3}$/.test(sendingBank)) return null;
  if (!transRef || !/^[A-Za-z0-9]{1,64}$/.test(transRef)) return null;
  return { sendingBank, transRef };
}

const satang = (baht: number) => Math.round(baht * 100);
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The calendar day (YYYY-MM-DD) in Thailand of an ISO date-time, or null if it is not one. */
export function bangkokDay(iso: string): string | null {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(t);
}

/** The reference on the slip against the one in its QR code; null when there is no code or no reference to compare. */
export function compareQrReference(r: Pick<Receipt, "slipQr" | "reference">): { qr: string; agrees: boolean } | null {
  if (!r.slipQr || !r.reference) return null;
  return { qr: r.slipQr.transRef, agrees: alnum(r.reference) === alnum(r.slipQr.transRef) };
}

/**
 * The reference on the slip against the one in the slip's own QR code, which the bank
 * prints from the same record. A reference the model misread (an `I` for an `l`, a
 * dropped digit) disagrees with it, and so does a slip whose reference was changed
 * but whose QR code was not. Only a warning: the QR code holds no amount or date, so
 * agreement proves nothing about the slip, and a slip can show more than one number.
 * Nothing is said when there is no QR code or no reference, or when the bank has
 * answered (verificationFlags then compares with the bank's own reference).
 */
export function qrReferenceFlags(r: Pick<Receipt, "slipQr" | "reference" | "verification">): Flag[] {
  const same = compareQrReference(r);
  if (!same || same.agrees) return [];
  if (r.verification?.status === "verified" && r.verification.bank) return [];
  const printed = r.reference ?? "";
  return [
    {
      path: "reference",
      code: "slip_qr_reference_mismatch",
      severity: "warning",
      message: `The reference on the slip (${printed}) differs from the one in the slip's QR code (${same.qr}). Check it was read correctly.`,
      params: { printed, qr: same.qr },
    },
  ];
}

/**
 * Flags from the bank's answer, for `validateReceipt`. When the bank has the
 * transfer, the amount and the date on the slip must equal the bank's figures:
 * a different one is an error (a misread digit that the person can correct, or
 * a slip that was edited). The reference is compared too, as a warning, because
 * a slip can legitimately show more than one number. Names and accounts are not
 * compared: banks mask them differently on each slip.
 */
export function verificationFlags(r: Pick<Receipt, "verification" | "total" | "date" | "reference">): Flag[] {
  const v = r.verification;
  if (!v) return [];
  const flags: Flag[] = [];

  if (v.status === "not_found") {
    flags.push({
      path: "verification",
      code: "slip_not_found",
      severity: "warning",
      message:
        "The bank has no transfer with this reference. The slip may be forged or altered, or the transfer is too new or from a bank the service cannot check. This is not proof either way.",
    });
  } else if (v.status === "pending") {
    flags.push({
      path: "verification",
      code: "slip_pending",
      severity: "warning",
      message: "The bank cannot confirm this transfer yet (it is very recent). Try again in a few minutes.",
    });
  }

  const bank: BankSlip | undefined = v.status === "verified" ? v.bank : undefined;
  if (!bank) return flags;

  if (r.total !== null && satang(r.total) !== satang(bank.amount)) {
    flags.push({
      path: "total",
      code: "slip_amount_mismatch",
      severity: "error",
      message: `The slip shows ${r.total.toFixed(2)} but the bank's record of this transfer is ${bank.amount.toFixed(2)}.`,
      params: { printed: r.total.toFixed(2), bank: bank.amount.toFixed(2) },
    });
  }

  const bankDay = bank.date ? bangkokDay(bank.date) : null;
  if (r.date !== null && bankDay !== null && r.date !== bankDay) {
    flags.push({
      path: "date",
      code: "slip_date_mismatch",
      severity: "error",
      message: `The slip shows ${r.date} but the bank's record of this transfer is dated ${bankDay}.`,
      params: { printed: r.date, bank: bankDay },
    });
  }

  if (r.reference && alnum(r.reference) !== alnum(bank.transRef)) {
    flags.push({
      path: "reference",
      code: "slip_reference_mismatch",
      severity: "warning",
      message: `The reference on the slip (${r.reference}) differs from the bank's (${bank.transRef}). Check it was read correctly.`,
      params: { printed: r.reference, bank: bank.transRef },
    });
  }

  return flags;
}
