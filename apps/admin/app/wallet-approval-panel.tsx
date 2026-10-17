'use client';

import { useState, useTransition } from 'react';
import { approveWalletRequest } from './wallet-actions';
import type { WalletRequest } from '../lib/wallet';

function formatNgn(amountKobo: string, currency: string) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(BigInt(amountKobo)) / 100);
}

function customerName(request: WalletRequest) {
  const name = [request.user.firstName, request.user.lastName].filter(Boolean).join(' ');
  return name || request.user.email;
}

export default function WalletApprovalPanel({ requests }: { requests: WalletRequest[] }) {
  const [items, setItems] = useState(requests);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm(request: WalletRequest) {
    const verb = request.type === 'DEPOSIT' ? 'credit' : 'debit';
    if (!window.confirm(`Confirm ${request.type.toLowerCase()} of ${formatNgn(request.amountKobo, request.currency)}? This will ${verb} the customer ledger and cannot be undone from this screen.`)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await approveWalletRequest(request.id);
      setMessage(result.message);
      if (result.ok) setItems((current) => current.filter((item) => item.id !== request.id));
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">Operations</p>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">Wallet approvals</h2>
          <p className="mt-1 text-sm text-zinc-500">Pending customer deposits and withdrawals awaiting staff confirmation.</p>
        </div>
        <div className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-800">{items.length} pending</div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">{message}</div>}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500">No pending wallet requests.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
              <tr><th className="px-3 py-3">Customer</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Amount</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Requested</th><th className="px-3 py-3 text-right">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((request) => (
                <tr key={request.id}>
                  <td className="px-3 py-4"><div className="font-medium text-zinc-900">{customerName(request)}</div><div className="text-xs text-zinc-500">{request.user.email}</div></td>
                  <td className="px-3 py-4"><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold">{request.type}</span></td>
                  <td className="px-3 py-4 font-semibold text-zinc-900">{formatNgn(request.amountKobo, request.currency)}</td>
                  <td className="px-3 py-4 font-mono text-xs text-zinc-600">{request.reference}</td>
                  <td className="px-3 py-4 text-zinc-600">{new Date(request.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-4 text-right"><button disabled={pending} onClick={() => confirm(request)} className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Processing…' : 'Confirm & post'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
