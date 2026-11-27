"use client";

import { useEffect, useState } from "react";
import { bangkokDay, type SlipQr, type Verification } from "@eve-thai-receipt-extension/extractor/core";
import { findSlipQr, type FoundSlipQr } from "@/lib/qr";
import { apiErrorText, tpl, type ApiError, type Dict, type Lang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

interface Service {
  enabled: boolean;
  provider?: string;
}

/**
 * Looks for the slip's QR code in the photos, on this device, whether or not a bank
 * check is set up, and says whether the reference read agrees with the one in it.
 * When the server has a verification service, it also asks the bank whether the
 * transfer exists. Nothing is sent until the person presses the button, and then only
 * the QR text.
 */
export function SlipCheck({
  files,
  verification,
  mismatch,
  reference,
  qrRef,
  lang,
  t,
  onVerified,
  onQr,
  onUseQrReference,
}: {
  files: File[];
  verification: Verification | undefined;
  /** The reference as it stands now, and how it compares with the QR code's (null: nothing to compare). */
  reference: string | null;
  qrRef: { qr: string; agrees: boolean } | null;
  /** The bank has the transfer, but its amount or date differs from the slip as it now stands. */
  mismatch: boolean;
  lang: Lang;
  t: Dict;
  onVerified: (v: Verification) => void;
  /** Called with what the QR code says, or null when none was found. */
  onQr: (qr: SlipQr | null) => void;
  onUseQrReference: () => void;
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

  // Looking for the QR code happens on this device, so it can start before any button is pressed,
  // and it does not need a bank-check service: the comparison with the reference is made anyway.
  useEffect(() => {
    let alive = true;
    setFound(undefined);
    findSlipQr(files)
      .catch(() => null)
      .then((f) => {
        if (!alive) return;
        setFound(f);
        onQr(f?.qr ?? null);
      });
    return () => {
      alive = false;
    };
    // `onQr` is a fresh function on each render and only reports the result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

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
      {found === undefined && <p className="notice">{t.slipScanning}</p>}
      {found === null && <p className="notice warning">{service?.enabled ? t.slipNoQr : t.slipNoQrLocal}</p>}
      {found && qrRef?.agrees && <div className="verify-status ok" role="status">{t.slipQrMatches}</div>}
      {found && qrRef && !qrRef.agrees && (
        <div className="verify-status warn" role="status">
          {tpl(t.slipQrMismatch, { printed: reference ?? "", qr: qrRef.qr })}
          <div className="row">
            <Button variant="outline" size="sm" onClick={onUseQrReference}>{t.useQrReference}</Button>
          </div>
        </div>
      )}
      {service?.enabled && found && (
        <>
          {!verification && <p className="hint">{tpl(t.slipDisclosure, { provider: service.provider ?? "" })}</p>}
          <div className="row">
            <Button onClick={check} disabled={busy}>
              {busy ? t.slipChecking : verification ? t.slipRecheck : t.slipCheck}
            </Button>
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
