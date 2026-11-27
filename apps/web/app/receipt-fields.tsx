"use client";

import { useRef, type ReactNode } from "react";
import type { Receipt } from "@eve-thai-ocr/extractor/core";
import type { Dict } from "@/lib/i18n";

type Key = Exclude<keyof Receipt, "lineItems" | "flags" | "slipQr" | "verification">;

interface Props {
  receipt: Receipt;
  edit: (patch: Partial<Receipt>) => void;
  /** CSS class for a field by its flag level, and the flag messages under it. */
  cls: (path: string) => string;
  hint: (path: string) => ReactNode;
  t: Dict;
  /** Show every field, empty or not. */
  showAll: boolean;
}

const num = (v: string): number | null => (v === "" ? null : Number(v));

/** Does this field hold a value? An empty string, null and "not there" all count as no. */
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";

/**
 * The fields of the document (not its line items). A field with no value is not shown, so
 * a slip is not buried under receipt fields, nor a till receipt under invoice fields. A
 * field is shown when:
 *  - it has a value;
 *  - it had one earlier in this reading (so that clearing a box to retype it does not make
 *    the box vanish under the cursor);
 *  - a check has something to say about it (a missing total must stay in sight);
 *  - or the person asked for all fields.
 * The component is re-created for each new document (see `key` where it is used), which
 * forgets what was seen.
 */
export function ReceiptFields({ receipt, edit, cls, hint, t, showAll }: Props) {
  const seen = useRef(new Set<string>());
  const isSlip = receipt.documentType === "transfer_slip";

  const flagged = new Set(receipt.flags.map((f) => f.path));
  const show = (key: Key | "documentType") => {
    if (key === "documentType") return true;
    if (hasValue(receipt[key])) seen.current.add(key);
    return showAll || seen.current.has(key) || flagged.has(key);
  };

  const set = (key: Key, value: unknown) => edit({ [key]: value } as Partial<Receipt>);

  const text = (key: Key, label: string, extra: { placeholder?: string; digits?: boolean } = {}) =>
    show(key) && (
      <label key={key}>
        {label}
        <input
          className={cls(key)}
          placeholder={extra.placeholder}
          inputMode={extra.digits ? "numeric" : undefined}
          value={(receipt[key] as string | null | undefined) ?? ""}
          onChange={(e) => set(key, (extra.digits ? e.target.value.replace(/\D/g, "") : e.target.value) || null)}
        />
        {hint(key)}
      </label>
    );

  const money = (key: Key, label: string) =>
    show(key) && (
      <label key={key}>
        {label}
        <input
          type="number"
          step="0.01"
          className={cls(key)}
          value={(receipt[key] as number | null | undefined) ?? ""}
          onChange={(e) => set(key, num(e.target.value))}
        />
        {hint(key)}
      </label>
    );

  const choice = (key: Key, label: string, options: Record<string, string>) =>
    show(key) && (
      <label key={key}>
        {label}
        <select className={cls(key)} value={(receipt[key] as string | null | undefined) ?? ""} onChange={(e) => set(key, e.target.value || null)}>
          <option value="">{t.notStated}</option>
          {Object.entries(options).map(([value, name]) => (
            <option key={value} value={value}>{name}</option>
          ))}
        </select>
        {hint(key)}
      </label>
    );

  const signature = () =>
    show("hasSignature") && (
      <label key="hasSignature">
        {t.hasSignature}
        <select
          className={cls("hasSignature")}
          value={receipt.hasSignature == null ? "" : receipt.hasSignature ? "yes" : "no"}
          onChange={(e) => set("hasSignature", e.target.value === "" ? null : e.target.value === "yes")}
        >
          <option value="">{t.notStated}</option>
          <option value="yes">{t.signature.yes}</option>
          <option value="no">{t.signature.no}</option>
        </select>
        {hint("hasSignature")}
      </label>
    );

  return (
    <div className="grid">
      <label>
        {t.type}
        <select className={cls("documentType")} value={receipt.documentType} onChange={(e) => edit({ documentType: e.target.value as Receipt["documentType"] })}>
          {(Object.keys(t.docTypes) as (keyof typeof t.docTypes)[]).map((k) => (
            <option key={k} value={k}>{t.docTypes[k]}</option>
          ))}
        </select>
        {hint("documentType")}
      </label>
      {choice("documentSubtype", t.documentSubtype, t.subtypes)}
      {text("merchant", isSlip ? t.payee : t.merchant)}
      {text("merchantAddress", t.merchantAddress)}
      {text("branch", t.branch)}
      {text("taxId", t.taxId, { digits: true })}
      {text("recipientName", t.recipientName, { placeholder: t.recipientNameHint })}
      {text("payer", t.payer)}
      {text("buyerName", t.buyerName)}
      {text("buyerAddress", t.buyerAddress)}
      {text("buyerTaxId", t.buyerTaxId, { digits: true })}
      <label>
        {t.date}
        <input type="date" className={cls("date")} value={receipt.date ?? ""} onChange={(e) => edit({ date: e.target.value || null })} />
        {hint("date")}
      </label>
      {show("time") && (
        <label>
          {t.time}
          <input type="time" className={cls("time")} value={receipt.time ?? ""} onChange={(e) => edit({ time: e.target.value || null })} />
          {hint("time")}
        </label>
      )}
      <label>
        {t.currency}
        <input className={cls("currency")} value={receipt.currency} onChange={(e) => edit({ currency: e.target.value.toUpperCase() })} />
        {hint("currency")}
      </label>
      {text("bookNumber", t.bookNumber)}
      {text("reference", isSlip ? t.reference : t.receiptNumber)}
      {text("referenceDocument", t.referenceDocument)}
      {money("subtotal", t.subtotal)}
      {money("totalDiscount", t.totalDiscount)}
      {money("taxableAmount", t.taxableAmount)}
      {money("exemptAmount", t.exemptAmount)}
      {money("vat", t.vat)}
      {money("total", isSlip ? t.amountTransferred : t.total)}
      {text("totalInWords", t.totalInWords)}
      {money("fee", t.fee)}
      {choice("paymentMethod", t.paymentMethod, t.payments)}
      {signature()}
    </div>
  );
}
