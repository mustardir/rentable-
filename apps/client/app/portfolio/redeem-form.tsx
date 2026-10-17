"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RedeemForm({ subscriptionId, amountMinor, currency }: { subscriptionId: string; amountMinor: string; currency: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function redeem() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/investments/" + encodeURIComponent(subscriptionId) + "/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.message ?? "Unable to redeem this investment.");
        return;
      }
      setConfirm(false);
      router.refresh();
    } catch {
      setError("Unable to reach the investment service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5">
      {!confirm ? (
        <button type="button" onClick={() => setConfirm(true)} className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Redeem</button>
      ) : (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
          <p className="text-sm text-amber-100">Redeem {currency} {formatMoney(amountMinor)} from this position?</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={submitting} onClick={redeem} className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{submitting ? "Redeeming…" : "Confirm redemption"}</button>
            <button type="button" disabled={submitting} onClick={() => setConfirm(false)} className="rounded-lg border border-white/15 px-4 py-2 text-sm">Cancel</button>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function formatMoney(value: string) {
  try {
    const amount = BigInt(value);
    const major = amount / 100n;
    const minor = amount % 100n;
    return major.toLocaleString("en-US") + "." + minor.toString().padStart(2, "0");
  } catch {
    return "—";
  }
}
