import Link from "next/link";

export default function ClientHome() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-20 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Fortress Fund</p>
        <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Your secure investor workspace.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          Manage your account, view posted ledger activity, explore investment products and track your financial documents from one authenticated workspace.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/login" className="rounded-xl bg-cyan-300 px-6 py-3 font-semibold text-slate-950 hover:bg-cyan-200">
            Sign in
          </Link>
          <Link href="/dashboard" className="rounded-xl border border-white/15 px-6 py-3 font-semibold hover:bg-white/10">
            Open dashboard
          </Link>
        </div>
        <p className="mt-10 text-sm text-slate-500">
          Financial balances and transactions are read from the Fortress Fund API and ledger. This client does not maintain a separate financial database.
        </p>
      </section>
    </main>
  );
}
