"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RawPartial } from "@eve-thai-ocr/extractor";
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
} from "@eve-thai-ocr/extractor/core";
import { ImageError, MAX_UPLOAD_BYTES, looksTooSmall, prepareImage } from "@/lib/image";
import { PdfError, isPdfFile, pdfToImages } from "@/lib/pdf";
import { SlipCheck } from "./slip-check";
import { ReceiptFields } from "./receipt-fields";
import { readNdjson } from "@/lib/ndjson";
import { LANGS, T, apiErrorText, detectLang, fieldLabel, flagText, tpl, type ApiError, type Dict, type Lang } from "@/lib/i18n";
import { ArrowLeftIcon, ArrowRightIcon, CameraIcon, CircleCheckIcon, DownloadIcon, UploadIcon, XIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  // Counts the documents shown, so that the field list forgets which fields it has shown.
  const [resultId, setResultId] = useState(0);
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
    if (sample) {
      setReceipt(normalizeExtraction(sample.raw));
      setResultId((n) => n + 1);
    }
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
          setResultId((n) => n + 1);
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


  /** A field's look for its flag level, plus the matching aria-invalid for an error. */
  const field = (path: string) => {
    const level = cls(path);
    return { className: level, "aria-invalid": level === "bad" || undefined };
  };

  return (
    <main className="page">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 text-title-1 text-foreground">{t.title}</h1>
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-1" role="group" aria-label={t.langLabel}>
              {LANGS.map((l) => (
                <Button key={l} size="sm" variant={l === lang ? "default" : "outline"} aria-pressed={l === lang} onClick={() => chooseLang(l)}>
                  {LANG_NAMES[l]}
                </Button>
              ))}
            </div>
            <div className="flex gap-1" role="group" aria-label={t.themeLabel}>
              {THEMES.map((k) => (
                <Button key={k} size="sm" variant={k === theme ? "default" : "outline"} aria-pressed={k === theme} onClick={() => chooseTheme(k)}>
                  {t.themes[k]}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <p className="lede">{t.tagline}</p>
        <p className="note">{t.notice}</p>
      </header>

      <section>
        <Card className="gap-0 py-0">
          <div className="card-body">
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
                      {photos.length > 1 && <Badge className="photo-no" aria-hidden="true">{i + 1}</Badge>}
                      <div className="thumb-actions">
                        {photos.length > 1 && (
                          <>
                            <Button variant="outline" size="icon" disabled={i === 0 || busy} aria-label={tpl(t.movePhoto, { n: i + 1, dir: t.moveLeft })} onClick={() => movePhoto(p.id, -1)}><ArrowLeftIcon /></Button>
                            <Button variant="outline" size="icon" disabled={i === photos.length - 1 || busy} aria-label={tpl(t.movePhoto, { n: i + 1, dir: t.moveRight })} onClick={() => movePhoto(p.id, 1)}><ArrowRightIcon /></Button>
                          </>
                        )}
                        <Button variant="outline" size="icon" disabled={busy} aria-label={tpl(t.removePhoto, { n: i + 1 })} onClick={() => removePhoto(p.id)}><XIcon /></Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="grid justify-items-center gap-1">
                  <UploadIcon aria-hidden="true" className="mb-1 size-6 text-brand" />
                  <span className="font-medium text-foreground">{t.drop}</span>
                  <small>{t.dropHint}</small>
                </span>
              )}
            </div>
            {photos.length > 1 && <p className="hint">{t.orderHint}</p>}
            {notice && <p className="notice warning">{tpl(t.lowRes, { w: notice.w, h: notice.h })}</p>}
            <div className="row">
              <Button onClick={extract} disabled={photos.length === 0 || busy || preparing}>{busy ? t.reading : t.extract}</Button>
              {photos.length > 0 && photos.length < MAX_PHOTOS && (
                <Button variant="outline" disabled={busy || preparing} onClick={() => inputRef.current?.click()}>{preparing ? t.preparing : t.addPhoto}</Button>
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
              <Button variant="outline" className="camera-btn" disabled={busy || preparing || photos.length >= MAX_PHOTOS} onClick={() => cameraRef.current?.click()}>
                <CameraIcon aria-hidden="true" />
                {t.camera}
              </Button>
            </div>
            {photos.length >= 1 && photos.length < MAX_PHOTOS && <p className="hint">{t.longHint}</p>}
            <div className="tips">
              <b className="text-foreground">{t.tipsTitle}</b>
              <ul>
                <li>{t.tip1}</li>
                <li>{t.tip2}</li>
                <li>{t.tip3}</li>
              </ul>
            </div>
            <div className="row">
              <span className="or">{t.samplesLead}</span>
              {SAMPLES.map((s) => (
                <Button
                  key={s.id}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearPhotos();
                    setError(null);
                    setNotice(null);
                    setReviewed(false);
                    setModel(null);
                    setReceipt(normalizeExtraction(s.raw));
                    setResultId((n) => n + 1);
                  }}
                >
                  {t.sample[s.id] ?? s.id}
                </Button>
              ))}
            </div>
            {error && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{apiErrorText(error, lang)}</AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
      </section>

      {busy && live && <LiveRead raw={live} t={t} />}

      {receipt && (
        <section aria-label={t.review}>
          <Card className="gap-0 py-0" data-shot="review">
            <div className="card-body">
              <h2 className="text-title-2">{t.review}</h2>
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
                <Alert variant="success" role="status" className="mt-2">
                  <CircleCheckIcon aria-hidden="true" />
                  <AlertDescription>{t.allClear}</AlertDescription>
                </Alert>
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
                // Line items do not apply to a transfer slip, unless it holds some or the person asks to see everything.
                const showReceiptParts = !isSlip || receipt.lineItems.length > 0 || showHidden;
                // The unit, code and discount columns appear only when some line has one (or everything is shown).
                const filled = (pick: (i: LineItem) => unknown) => showHidden || receipt.lineItems.some((i) => pick(i) != null && pick(i) !== "");
                const withCode = filled((i) => i.productCode);
                const withUom = filled((i) => i.unit);
                const withDiscount = filled((i) => i.discount);
                const cols = [withCode && "88px", "minmax(160px, 1fr)", "64px", withUom && "76px", "96px", withDiscount && "84px", "100px", "40px"].filter(Boolean).join(" ");
                const colStyle = { "--cols": cols } as React.CSSProperties;
                const many = withCode || withUom || withDiscount;
                return (
                  <>
                    <ReceiptFields key={resultId} receipt={receipt} edit={edit} cls={cls} hint={hint} t={t} showAll={showHidden} />
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowHidden((v) => !v)} aria-expanded={showHidden}>
                      {showHidden ? t.hideUnrelated : t.showHidden}
                    </Button>
                    {showReceiptParts && (
                      <>
                        <h3>{t.items}</h3>
                        {hint("lineItems")}
                        <div className={many ? "items many" : "items"} role="table" aria-label={t.items}>
                          <div className="item-head" role="row" style={colStyle}>
                            {withCode && <span role="columnheader">{t.colCode}</span>}
                            <span role="columnheader">{t.colName}</span>
                            <span role="columnheader">{t.colQty}</span>
                            {withUom && <span role="columnheader">{t.colUom}</span>}
                            <span role="columnheader">{t.colUnit}</span>
                            {withDiscount && <span role="columnheader">{t.colDiscount}</span>}
                            <span role="columnheader">{t.colAmount}</span>
                            <span />
                          </div>
                          {receipt.lineItems.map((it, i) => {
                            const rowFlags = receipt.flags.filter((f) => f.path.startsWith(`lineItems.${i}.`));
                            const level = rowFlags.some((f) => f.severity === "error") ? "bad" : rowFlags.length ? "warn" : "";
                            const at = (key: string) => field(`lineItems.${i}.${key}`);
                            return (
                              <div key={i} className={`item ${level}`} role="row">
                                <div className="item-fields" style={colStyle}>
                                  {withCode && (
                                    <div className="c-code" role="cell" data-label={t.colCode}><Input {...at("productCode")} value={it.productCode ?? ""} aria-label={`${t.colCode} ${i + 1}`} onChange={(e) => editItem(i, { productCode: e.target.value || null })} /></div>
                                  )}
                                  <div className="c-name" role="cell" data-label={t.colName}>
                                    {/* A textarea wraps long names instead of cutting them off. */}
                                    <Textarea rows={1} {...at("description")} className={`min-h-9 ${at("description").className}`} value={it.description} aria-label={`${t.colName} ${i + 1}`} onChange={(e) => editItem(i, { description: e.target.value.replace(/\n/g, " ") })} />
                                  </div>
                                  <div className="c-qty" role="cell" data-label={t.colQty}><Input type="number" step="any" {...at("quantity")} className={`${at("quantity").className} ${it.assumed ? "assumed" : ""}`} title={it.assumed ? t.assumedHint : undefined} value={it.quantity ?? ""} aria-label={`${t.colQty} ${i + 1}`} onChange={(e) => editItem(i, { quantity: num(e.target.value), assumed: false })} /></div>
                                  {withUom && (
                                    <div className="c-uom" role="cell" data-label={t.colUom}><Input {...at("unit")} value={it.unit ?? ""} aria-label={`${t.colUom} ${i + 1}`} onChange={(e) => editItem(i, { unit: e.target.value || null })} /></div>
                                  )}
                                  <div className="c-unit" role="cell" data-label={t.colUnit}><Input type="number" step="0.01" {...at("unitPrice")} className={`${at("unitPrice").className} ${it.assumed ? "assumed" : ""}`} title={it.assumed ? t.assumedHint : undefined} value={it.unitPrice ?? ""} aria-label={`${t.colUnit} ${i + 1}`} onChange={(e) => editItem(i, { unitPrice: num(e.target.value), assumed: false })} /></div>
                                  {withDiscount && (
                                    <div className="c-discount" role="cell" data-label={t.colDiscount}><Input type="number" step="0.01" min="0" {...at("discount")} value={it.discount ?? ""} aria-label={`${t.colDiscount} ${i + 1}`} onChange={(e) => editItem(i, { discount: num(e.target.value) })} /></div>
                                  )}
                                  <div className="c-amount" role="cell" data-label={t.colAmount}><Input type="number" step="0.01" {...at("amount")} value={it.amount ?? ""} aria-label={`${t.colAmount} ${i + 1}`} onChange={(e) => editItem(i, it.assumed ? { amount: num(e.target.value), unitPrice: num(e.target.value) } : { amount: num(e.target.value) })} /></div>
                                  <div className="c-del" role="cell"><Button variant="ghost" size="icon" aria-label={tpl(t.removeItem, { n: i + 1 })} onClick={() => edit({ lineItems: receipt.lineItems.filter((_, k) => k !== i) })}><XIcon /></Button></div>
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
                            <Badge variant={recon.against ? "success" : "warning"}>{recon.against ? t.sumTagOk : t.sumTagBad}</Badge>
                          </div>
                        )}
                        <Button variant="outline" className="mt-3" onClick={() => edit({ lineItems: [...receipt.lineItems, { description: "", quantity: null, unitPrice: null, amount: null }] })}>
                          {t.addItem}
                        </Button>
                      </>
                    )}
                  </>
                );
              })()}

              <div className="export">
                <div className="flex items-center gap-2.5">
                  <Checkbox id="reviewed" checked={reviewed} disabled={hasErrors} onCheckedChange={(v) => setReviewed(v === true)} />
                  <Label htmlFor="reviewed" className="text-sm leading-snug font-medium text-foreground">{t.confirm}</Label>
                </div>
                {hasErrors && <small className="error">{t.fixErrors}</small>}
              </div>
            </div>
          </Card>
        </section>
      )}

      {receipt && previews && (
        <section aria-label={t.previewTitle}>
          <Card className="gap-0 py-0">
            <div className="card-body">
              <h2 className="text-title-2">{t.previewTitle}</h2>
              <p className="model">{t.previewHint}</p>
              <div className="previews">
                <div className="preview">
                  <div className="preview-head">
                    <h3>JSON</h3>
                    <Button size="sm" disabled={!reviewed} onClick={() => download("receipt.json", "application/json", previews.json)}>
                      <DownloadIcon aria-hidden="true" />
                      {t.exportJson}
                    </Button>
                  </div>
                  <small className="muted">{t.jsonNote}</small>
                  <pre tabIndex={0} aria-label="JSON"><code>{previews.json}</code></pre>
                </div>
                <div className="preview">
                  <div className="preview-head">
                    <h3>CSV</h3>
                    <Button size="sm" disabled={!reviewed} onClick={() => download("receipt.csv", "text/csv;charset=utf-8", toCSV(receipt))}>
                      <DownloadIcon aria-hidden="true" />
                      {t.exportCsv}
                    </Button>
                  </div>
                  <small className="muted">{t.csvNote}</small>
                  <pre tabIndex={0} aria-label="CSV"><code>{previews.csv}</code></pre>
                </div>
              </div>
            </div>
          </Card>
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
    <section aria-busy="true" aria-label={t.liveTitle}>
      <Card className="live gap-0 py-0">
        <div className="card-body">
          <h2 className="text-title-2">{t.liveTitle}</h2>
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
        </div>
      </Card>
    </section>
  );
}
