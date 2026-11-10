"use client";

import { useEffect, useState } from "react";
import { bangkokDay, type Verification } from "@thai-receipt-reader/extractor/core";
import { findSlipQr, type FoundSlipQr } from "@/lib/qr";
import { apiErrorText, tpl, type ApiError, type Dict, type Lang } from "@/lib/i18n";

interface Service {
  enabled: boolean;
  provider?: string;
}

/**
 * Asks the bank whether a transfer slip's transfer exists, when the server has a
 * verification service set up and the slip's QR code can be found in the photos.
 * Nothing is sent until the person presses the button, and then only the QR text.
 */
export function SlipCheck({
  files,
  verification,
  mismatch,
  lang,
  t,
  onVerified,
}: {
  files: File[];
  verification: Verification | undefined;
  /** The bank has the transfer, but its amount or date differs from the slip as it now stands. */
  mismatch: boolean;
  lang: Lang;
  t: Dict;
  onVerified: (v: Verification) => void;
}) {
  const [service, setService] = useState<Service | null>(null);
  // undefined while looking, null when the photos have no slip QR code.
  const [found, setFound] = useState<FoundSlipQr | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/verify-slip")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Service | null) => alive && setService(s && typeof s.enabled === "boolean" ? s : null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Looking for the QR code happens on this device, so it can start before any button is pressed.
  useEffect(() => {
    if (!service?.enabled) return;
    let alive = true;
    setFound(undefined);
    findSlipQr(files)
      .then((f) => alive && setFound(f))
      .catch(() => alive && setFound(null));
    return () => {
      alive = false;
    };
  }, [service?.enabled, files]);

  async function check() {
    if (!found) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/verify-slip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: found.payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.verification) {
        onVerified(body.verification as Verification);
      } else {
        setError(body ?? {});
        // Note that it was asked and could not be answered, so an export says so. An answer already
        // had (verified, not found, pending) is kept: a later failure does not undo it.
        const reasons = ["rejected", "quota", "busy", "error"];
        if (body?.code === "slip_unavailable" && (!verification || verification.status === "unavailable")) {
          onVerified({
            status: "unavailable",
            reason: reasons.includes(body.reason) ? body.reason : "error",
            provider: service?.provider ?? "",
            checkedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      setError({});
    } finally {
      setBusy(false);
    }
  }

  const bank = verification?.status === "verified" ? verification.bank : undefined;

  return (
    <section className="verify" aria-label={t.slipCheckTitle}>
      <h3>{t.slipCheckTitle}</h3>
      <p className="hint">{t.slipCheckIntro}</p>

      {service && !service.enabled && <p className="notice">{t.slipNoService}</p>}
      {service?.enabled && found === undefined && <p className="notice">{t.slipScanning}</p>}
      {service?.enabled && found === null && <p className="notice warning">{t.slipNoQr}</p>}
      {service?.enabled && found && (
        <>
          {!verification && <p className="hint">{tpl(t.slipDisclosure, { provider: service.provider ?? "" })}</p>}
          <div className="row">
            <button onClick={check} disabled={busy}>
              {busy ? t.slipChecking : verification ? t.slipRecheck : t.slipCheck}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="error">{apiErrorText(error, lang)}</p>}

      {verification?.status === "verified" && bank && (
        <div className={`verify-status ${mismatch ? "bad" : "ok"}`} role="status">
          {tpl(mismatch ? t.slipMismatch : t.slipVerified, { amount: bank.amount.toFixed(2), date: (bank.date && bangkokDay(bank.date)) || "-" })}
          {!mismatch && <small>{t.slipVerifiedNote}</small>}
        </div>
      )}
      {verification?.status === "not_found" && <div className="verify-status warn" role="status">{t.slipNotFoundStatus}</div>}
      {verification?.status === "pending" && <div className="verify-status warn" role="status">{t.slipPendingStatus}</div>}
      {verification?.status === "unavailable" && <div className="verify-status warn" role="status">{t.slipUnavailableStatus}</div>}
    </section>
  );
}
