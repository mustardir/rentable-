import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

type Product = {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  currency: string;
  minimumAmountMinor: string;
  status: string;
};

type Eligibility = {
  eligible: boolean;
  reason: string | null;
};

async function api<T>(path: string, token: string): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 401) redirect("/login");
  if (!response.ok) return null;

  return response.json() as Promise<T>;
}

function minimumAmount(product: Product) {
  try {
    const minor = BigInt(product.minimumAmountMinor);
    const major = minor / 100n;
    const fraction = (minor < 0n ? -minor : minor) % 100n;
    return `${product.currency} ${major.toLocaleString("en-US")}.${fraction
      .toString()
      .padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

function typeLabel(type: string) {
  return type.replaceAll("_", " ").toLowerCase().replace(/\\b\\w/g, (char) => char.toUpperCase());
}

export default async function ProductsPage() {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) redirect("/login");

  const products = (await api<Product[]>("/investor/products", token)) ?? [];

  const eligibleProducts = await Promise.all(
    products.map(async (product) => ({
      product,
      eligibility: await api<Eligibility>(
        `/investor/products/${product.id}/eligibility`,
        token,
      ),
    })),
  );

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
          Investment products
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Product catalogue
        </h1>
        <p className="mt-3 max-w-2xl text-slate-400">
          Review active Fortress Fund products and your eligibility before
          starting an investment.
        </p>

        {eligibleProducts.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.05] p-8">
            <h2 className="text-xl font-semibold">No active products</h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              There are no investment products currently available in the
              catalogue.
            </p>
          </div>
        ) : (
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {eligibleProducts.map(({ product, eligibility }) => {
              const isEligible = eligibility?.eligible === true;

              return (
                <article
                  key={product.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.05] p-7"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                        {product.code}
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {product.name}
                      </h2>
                    </div>
                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                      {product.status}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-slate-400">
                    {product.description ?? "Fortress Fund investment product."}
                  </p>

                  <dl className="mt-6 grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                      <dt className="text-xs uppercase tracking-wider text-slate-500">
                        Type
                      </dt>
                      <dd className="mt-1 text-sm font-medium">
                        {typeLabel(product.type)}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
                      <dt className="text-xs uppercase tracking-wider text-slate-500">
                        Minimum
                      </dt>
                      <dd className="mt-1 text-sm font-medium">
                        {minimumAmount(product)}
                      </dd>
                    </div>
                  </dl>

                  <div
                    className={
                      isEligible
                        ? "mt-6 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4"
                        : "mt-6 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4"
                    }
                  >
                    <p
                      className={
                        isEligible
                          ? "text-sm font-semibold text-emerald-200"
                          : "text-sm font-semibold text-amber-200"
                      }
                    >
                      {isEligible
                        ? "Eligible to invest"
                        : "Eligibility requirements not met"}
                    </p>
                    {!isEligible && eligibility?.reason ? (
                      <p className="mt-1 text-xs text-amber-100/70">
                        {eligibility.reason.replaceAll("_", " ")}
                      </p>
                    ) : null}
                  </div>

                  {isEligible ? (
                    <Link
                      href={`/investments?productId=${product.id}`}
                      className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 hover:bg-cyan-200"
                    >
                      Start investment
                    </Link>
                  ) : (
                    <div className="mt-6 rounded-xl border border-white/10 px-5 py-3 text-center text-sm text-slate-500">
                      Complete eligibility requirements to continue
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
