"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SAMPLES,
  normalizeExtraction,
  revalidate,
  toCSV,
  toJSON,
  type Flag,
  type LineItem,
  type Receipt,
} from "@thai-receipt-reader/extractor/core";
import { LANGS, T, apiErrorText, detectLang, fieldLabel, flagText, tpl, type Lang } from "@/lib/i18n";

const MAX_BYTES = 4 * 1024 * 1024;
const LANG_KEY = "trr-lang";
const LANG_NAMES: Record<Lang, string> = { th: "ไทย", en: "English" };

function download(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const num = (v: string): number | null => (v === "" ? null : Number(v));

export default function Home() {
  const [lang, setLang] = useState<Lang>("th");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the cause, not the text, so a language switch re-renders the message.
  const [error, setError] = useState<{ code?: string; retryAfterSec?: number; detail?: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  // Model that read the current document; null for the built-in samples.
  const [model, setModel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = T[lang];

  // Start from the saved choice, else the browser's language. Storage can be
  // unavailable (private mode), so every access is guarded.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch {}
    setLang(saved === "th" || saved === "en" ? saved : detectLang(navigator.languages ?? [navigator.language]));
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function chooseLang(l: Lang) {
    setLang(l);
    try { localStorage.setItem(LANG_KEY, l); } catch {}
  }

  // Preview only: the object URL is revoked when the file changes or on unmount.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const flagsByPath = useMemo(() => {
    const map = new Map<string, Flag[]>();
    for (const f of receipt?.flags ?? []) map.set(f.path, [...(map.get(f.path) ?? []), f]);
    return map;
  }, [receipt]);
  // Exactly what the export buttons will download. The CSV starts with a BOM
  // for Excel; it is invisible, so drop it from the on-screen preview.
  const previews = useMemo(
    () => (receipt ? { json: toJSON(receipt), csv: toCSV(receipt).replace(/^\uFEFF/, "") } : null),
    [receipt],
  );
  const hasErrors = receipt?.flags.some((f) => f.severity === "error") ?? false;

  function choose(f: File | undefined) {
    setError(null);
    setReceipt(null);
    setReviewed(false);
    if (!f) return setFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setError({ code: "bad_type" });
    if (f.size > MAX_BYTES) return setError({ code: "too_large" });
    setFile(f);
  }

  async function extract() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReviewed(false);
    try {
      const body = new FormData();
      body.set("image", file);
      const res = await fetch("/api/extract", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json);
      setReceipt(json.receipt);
      setModel(typeof json.model === "string" ? json.model : null);
    } catch {
      setError({});
    } finally {
      setBusy(false);
    }
  }

  function edit(patch: Partial<Receipt>) {
    setReceipt((r) => (r ? revalidate({ ...r, ...patch }) : r));
    setReviewed(false);
  }

  function editItem(i: number, patch: Partial<LineItem>) {
    if (!receipt) return;
    edit({ lineItems: receipt.lineItems.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  }

  const cls = (path: string) => {
    const fl = flagsByPath.get(path);
    return fl ? (fl.some((f) => f.severity === "error") ? "bad" : "warn") : "";
  };
  const hint = (path: string) =>
    flagsByPath.get(path)?.map((f, i) => (
      <small key={i} className={f.severity}>{flagText(f, lang)}</small>
    ));

  return (
    <main>
      <div className="top">
        <h1>{t.title}</h1>
        <div className="lang" role="group" aria-label={t.langLabel}>
          {LANGS.map((l) => (
            <button key={l} className={l === lang ? "on" : "ghost"} aria-pressed={l === lang} onClick={() => chooseLang(l)}>
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      </div>
      <p className="lede">{t.tagline}</p>
      <p className="note">{t.notice}</p>

      <section className="card">
        <div
          className="drop"
          role="button"
          tabIndex={0}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {preview ? (
            <img src={preview} alt={t.preview} />
          ) : (
            <span>{t.drop}<br /><small>{t.dropHint}</small></span>
          )}
        </div>
        <div className="row">
          <button onClick={extract} disabled={!file || busy}>{busy ? t.reading : t.extract}</button>
        </div>
        <div className="row">
          <span className="or">{t.samplesLead}</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              className="ghost"
              onClick={() => {
                setFile(null);
                setError(null);
                setReviewed(false);
                setModel(null);
                setReceipt(normalizeExtraction(s.raw));
              }}
            >
              {t.sample[s.id] ?? s.id}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="error">{apiErrorText(error, lang)}</p>}
      </section>

      {receipt && (
        <section className="card" aria-label={t.review}>
          <h2>{t.review}</h2>
          <p className="model">{model ? tpl(t.modelUsed, { model }) : t.sampleNoAi}</p>

          {receipt.flags.length > 0 ? (
            <>
              <h3>{t.flagsTitle}</h3>
              <ul className="flags">
                {receipt.flags.map((f, i) => (
                  <li key={i} className={f.severity}>
                    <b>{fieldLabel(f.path, lang)}</b> — {flagText(f, lang)}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="ok">{t.allClear}</p>
          )}

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
            <label>
              {t.merchant}
              <input className={cls("merchant")} value={receipt.merchant ?? ""} onChange={(e) => edit({ merchant: e.target.value || null })} />
              {hint("merchant")}
            </label>
            <label>
              {t.date}
              <input type="date" className={cls("date")} value={receipt.date ?? ""} onChange={(e) => edit({ date: e.target.value || null })} />
              {hint("date")}
            </label>
            <label>
              {t.time}
              <input type="time" className={cls("time")} value={receipt.time ?? ""} onChange={(e) => edit({ time: e.target.value || null })} />
              {hint("time")}
            </label>
            <label>
              {t.currency}
              <input className={cls("currency")} value={receipt.currency} onChange={(e) => edit({ currency: e.target.value.toUpperCase() })} />
              {hint("currency")}
            </label>
            {(["subtotal", "vat", "total"] as const).map((k) => (
              <label key={k}>
                {t[k]}
                <input type="number" step="0.01" className={cls(k)} value={receipt[k] ?? ""} onChange={(e) => edit({ [k]: num(e.target.value) })} />
                {hint(k)}
              </label>
            ))}
          </div>

          <h3>{t.items}</h3>
          {hint("lineItems")}
          <div className="scroll">
            <table className="items">
              <thead>
                <tr>
                  <th className="c-name">{t.colName}</th>
                  <th className="c-qty">{t.colQty}</th>
                  <th className="c-unit">{t.colUnit}</th>
                  <th className="c-amount">{t.colAmount}</th>
                  <th className="c-del" />
                </tr>
              </thead>
              <tbody>
                {receipt.lineItems.map((it, i) => (
                  <tr key={i}>
                    <td className="c-name" data-label={t.colName}>
                      {/* A textarea wraps long names instead of cutting them off. */}
                      <textarea rows={1} className={cls(`lineItems.${i}.description`)} value={it.description} aria-label={`${t.colName} ${i + 1}`} onChange={(e) => editItem(i, { description: e.target.value.replace(/\n/g, " ") })} />
                    </td>
                    <td className="c-qty" data-label={t.colQty}><input type="number" step="any" className={cls(`lineItems.${i}.quantity`)} value={it.quantity ?? ""} aria-label={`${t.colQty} ${i + 1}`} onChange={(e) => editItem(i, { quantity: num(e.target.value) })} /></td>
                    <td className="c-unit" data-label={t.colUnit}><input type="number" step="0.01" className={cls(`lineItems.${i}.unitPrice`)} value={it.unitPrice ?? ""} aria-label={`${t.colUnit} ${i + 1}`} onChange={(e) => editItem(i, { unitPrice: num(e.target.value) })} /></td>
                    <td className="c-amount" data-label={t.colAmount}>
                      <input type="number" step="0.01" className={cls(`lineItems.${i}.amount`)} value={it.amount ?? ""} aria-label={`${t.colAmount} ${i + 1}`} onChange={(e) => editItem(i, { amount: num(e.target.value) })} />
                      {hint(`lineItems.${i}.amount`)}
                    </td>
                    <td className="c-del"><button className="ghost" aria-label={tpl(t.removeItem, { n: i + 1 })} onClick={() => edit({ lineItems: receipt.lineItems.filter((_, k) => k !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="ghost" onClick={() => edit({ lineItems: [...receipt.lineItems, { description: "", quantity: null, unitPrice: null, amount: null }] })}>
            {t.addItem}
          </button>

          <div className="export">
            <label className="check">
              <input type="checkbox" checked={reviewed} disabled={hasErrors} onChange={(e) => setReviewed(e.target.checked)} />
              {t.confirm}
            </label>
            {hasErrors && <small className="error">{t.fixErrors}</small>}
          </div>
        </section>
      )}

      {receipt && previews && (
        <section className="card" aria-label={t.previewTitle}>
          <h2>{t.previewTitle}</h2>
          <p className="model">{t.previewHint}</p>
          <div className="previews">
            <div className="preview">
              <div className="preview-head">
                <h3>JSON</h3>
                <button disabled={!reviewed} onClick={() => download("receipt.json", "application/json", previews.json)}>{t.exportJson}</button>
              </div>
              <small className="muted">{t.jsonNote}</small>
              <pre tabIndex={0} aria-label="JSON"><code>{previews.json}</code></pre>
            </div>
            <div className="preview">
              <div className="preview-head">
                <h3>CSV</h3>
                <button disabled={!reviewed} onClick={() => download("receipt.csv", "text/csv;charset=utf-8", toCSV(receipt))}>{t.exportCsv}</button>
              </div>
              <small className="muted">{t.csvNote}</small>
              <pre tabIndex={0} aria-label="CSV"><code>{previews.csv}</code></pre>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
