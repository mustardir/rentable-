import Link from "next/link";

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/dashboard" className="text-sm font-semibold text-cyan-300">← Back to dashboard</Link>
        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Investment products</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Product catalogue</h1>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.05] p-8">
          <h2 className="text-xl font-semibold">Catalogue API integration is next</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            The investor client is now connected to the authenticated Fortress Fund API and immutable ledger. Product listings will be populated from the persistent financial-product domain before investors can subscribe to an investment.
          </p>
        </div>
      </div>
    </main>
  );
}
