"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RawPartial } from "@thai-receipt-reader/extractor";
import {
  SAMPLES,
  compareQrReference,
  itemsReconcile,
  normalizeExtraction,
  revalidate,
  toCSV,
  toJSON,
  type Flag,
  type LineItem,
  type Receipt,
} from "@thai-receipt-reader/extractor/core";
import { ImageError, MAX_UPLOAD_BYTES, looksTooSmall, prepareImage } from "@/lib/image";
import { PdfError, isPdfFile, pdfToImages } from "@/lib/pdf";
import { SlipCheck } from "./slip-check";
import { readNdjson } from "@/lib/ndjson";
import { LANGS, T, apiErrorText, detectLang, fieldLabel, flagText, tpl, type ApiError, type Dict, type Lang } from "@/lib/i18n";

const MAX_PHOTOS = 4;
let nextPhotoId = 1;
interface Photo { id: number; file: File; url: string }

type StreamEvent =
  | { type: "partial"; raw: RawPartial }
  | { type: "final"; receipt: Receipt; model: string }
  | { type: "error"; code?: string; retryAfterSec?: number; detail?: string };

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
  // Photos of one document, in order from the top of the receipt to the bottom.
  const [photos, setPhotos] = useState<Photo[]>([]);
  const photosRef = useRef<Photo[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  // What the model has read so far while it is still reading (raw text, unchecked).
  const [live, setLive] = useState<RawPartial | null>(null);
  // Keep the cause, not the text, so a language switch re-renders the message.
  const [error, setError] = useState<ApiError | null>(null);
  const [reviewed, setReviewed] = useState(false);
  // Show the fields that do not apply to the current document type.
  const [showHidden, setShowHidden] = useState(false);
  // Model that read the current document; null for the built-in samples.
  const [model, setModel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<{ w: number; h: number } | null>(null);
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

  // Preview URLs are revoked when a photo is removed, and on unmount.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);
  const setAllPhotos = (next: Photo[]) => {
    photosRef.current = next;
    setPhotos(next);
  };
  const clearPhotos = () => {
    photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
    setAllPhotos([]);
  };
  function removePhoto(id: number) {
    const gone = photosRef.current.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setAllPhotos(photosRef.current.filter((p) => p.id !== id));
    setError(null);
    setNotice(null);
  }
  function movePhoto(id: number, dir: -1 | 1) {
    const list = [...photosRef.current];
    const i = list.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    setAllPhotos(list);
  }

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
  // The photo files, kept as the same array until a photo is added, moved or removed.
  const photoFiles = useMemo(() => photos.map((p) => p.file), [photos]);

  /** Add photos of the document, in the order given. Each is shrunk on the device first. */
  async function addFiles(files: File[]) {
    setError(null);
    setNotice(null);
    setReceipt(null);
    setReviewed(false);
    if (files.length === 0) return;
    setPreparing(true);
    try {
      for (const f of files) {
        if (photosRef.current.length >= MAX_PHOTOS) {
          setError({ code: "too_many_images" });
          break;
        }
        try {
          // A PDF becomes one image per page; a photo is one image. Either way each is
          // shrunk and re-encoded on the device before anything is uploaded.
          const pages = isPdfFile(f) ? await pdfToImages(f, MAX_PHOTOS - photosRef.current.length) : null;
          const prepared = pages ? null : await prepareImage(f);
          const ready = pages ?? [prepared!.file];
          let full = false;
          for (const file of ready) {
            const total = photosRef.current.reduce((sum, p) => sum + p.file.size, 0) + file.size;
            if (total > MAX_UPLOAD_BYTES) {
              setError({ code: "too_large" });
              full = true;
              break;
            }
            setAllPhotos([...photosRef.current, { id: nextPhotoId++, file, url: URL.createObjectURL(file) }]);
          }
          if (full) break;
          if (prepared && looksTooSmall(prepared.width, prepared.height)) setNotice({ w: prepared.width, h: prepared.height });
        } catch (e) {
          if (e instanceof PdfError) setError({ code: e.code, pages: e.pages, max: MAX_PHOTOS });
          else setError({ code: e instanceof ImageError ? e.code : "decode_failed" });
        }
      }
    } finally {
      setPreparing(false);
    }
  }

  async function extract() {
    if (photos.length === 0) return;
    setBusy(true);
    setError(null);
    setReviewed(false);
    setLive({});
    try {
      const body = new FormData();
      for (const p of photos) body.append("image", p.file); // in order, top to bottom
      const res = await fetch("/api/extract?stream=1", { method: "POST", body });
      if (!res.ok || !res.body) {
        // Refused before reading started (rate limit, bad file...): a plain JSON error.
        return setError(await res.json().catch(() => ({})));
      }
      let finished = false;
      for await (const event of readNdjson(res.body) as AsyncGenerator<StreamEvent>) {
        if (event.type === "partial") {
          setLive(event.raw);
        } else if (event.type === "final") {
          finished = true;
          setReceipt(event.receipt);
          setModel(event.model);
        } else {
          finished = true;
          setError(event);
        }
      }
      // The stream ended without a result (for example the server timed out).
      if (!finished) setError({ code: "extract_failed" });
    } catch {
      setError({});
    } finally {
      setBusy(false);
      setLive(null);
    }
  }

  function edit(patch: Partial<Receipt>) {
    // `previous` lets the flags about how the document was read survive edits to other fields.
    setReceipt((r) => (r ? revalidate({ ...r, ...patch }, { previous: r }) : r));
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
          role={photos.length === 0 ? "button" : undefined}
          tabIndex={photos.length === 0 ? 0 : undefined}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => photos.length === 0 && inputRef.current?.click()}
          onKeyDown={(e) => photos.length === 0 && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = ""; // so choosing the same file again still fires
              addFiles(list);
            }}
          />
          {preparing && photos.length === 0 ? (
            <span>{t.preparing}</span>
          ) : photos.length > 0 ? (
            <ul className={`thumbs ${photos.length > 1 ? "many" : ""}`}>
              {photos.map((p, i) => (
                <li key={p.id}>
                  <img src={p.url} alt={`${t.preview} ${i + 1}`} />
                  {photos.length > 1 && <span className="badge" aria-hidden="true">{i + 1}</span>}
                  <div className="thumb-actions">
                    {photos.length > 1 && (
                      <>
                        <button className="ghost small" disabled={i === 0 || busy} aria-label={tpl(t.movePhoto, { n: i + 1, dir: t.moveLeft })} onClick={() => movePhoto(p.id, -1)}>←</button>
                        <button className="ghost small" disabled={i === photos.length - 1 || busy} aria-label={tpl(t.movePhoto, { n: i + 1, dir: t.moveRight })} onClick={() => movePhoto(p.id, 1)}>→</button>
                      </>
                    )}
                    <button className="ghost small" disabled={busy} aria-label={tpl(t.removePhoto, { n: i + 1 })} onClick={() => removePhoto(p.id)}>✕</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <span>{t.drop}<br /><small>{t.dropHint}</small></span>
          )}
        </div>
        {photos.length > 1 && <p className="hint">{t.orderHint}</p>}
        {notice && <p className="notice warning">{tpl(t.lowRes, { w: notice.w, h: notice.h })}</p>}
        <div className="row">
          <button onClick={extract} disabled={photos.length === 0 || busy || preparing}>{busy ? t.reading : t.extract}</button>
          {photos.length > 0 && photos.length < MAX_PHOTOS && (
            <button className="ghost" disabled={busy || preparing} onClick={() => inputRef.current?.click()}>{preparing ? t.preparing : t.addPhoto}</button>
          )}
          {/* capture="environment" opens the rear camera on phones. Shown on touch devices only. */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              addFiles(f ? [f] : []);
            }}
          />
          <button className="ghost camera-btn" disabled={busy || preparing || photos.length >= MAX_PHOTOS} onClick={() => cameraRef.current?.click()}>{t.camera}</button>
        </div>
        {photos.length >= 1 && photos.length < MAX_PHOTOS && <p className="hint">{t.longHint}</p>}
        <div className="tips">
          <b>{t.tipsTitle}</b>
          <ul>
            <li>{t.tip1}</li>
            <li>{t.tip2}</li>
            <li>{t.tip3}</li>
          </ul>
        </div>
        <div className="row">
          <span className="or">{t.samplesLead}</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              className="ghost"
              onClick={() => {
                clearPhotos();
                setError(null);
                setNotice(null);
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

      {busy && live && <LiveRead raw={live} t={t} />}

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

          {receipt.documentType === "transfer_slip" && (
            <SlipCheck
              files={photoFiles}
              verification={receipt.verification}
              mismatch={receipt.flags.some((f) => f.code === "slip_amount_mismatch" || f.code === "slip_date_mismatch")}
              reference={receipt.reference}
              qrRef={compareQrReference(receipt)}
              lang={lang}
              t={t}
              onVerified={(v) => edit({ verification: v })}
              onQr={(qr) => edit({ slipQr: qr ?? undefined })}
              onUseQrReference={() => receipt.slipQr && edit({ reference: receipt.slipQr.transRef })}
            />
          )}

          {(() => {
            const isSlip = receipt.documentType === "transfer_slip";
            // A field that does not apply to this kind of document is hidden, unless it
            // holds a value (never hide data silently) or the user asks to see it.
            const hasReceiptData = receipt.subtotal !== null || receipt.vat !== null || receipt.taxId !== null || receipt.lineItems.length > 0;
            const hasSlipData = receipt.payer !== null || receipt.recipientName !== null || receipt.fee !== null;
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
                      {t.recipientName}
                      <input className={cls("recipientName")} placeholder={t.recipientNameHint} value={receipt.recipientName ?? ""} onChange={(e) => edit({ recipientName: e.target.value || null })} />
                      {hint("recipientName")}
                    </label>
                  )}
                  {showReceiptParts && (
                    <label>
                      {t.taxId}
                      <input className={cls("taxId")} inputMode="numeric" value={receipt.taxId ?? ""} onChange={(e) => edit({ taxId: e.target.value.replace(/\D/g, "") || null })} />
                      {hint("taxId")}
                    </label>
                  )}
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
                    <label>
                      {t.fee}
                      <input type="number" step="0.01" className={cls("fee")} value={receipt.fee ?? ""} onChange={(e) => edit({ fee: num(e.target.value) })} />
                      {hint("fee")}
                    </label>
                  )}
                  <label>
                    {isSlip ? t.reference : t.receiptNumber}
                    <input className={cls("reference")} value={receipt.reference ?? ""} onChange={(e) => edit({ reference: e.target.value || null })} />
                    {hint("reference")}
                  </label>
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

/** Read-only view of what the model has read so far: text as printed, nothing parsed or checked. */
function LiveRead({ raw, t }: { raw: RawPartial; t: Dict }) {
  // The model thinks for several seconds before it writes anything, so show that time is passing.
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const fields: [string, string | null | undefined][] = [
    [t.type, raw.documentType ? t.docTypes[raw.documentType] : null],
    [t.merchant, raw.merchant],
    [t.recipientName, raw.recipientName],
    [t.taxId, raw.taxIdText],
    [t.payer, raw.payer],
    [t.date, raw.dateText],
    [t.time, raw.timeText],
    [t.receiptNumber, raw.referenceText],
    [t.subtotal, raw.subtotalText],
    [t.vat, raw.vatText],
    [t.total, raw.totalText],
    [t.fee, raw.feeText],
  ];
  const shown = fields.filter(([, v]) => v);
  const items = (raw.lineItems ?? []).filter((i) => i?.description || i?.amountText);
  return (
    <section className="card live" aria-busy="true" aria-label={t.liveTitle}>
      <h2>{t.liveTitle}</h2>
      <p className="model">{t.liveNote}</p>
      <p className="muted live-time" role="status">{tpl(t.liveElapsed, { n: seconds })}</p>
      {shown.length === 0 && items.length === 0 ? (
        <p className="muted">{t.liveWaiting}</p>
      ) : (
        <>
          <dl className="live-fields">
            {shown.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {items.length > 0 && (
            <ul className="live-items">
              {items.map((item, i) => (
                <li key={i}>
                  <span>{item?.description}</span>
                  <span>{item?.amountText}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
