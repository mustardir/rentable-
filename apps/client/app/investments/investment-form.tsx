"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  productId: string;
  currency: string;
  minimumAmountMinor: string;
};

export default function InvestmentForm({ productId, currency, minimumAmountMinor }: Props) {
  const router = useRouter();
  const [amountMinor, setAmountMinor] = useState(minimumAmountMinor);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!/^[0-9]+$/.test(amountMinor) || BigInt(amountMinor) <= 0n) {
      setError("Enter a positive whole number of minor currency units.");
      return;
    }
    if (BigInt(amountMinor) < BigInt(minimumAmountMinor)) {
      setError(`The minimum investment is ${currency} ${minimumAmountMinor} minor units.`);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/investments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          amountMinor,
          currency,
          reference: reference.trim() || undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.message ?? "Unable to create the investment.");
        return;
      }
      router.push("/dashboard?investment=created");
      router.refresh();
    } catch {
      setError("Unable to reach the investment service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 rounded-2xl border border-white/10 bg-white/[0.05] p-7">
      <h2 className="text-xl font-semibold">Investment amount</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        Enter the amount in minor currency units. For USD, 5000 minor units equals USD 50.00.
      </p>
      <label className="mt-6 block text-sm font-medium text-slate-200">
        Amount ({currency} minor units)
        <input
          name="amountMinor"
          inputMode="numeric"
          pattern="[0-9]+"
          value={amountMinor}
          onChange={(event) => setAmountMinor(event.target.value)}
          className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300"
          required
        />
      </label>
      <label className="mt-5 block text-sm font-medium text-slate-200">
        Reference (optional)
        <input
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={120}
          className="mt-2 w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300"
        />
      </label>
      {error ? <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <button type="submit" disabled={submitting} className="mt-6 w-full rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
        {submitting ? "Processing investment…" : "Create and fund investment"}
      </button>
    </form>
  );
}
