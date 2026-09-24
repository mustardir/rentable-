"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  subscriptionId: string;
  productName: string;
  amount: string;
};

export default function RedemptionForm({
  subscriptionId,
  productName,
  amount,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function redeem() {
    setError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/investments/" + encodeURIComponent(subscriptionId) + "/redeem",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.message ?? "Unable to redeem this investment.");
        return;
      }

      router.push("/portfolio?redeemed=1");
      router.refresh();
    } catch {
      setError("Unable to reach the investment service. Please try again.");
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
        <p className="text-sm font-semibold text-amber-200">
          Confirm redemption
        </p>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          Redeem {amount} from {productName}? The redemption will post through
          the investment ledger and return the position to your available
          balance.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-rose-200">{error}</p>
        ) : null}
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={submitting}
            className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={redeem}
            disabled={submitting}
            className="flex-1 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"
          >
            {submitting ? "Redeeming…" : "Confirm redemption"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error ? (
        <div className="mb-4 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-xl border border-white/15 px-5 py-3 font-semibold hover:bg-white/10"
      >
        Redeem investment
      </button>
    </div>
  );
}
