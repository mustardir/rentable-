"use client";

import { useActionState } from "react";
import { requestDeposit, requestWithdrawal } from "./wallet-actions";

const initialState = { ok: false, message: "" };

type WalletRequest = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  status: string;
  amountKobo: string;
  currency: string;
  reference: string;
  createdAt: string;
};

function formatKobo(amountKobo: string, currency: string) {
  try {
    const amount = BigInt(amountKobo);
    const major = amount / 100n;
    const minor = (amount < 0n ? -amount : amount) % 100n;
    return `${currency} ${major.toLocaleString("en-NG")}.${minor.toString().padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function RequestForm({ action, label, description }: { action: typeof requestDeposit; label: string; description: string }) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <form action={formAction} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
      <h3 className="font-semibold">{label}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-slate-500" htmlFor={`${label}-amount`}>Amount (NGN)</label>
      <input id={`${label}-amount`} name="amount" inputMode="decimal" placeholder="0.00" required min="0.01" step="0.01" className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-cyan-300" />
      <button type="submit" disabled={pending} className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? "Submitting…" : label}
      </button>
      {state.message ? <p className={`mt-3 text-sm ${state.ok ? "text-emerald-300" : "text-rose-300"}`}>{state.message}</p> : null}
    </form>
  );
}

export function WalletActionsPanel({ requests, balanceKobo, currency }: { requests: WalletRequest[]; balanceKobo: string; currency: string }) {
  return (
    <section className="mt-5 rounded-2xl border border-white/10 bg-slate-900/70 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Wallet</p>
          <h2 className="mt-1 text-xl font-semibold">Deposit or withdraw</h2>
          <p className="mt-1 text-sm text-slate-500">Requests remain pending until an authorized admin or compliance user confirms them.</p>
        </div>
        <p className="text-sm text-slate-400">Available: <span className="font-semibold text-white">{formatKobo(balanceKobo, currency)}</span></p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <RequestForm action={requestDeposit} label="Deposit" description="Submit funds for review and posting to your Fortress wallet." />
        <RequestForm action={requestWithdrawal} label="Withdraw" description="Request a withdrawal from your posted available balance." />
      </div>
      <div className="mt-6">
        <p className="text-xs uppercase tracking-wider text-slate-500">Recent wallet requests</p>
        <div className="mt-3 divide-y divide-white/10">
          {requests.length === 0 ? <p className="py-4 text-sm text-slate-500">No deposit or withdrawal requests yet.</p> : requests.map((request) => (
            <div key={request.id} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{request.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} · {request.reference}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(request.createdAt).toLocaleDateString("en-NG")}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold">{formatKobo(request.amountKobo, request.currency)}</p>
                <p className="mt-1 text-xs text-cyan-300">{request.status}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
