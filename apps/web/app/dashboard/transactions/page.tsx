export default function DashboardTransactionsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Transactions</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Transaction activity</h1>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-8">
        <p className="text-lg font-medium">No transaction data connected.</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Transaction history will be supplied by the authenticated ledger API. This page does not calculate or store balances.</p>
      </div>
    </section>
  );
}
