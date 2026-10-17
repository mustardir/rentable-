import Link from "next/link";

export default function DashboardInvestmentsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Investments</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your investments</h1>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-8">
        <p className="text-lg font-medium">No live investments connected yet.</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Portfolio positions will be derived from the ledger rather than stored as mutable balances.</p>
        <Link href="/products" className="mt-6 inline-block rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Explore products</Link>
      </div>
    </section>
  );
}
