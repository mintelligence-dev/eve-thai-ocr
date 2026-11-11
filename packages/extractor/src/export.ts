import type { Receipt } from "./schema.js";

export function toJSON(receipt: Receipt): string {
  return JSON.stringify(receipt, null, 2);
}

/**
 * Neutralise spreadsheet formula injection: a cell that starts with = + - @
 * (or tab/CR) would be executed by Excel. Values come from OCR of arbitrary
 * documents, so treat them as untrusted.
 */
function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");

type Cell = string | number | null;

/** A CSV column, and where its value sits in the JSON, so the two can be kept the same. */
interface Column<T> {
  name: string;
  path: string;
  value: (source: T) => Cell;
}

/** Columns that repeat on every row: the document's own fields, then what the bank and the QR code said. */
const DOCUMENT_COLUMNS: Column<Receipt>[] = [
  { name: "document_type", path: "documentType", value: (r) => r.documentType },
  { name: "merchant", path: "merchant", value: (r) => r.merchant },
  { name: "date", path: "date", value: (r) => r.date },
  { name: "time", path: "time", value: (r) => r.time },
  { name: "currency", path: "currency", value: (r) => r.currency },
  { name: "subtotal", path: "subtotal", value: (r) => r.subtotal },
  { name: "vat", path: "vat", value: (r) => r.vat },
  { name: "total", path: "total", value: (r) => r.total },
  { name: "payer", path: "payer", value: (r) => r.payer },
  { name: "reference", path: "reference", value: (r) => r.reference },
  { name: "fee", path: "fee", value: (r) => r.fee },
  { name: "tax_id", path: "taxId", value: (r) => r.taxId },
  { name: "recipient_name", path: "recipientName", value: (r) => r.recipientName },
  { name: "bank_check", path: "verification.status", value: (r) => r.verification?.status ?? null },
  { name: "bank_check_reason", path: "verification.reason", value: (r) => r.verification?.reason ?? null },
  { name: "bank_provider", path: "verification.provider", value: (r) => r.verification?.provider ?? null },
  { name: "bank_checked_at", path: "verification.checkedAt", value: (r) => r.verification?.checkedAt ?? null },
  { name: "bank_amount", path: "verification.bank.amount", value: (r) => r.verification?.bank?.amount ?? null },
  { name: "bank_fee", path: "verification.bank.fee", value: (r) => r.verification?.bank?.fee ?? null },
  { name: "bank_date", path: "verification.bank.date", value: (r) => r.verification?.bank?.date ?? null },
  { name: "bank_trans_ref", path: "verification.bank.transRef", value: (r) => r.verification?.bank?.transRef ?? null },
  { name: "bank_sender_bank", path: "verification.bank.senderBank", value: (r) => r.verification?.bank?.senderBank ?? null },
  { name: "bank_sender_name", path: "verification.bank.senderName", value: (r) => r.verification?.bank?.senderName ?? null },
  { name: "bank_receiver_bank", path: "verification.bank.receiverBank", value: (r) => r.verification?.bank?.receiverBank ?? null },
  { name: "bank_receiver_name", path: "verification.bank.receiverName", value: (r) => r.verification?.bank?.receiverName ?? null },
  { name: "slip_qr_bank", path: "slipQr.sendingBank", value: (r) => r.slipQr?.sendingBank ?? null },
  { name: "slip_qr_reference", path: "slipQr.transRef", value: (r) => r.slipQr?.transRef ?? null },
];

/** Columns that differ from row to row: one line item each. */
const ITEM_COLUMNS: Column<Receipt["lineItems"][number]>[] = [
  { name: "item_description", path: "lineItems[].description", value: (i) => i.description },
  { name: "item_quantity", path: "lineItems[].quantity", value: (i) => i.quantity },
  { name: "item_unit_price", path: "lineItems[].unitPrice", value: (i) => i.unitPrice },
  { name: "item_amount", path: "lineItems[].amount", value: (i) => i.amount },
];

/** Every value in the JSON has a CSV column except these: the warnings, and the marker on a filled-in quantity. */
export const JSON_ONLY_PATHS = ["flags", "lineItems[].assumed"] as const;

/** The CSV columns in order, each with the path of its value in the JSON. */
export const CSV_COLUMNS: readonly { name: string; path: string }[] = [
  ...DOCUMENT_COLUMNS.map(({ name, path }) => ({ name, path })),
  ...ITEM_COLUMNS.map(({ name, path }) => ({ name, path })),
];

/**
 * One row per line item, with document-level fields repeated. A receipt with
 * no line items still yields one row so the totals are not lost. Prefixed with
 * a UTF-8 BOM so Excel opens Thai text correctly. It holds every value the JSON
 * holds (see JSON_ONLY_PATHS for the two it does not).
 */
export function toCSV(receipt: Receipt): string {
  const header = CSV_COLUMNS.map((c) => c.name);
  const doc = DOCUMENT_COLUMNS.map((c) => c.value(receipt));
  const items = receipt.lineItems.length
    ? receipt.lineItems.map((item) => ITEM_COLUMNS.map((c) => c.value(item)))
    : [ITEM_COLUMNS.map(() => null)];
  const lines = [row(header), ...items.map((i) => row([...doc, ...i]))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
