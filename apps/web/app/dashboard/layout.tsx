import Link from "next/link";
import { SiteFooter } from "../components/site-footer";

const navigation = [
  ["Overview", "/dashboard"],
  ["Investments", "/dashboard/investments"],
  ["Transactions", "/dashboard/transactions"],
  ["Documents", "/dashboard/documents"],
  ["Profile & KYC", "/dashboard/profile"],
] as const;

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        <aside className="border-b border-white/10 bg-slate-950 px-6 py-6 lg:w-64 lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
          <Link href="/dashboard" className="text-lg font-semibold tracking-tight">Fortress Funds</Link>
          <p className="mt-1 text-xs text-slate-500">Investor workspace</p>
          <nav className="mt-8 flex gap-2 overflow-x-auto lg:flex-col">
            {navigation.map(([label, href]) => (
              <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs text-slate-500 lg:block">
            Account security and authentication will be connected in the next application layer.
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
