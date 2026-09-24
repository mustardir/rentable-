import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Profile = { id: string; email: string; role: string; profile: { firstName: string | null; lastName: string | null; country: string | null } | null };
type Balance = { accountId: string; currency: string; balanceKobo: string };
type Transaction = { id: string; reference: string; description: string; currency: string; direction: "DEBIT" | "CREDIT"; amountKobo: string; postedAt: string };

async function api(path: string, token: string) {
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401) redirect("/login");
  if (!response.ok) return null;
  return response.json();
}

function money(value: string, currency: string) {
  try { const amount = BigInt(value); const major = amount / 100n; const minor = (amount < 0n ? -amount : amount) % 100n; return `${currency} ${major.toLocaleString("en-US")}.${minor.toString().padStart(2, "0")}`; } catch { return "—"; }
}

export default async function ClientDashboard() {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) redirect("/login");
  const [profile, balance, transactions] = await Promise.all([
    api("/investor/profile", token) as Promise<Profile | null>,
    api("/ledger/me/balance", token) as Promise<Balance | null>,
    api("/ledger/me/transactions?limit=10", token) as Promise<Transaction[] | null>,
  ]);
  const name = [profile?.profile?.firstName, profile?.profile?.lastName].filter(Boolean).join(" ") || "Investor";
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10"><Link href="/" className="font-semibold text-cyan-300">Fortress Fund</Link><div className="flex items-center gap-4"><span className="hidden text-sm text-slate-400 sm:block">{profile?.email ?? "Investor"}</span><form action="/api/auth/logout" method="post"><button className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Sign out</button></form></div></div></header>
      <section className="mx-auto max-w-7xl px-6 py-12 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Investor dashboard</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Welcome, {name}.</h1>
        <p className="mt-3 text-slate-400">Role: {profile?.role ?? "Investor"}</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 md:col-span-2"><p className="text-xs uppercase tracking-wider text-slate-500">Available balance</p><p className="mt-2 text-3xl font-semibold">{balance ? money(balance.balanceKobo, balance.currency) : "—"}</p><p className="mt-2 text-sm text-slate-500">Derived from posted ledger entries.</p></div>
          <Link href="/products" className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-6 hover:bg-cyan-300/15"><p className="text-xs uppercase tracking-wider text-cyan-200">Invest</p><p className="mt-2 text-xl font-semibold">Explore products →</p><p className="mt-2 text-sm text-slate-300">Review available investment opportunities.</p></Link>
        <Link href="/portfolio" className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 hover:bg-white/[0.08]"><p className="text-xs uppercase tracking-wider text-slate-500">Portfolio</p><p className="mt-2 text-xl font-semibold">View investments →</p><p className="mt-2 text-sm text-slate-400">Review positions and redeem completed investments.</p></Link></div>
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Recent transactions</h2><span className="text-xs text-slate-500">Posted ledger entries</span></div><div className="mt-5 divide-y divide-white/10">{(transactions ?? []).length === 0 ? <p className="py-6 text-sm text-slate-500">No posted transactions yet.</p> : transactions?.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="truncate text-sm font-medium">{transaction.description}</p><p className="mt-1 text-xs text-slate-500">{transaction.reference} · {new Date(transaction.postedAt).toLocaleDateString("en-US")}</p></div><p className={`shrink-0 text-sm font-semibold ${transaction.direction === "CREDIT" ? "text-emerald-300" : "text-white"}`}>{transaction.direction === "CREDIT" ? "+" : "−"}{money(transaction.amountKobo, transaction.currency)}</p></div>)}</div></section>
      </section>
    </main>
  );
}
