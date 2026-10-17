import Link from "next/link";
import { SiteHeader } from "./components/site-header";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:py-32">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300">Fortress Funds</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight sm:text-7xl">Build wealth with clarity, discipline and confidence.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300">A modern investment and financial platform designed to help you discover opportunities, understand your money and manage your financial journey.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/products" className="rounded-xl bg-cyan-300 px-6 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-200">Explore investments</Link>
            <Link href="/login" className="rounded-xl border border-white/15 px-6 py-3 text-center font-semibold transition hover:bg-white/10">Sign in</Link>
          </div>
          <p className="mt-6 text-xs leading-5 text-slate-500">Investment products involve risk. Availability, eligibility and returns are subject to applicable product terms and disclosures.</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Platform</p>
          <h2 className="mt-3 text-2xl font-semibold">One place for your financial journey.</h2>
          <div className="mt-7 space-y-4">
            {[
              ["Investments", "Discover structured opportunities and review their terms."],
              ["Digital finance", "A foundation for deposits, transfers and future financial services."],
              ["Documents", "Access investment confirmations and important financial documents."],
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-slate-500">Fortress Funds · Financial services subject to applicable terms, eligibility requirements and regulatory obligations.</footer>
    </main>
  );
}
