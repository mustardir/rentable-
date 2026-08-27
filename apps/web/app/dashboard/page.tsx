import Link from "next/link";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

const sections = [
  ["Portfolio", "Track your investments and portfolio activity.", "#"],
  ["Investments", "Review active and completed investment products.", "/products"],
  ["Transactions", "View deposits, withdrawals and account activity.", "#"],
  ["Documents", "Access investment confirmations and financial documents.", "#"],
  ["Profile & KYC", "Manage your profile and verification status.", "#"],
] as const;

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Investor dashboard</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Your financial command centre.</h1>
            <p className="mt-4 max-w-2xl text-slate-400">A secure workspace for investments, transactions and documents. Live investor data will be connected only after the underlying financial APIs are production-ready.</p>
          </div>
          <Link href="/products" className="rounded-xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/10">Explore products</Link>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 sm:col-span-2 lg:col-span-3">
            <p className="text-xs uppercase tracking-wider text-slate-500">Portfolio value</p>
            <p className="mt-2 text-3xl font-semibold">—</p>
            <p className="mt-2 text-sm text-slate-500">Awaiting authenticated portfolio data</p>
          </div>
          {sections.map(([title, description, href]) => (
            <Link key={title} href={href} className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 transition hover:border-white/20 hover:bg-white/[0.08]">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
              <span className="mt-5 inline-block text-sm font-medium text-cyan-300">Open →</span>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/50 p-5 text-sm leading-6 text-slate-500">
          Dashboard data is intentionally empty at this stage. No live wallet balances, ledger entries, KYC records or investor financial information are read by this page.
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
