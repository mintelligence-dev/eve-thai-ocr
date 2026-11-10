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

/**
 * One row per line item, with document-level fields repeated. A receipt with
 * no line items still yields one row so the totals are not lost. Prefixed with
 * a UTF-8 BOM so Excel opens Thai text correctly.
 */
export function toCSV(receipt: Receipt): string {
  const header = [
    "document_type", "merchant", "date", "time", "currency",
    "subtotal", "vat", "total", "payer", "reference", "fee", "tax_id", "bank_check",
    "item_description", "item_quantity", "item_unit_price", "item_amount",
  ];
  const doc = [
    receipt.documentType, receipt.merchant, receipt.date, receipt.time,
    receipt.currency, receipt.subtotal, receipt.vat, receipt.total,
    receipt.payer, receipt.reference, receipt.fee, receipt.taxId,
    receipt.verification?.status ?? null,
  ];
  const items = receipt.lineItems.length
    ? receipt.lineItems.map((i) => [i.description, i.quantity, i.unitPrice, i.amount])
    : [[null, null, null, null]];
  const lines = [row(header), ...items.map((i) => row([...doc, ...i]))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
