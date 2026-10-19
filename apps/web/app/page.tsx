"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  SAMPLES,
  itemsReconcile,
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
const THEME_KEY = "trr-theme";
type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];
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
  const [theme, setTheme] = useState<Theme>("light");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  // Keep the cause, not the text, so a language switch re-renders the message.
  const [error, setError] = useState<{ code?: string; retryAfterSec?: number; detail?: string } | null>(null);
  const [reviewed, setReviewed] = useState(false);
  // Show the fields that do not apply to the current document type.
  const [showHidden, setShowHidden] = useState(false);
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

  // Deep link to a built-in sample, e.g. /?sample=needs-review (handy for demos).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sample");
    const sample = SAMPLES.find((s) => s.id === id);
    if (sample) setReceipt(normalizeExtraction(sample.raw));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark") setTheme("dark");
    } catch {}
  }, []);

  function chooseTheme(next: Theme) {
    setTheme(next);
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }

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
  const recon = useMemo(() => (receipt ? itemsReconcile(receipt) : null), [receipt]);
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
        <div className="controls">
          <div className="lang" role="group" aria-label={t.langLabel}>
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? "on" : "ghost"} aria-pressed={l === lang} onClick={() => chooseLang(l)}>
                {LANG_NAMES[l]}
              </button>
            ))}
          </div>
          <div className="theme" role="group" aria-label={t.themeLabel}>
            {THEMES.map((k) => (
              <button key={k} className={k === theme ? "on" : "ghost"} aria-pressed={k === theme} onClick={() => chooseTheme(k)}>
                {t.themes[k]}
              </button>
            ))}
          </div>
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

          {(() => {
            const isSlip = receipt.documentType === "transfer_slip";
            // A field that does not apply to this kind of document is hidden, unless it
            // holds a value (never hide data silently) or the user asks to see it.
            const hasReceiptData = receipt.subtotal !== null || receipt.vat !== null || receipt.lineItems.length > 0;
            const hasSlipData = receipt.payer !== null || receipt.reference !== null || receipt.fee !== null;
            const showReceiptParts = !isSlip || hasReceiptData || showHidden;
            const showSlipParts = isSlip || hasSlipData || showHidden;
            return (
              <>
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
                    {isSlip ? t.payee : t.merchant}
                    <input className={cls("merchant")} value={receipt.merchant ?? ""} onChange={(e) => edit({ merchant: e.target.value || null })} />
                    {hint("merchant")}
                  </label>
                  {showSlipParts && (
                    <label>
                      {t.payer}
                      <input className={cls("payer")} value={receipt.payer ?? ""} onChange={(e) => edit({ payer: e.target.value || null })} />
                      {hint("payer")}
                    </label>
                  )}
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
                  {showReceiptParts && (["subtotal", "vat"] as const).map((k) => (
                    <label key={k}>
                      {t[k]}
                      <input type="number" step="0.01" className={cls(k)} value={receipt[k] ?? ""} onChange={(e) => edit({ [k]: num(e.target.value) })} />
                      {hint(k)}
                    </label>
                  ))}
                  <label>
                    {isSlip ? t.amountTransferred : t.total}
                    <input type="number" step="0.01" className={cls("total")} value={receipt.total ?? ""} onChange={(e) => edit({ total: num(e.target.value) })} />
                    {hint("total")}
                  </label>
                  {showSlipParts && (
                    <>
                      <label>
                        {t.fee}
                        <input type="number" step="0.01" className={cls("fee")} value={receipt.fee ?? ""} onChange={(e) => edit({ fee: num(e.target.value) })} />
                        {hint("fee")}
                      </label>
                      <label>
                        {t.reference}
                        <input className={cls("reference")} value={receipt.reference ?? ""} onChange={(e) => edit({ reference: e.target.value || null })} />
                        {hint("reference")}
                      </label>
                    </>
                  )}
                </div>
                {isSlip && (
                  <button className="ghost small" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
                    {showHidden ? t.hideUnrelated : t.showHidden}
                  </button>
                )}
                {showReceiptParts && (
                  <>
          <h3>{t.items}</h3>
          {hint("lineItems")}
          <div className="items" role="table" aria-label={t.items}>
            <div className="item-head" role="row">
              <span role="columnheader">{t.colName}</span>
              <span role="columnheader">{t.colQty}</span>
              <span role="columnheader">{t.colUnit}</span>
              <span role="columnheader">{t.colAmount}</span>
              <span />
            </div>
            {receipt.lineItems.map((it, i) => {
              const rowFlags = receipt.flags.filter((f) => f.path.startsWith(`lineItems.${i}.`));
              const level = rowFlags.some((f) => f.severity === "error") ? "bad" : rowFlags.length ? "warn" : "";
              return (
                <div key={i} className={`item ${level}`} role="row">
                  <div className="item-fields">
                    <div className="c-name" role="cell" data-label={t.colName}>
                      {/* A textarea wraps long names instead of cutting them off. */}
                      <textarea rows={1} className={cls(`lineItems.${i}.description`)} value={it.description} aria-label={`${t.colName} ${i + 1}`} onChange={(e) => editItem(i, { description: e.target.value.replace(/\n/g, " ") })} />
                    </div>
                    <div className="c-qty" role="cell" data-label={t.colQty}><input type="number" step="any" className={`${cls(`lineItems.${i}.quantity`)} ${it.assumed ? "assumed" : ""}`} title={it.assumed ? t.assumedHint : undefined} value={it.quantity ?? ""} aria-label={`${t.colQty} ${i + 1}`} onChange={(e) => editItem(i, { quantity: num(e.target.value), assumed: false })} /></div>
                    <div className="c-unit" role="cell" data-label={t.colUnit}><input type="number" step="0.01" className={`${cls(`lineItems.${i}.unitPrice`)} ${it.assumed ? "assumed" : ""}`} title={it.assumed ? t.assumedHint : undefined} value={it.unitPrice ?? ""} aria-label={`${t.colUnit} ${i + 1}`} onChange={(e) => editItem(i, { unitPrice: num(e.target.value), assumed: false })} /></div>
                    <div className="c-amount" role="cell" data-label={t.colAmount}><input type="number" step="0.01" className={cls(`lineItems.${i}.amount`)} value={it.amount ?? ""} aria-label={`${t.colAmount} ${i + 1}`} onChange={(e) => editItem(i, it.assumed ? { amount: num(e.target.value), unitPrice: num(e.target.value) } : { amount: num(e.target.value) })} /></div>
                    <div className="c-del" role="cell"><button className="ghost" aria-label={tpl(t.removeItem, { n: i + 1 })} onClick={() => edit({ lineItems: receipt.lineItems.filter((_, k) => k !== i) })}>✕</button></div>
                  </div>
                  {rowFlags.length > 0 && (
                    <ul className="item-msgs">
                      {rowFlags.map((f, k) => (
                        <li key={k} className={f.severity}>{flagText(f, lang)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {receipt.lineItems.some((l) => l.assumed) && <p className="model">{t.assumedNote}</p>}
          {recon && (
            <div className={`sum ${recon.against ? "ok" : "warn"}`} role="status">
              <span>
                {recon.against
                  ? tpl(t.sumOk, { sum: recon.sum.toFixed(2), against: t.against[recon.against], target: recon.target.toFixed(2) })
                  : tpl(t.sumBad, { sum: recon.sum.toFixed(2), target: recon.target.toFixed(2), diff: Math.abs(recon.diff).toFixed(2) })}
              </span>
              <span className="sum-tag">{recon.against ? t.sumTagOk : t.sumTagBad}</span>
            </div>
          )}
          <button className="ghost" onClick={() => edit({ lineItems: [...receipt.lineItems, { description: "", quantity: null, unitPrice: null, amount: null }] })}>
            {t.addItem}
          </button>

                  </>
                )}
              </>
            );
          })()}

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
