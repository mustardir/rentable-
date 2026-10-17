import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import RedemptionForm from "./redemption-form";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

type Position = {
  subscriptionId: string;
  productId: string;
  productCode: string;
  productName: string;
  currency: string;
  amountMinor: string;
};

async function getPositions(token: string): Promise<Position[]> {
  const response = await fetch(
    `${API_URL}/investor/portfolio/positions?currency=USD`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (response.status === 401) redirect("/login");
  if (!response.ok) return [];
  return response.json() as Promise<Position[]>;
}

function money(minorValue: string, currency: string) {
  try {
    const minor = BigInt(minorValue);
    const major = minor / 100n;
    const fraction = (minor < 0n ? -minor : minor) % 100n;
    return `${currency} ${major.toLocaleString("en-US")}.${fraction
      .toString()
      .padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export default async function PortfolioPage() {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) redirect("/login");

  const positions = await getPositions(token);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/dashboard" className="font-semibold text-cyan-300">
            Fortress Fund
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Back to dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-12 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          Investor portfolio
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Your investments
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          View your posted investment positions and redeem completed
          investments when you are ready.
        </p>

        {positions.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.05] p-8">
            <h2 className="text-xl font-semibold">No active positions</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Your portfolio currently has no positive posted investment
              positions.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-flex rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200"
            >
              Explore products
            </Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {positions.map((position) => (
              <article
                key={position.productId}
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-7"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  {position.productCode}
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {position.productName}
                </h2>
                <div className="mt-6 rounded-xl border border-white/10 bg-slate-950/40 p-5">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Current position
                  </p>
                  <p className="mt-2 text-3xl font-semibold">
                    {money(position.amountMinor, position.currency)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Based on posted ledger entries.
                  </p>
                </div>
                <RedemptionForm
                  subscriptionId={position.subscriptionId}
                  productName={position.productName}
                  amount={money(position.amountMinor, position.currency)}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
