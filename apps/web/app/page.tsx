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

const MAX_BYTES = 4 * 1024 * 1024;

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
  const hasErrors = receipt?.flags.some((f) => f.severity === "error") ?? false;

  function choose(f: File | undefined) {
    setError(null);
    setReceipt(null);
    setReviewed(false);
    if (!f) return setFile(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type))
      return setError("รองรับเฉพาะ JPEG, PNG, WebP / Only JPEG, PNG or WebP.");
    if (f.size > MAX_BYTES) return setError("ไฟล์ใหญ่เกิน 4 MB / File is larger than 4 MB.");
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setReceipt(json.receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
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
    flagsByPath.get(path)?.map((f) => (
      <small key={f.code + f.message} className={f.severity}>{f.message}</small>
    ));

  return (
    <main>
      <h1>Thai Receipt Reader</h1>
      <p className="lede">
        อัปโหลดใบเสร็จหรือสลิปโอนเงิน แล้วตรวจแก้ข้อมูลก่อนส่งออก ·
        Upload a receipt or transfer slip, review, then export.
      </p>
      <p className="note">
        ดึงข้อมูลเท่านั้น ไม่ได้ตรวจสอบว่าสลิปหรือการชำระเงินเป็นของจริง · Extraction only — this tool
        does not verify that a payment is genuine. รูปไม่ถูกเก็บไว้ / Images are not stored.
      </p>

      <section className="card">
        <div
          className="drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => choose(e.target.files?.[0])}
          />
          {preview ? <img src={preview} alt="ตัวอย่างรูปที่อัปโหลด" /> : <span>ลากรูปมาวาง หรือคลิกเพื่อเลือก · Drop an image or click</span>}
        </div>
        <div className="row">
          <button onClick={extract} disabled={!file || busy}>
            {busy ? "กำลังอ่าน… / Reading…" : "อ่านข้อมูล / Extract"}
          </button>
          <span className="or">หรือลองตัวอย่างสังเคราะห์ (ไม่ต้องใช้ API) · or try a synthetic sample:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              className="ghost"
              onClick={() => {
                setFile(null);
                setError(null);
                setReviewed(false);
                setReceipt(normalizeExtraction(s.raw));
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="error">{error}</p>}
      </section>

      {receipt && (
        <section className="card" aria-label="ตรวจทาน / Review">
          <h2>ตรวจทาน / Review</h2>

          {receipt.flags.length > 0 ? (
            <ul className="flags">
              {receipt.flags.map((f, i) => (
                <li key={i} className={f.severity}>
                  <b>{f.path}</b> — {f.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="ok">ไม่พบจุดที่น่าสงสัย แต่ควรเทียบกับรูปต้นฉบับทุกครั้ง · No issues found — still compare with the original.</p>
          )}

          <div className="grid">
            <label>
              ประเภท / Type
              <select
                value={receipt.documentType}
                onChange={(e) => edit({ documentType: e.target.value as Receipt["documentType"] })}
              >
                <option value="receipt">ใบเสร็จ / Receipt</option>
                <option value="transfer_slip">สลิปโอนเงิน / Transfer slip</option>
                <option value="unknown">ไม่ทราบ / Unknown</option>
              </select>
            </label>
            <label>
              ร้านค้า / ผู้รับเงิน · Merchant / payee
              <input className={cls("merchant")} value={receipt.merchant ?? ""} onChange={(e) => edit({ merchant: e.target.value || null })} />
              {hint("merchant")}
            </label>
            <label>
              วันที่ (ค.ศ.) / Date
              <input type="date" className={cls("date")} value={receipt.date ?? ""} onChange={(e) => edit({ date: e.target.value || null })} />
              {hint("date")}
            </label>
            <label>
              เวลา / Time
              <input type="time" className={cls("time")} value={receipt.time ?? ""} onChange={(e) => edit({ time: e.target.value || null })} />
              {hint("time")}
            </label>
            <label>
              สกุลเงิน / Currency
              <input className={cls("currency")} value={receipt.currency} onChange={(e) => edit({ currency: e.target.value.toUpperCase() })} />
              {hint("currency")}
            </label>
            {(["subtotal", "vat", "total"] as const).map((k) => (
              <label key={k}>
                {{ subtotal: "ก่อน VAT / Subtotal", vat: "VAT", total: "ยอดรวม / Total" }[k]}
                <input type="number" step="0.01" className={cls(k)} value={receipt[k] ?? ""} onChange={(e) => edit({ [k]: num(e.target.value) })} />
                {hint(k)}
              </label>
            ))}
          </div>

          <h3>รายการ / Line items</h3>
          {hint("lineItems")}
          <div className="scroll">
            <table>
              <thead>
                <tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th><th /></tr>
              </thead>
              <tbody>
                {receipt.lineItems.map((it, i) => (
                  <tr key={i}>
                    <td><input value={it.description} aria-label={`รายการ ${i + 1}`} onChange={(e) => editItem(i, { description: e.target.value })} /></td>
                    <td><input type="number" step="any" className={cls(`lineItems.${i}.quantity`)} value={it.quantity ?? ""} aria-label={`จำนวน ${i + 1}`} onChange={(e) => editItem(i, { quantity: num(e.target.value) })} /></td>
                    <td><input type="number" step="0.01" className={cls(`lineItems.${i}.unitPrice`)} value={it.unitPrice ?? ""} aria-label={`ราคาต่อหน่วย ${i + 1}`} onChange={(e) => editItem(i, { unitPrice: num(e.target.value) })} /></td>
                    <td>
                      <input type="number" step="0.01" className={cls(`lineItems.${i}.amount`)} value={it.amount ?? ""} aria-label={`จำนวนเงิน ${i + 1}`} onChange={(e) => editItem(i, { amount: num(e.target.value) })} />
                      {hint(`lineItems.${i}.amount`)}
                    </td>
                    <td><button className="ghost" aria-label={`ลบรายการ ${i + 1}`} onClick={() => edit({ lineItems: receipt.lineItems.filter((_, k) => k !== i) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="ghost" onClick={() => edit({ lineItems: [...receipt.lineItems, { description: "", quantity: null, unitPrice: null, amount: null }] })}>
            + เพิ่มรายการ / Add item
          </button>

          <div className="export">
            <label className="check">
              <input type="checkbox" checked={reviewed} disabled={hasErrors} onChange={(e) => setReviewed(e.target.checked)} />
              ฉันตรวจเทียบกับรูปต้นฉบับแล้ว · I have checked this against the original
            </label>
            {hasErrors && <small className="error">แก้ข้อผิดพลาดสีแดงก่อนส่งออก · Fix the errors above before exporting.</small>}
            <div className="row">
              <button disabled={!reviewed} onClick={() => download("receipt.json", "application/json", toJSON(receipt))}>ส่งออก JSON</button>
              <button disabled={!reviewed} onClick={() => download("receipt.csv", "text/csv;charset=utf-8", toCSV(receipt))}>ส่งออก CSV</button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
