import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import InvestmentForm from "./investment-form";

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

async function getProduct(id: string, token: string): Promise<Product | null> {
  const response = await fetch(`${API_URL}/investor/products/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (response.status === 401) redirect("/login");
  if (!response.ok) return null;
  return response.json() as Promise<Product>;
}

function money(minorValue: string, currency: string) {
  try {
    const minor = BigInt(minorValue);
    const major = minor / 100n;
    const fraction = (minor < 0n ? -minor : minor) % 100n;
    return `${currency} ${major.toLocaleString("en-US")}.${fraction.toString().padStart(2, "0")}`;
  } catch {
    return "—";
  }
}

export default async function InvestmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string }>;
}) {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) redirect("/login");

  const { productId } = await searchParams;
  if (!productId) redirect("/products");

  const product = await getProduct(productId, token);
  if (!product) redirect("/products");

  if (product.status !== "ACTIVE") {
    return (
      <main className="min-h-screen bg-slate-950 text-white">
        <section className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
          <Link href="/products" className="text-sm text-cyan-300 hover:text-cyan-200">← Back to products</Link>
          <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-8">
            <h1 className="text-2xl font-semibold">Product unavailable</h1>
            <p className="mt-3 text-sm leading-6 text-amber-100/80">This investment product is not currently active.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
          <Link href="/dashboard" className="font-semibold text-cyan-300">Fortress Fund</Link>
          <Link href="/products" className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/10">Back to products</Link>
        </div>
      </header>
      <section className="mx-auto max-w-2xl px-6 py-12 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">New investment</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{product.name}</h1>
        <p className="mt-3 text-slate-400">{product.description ?? "Fortress Fund investment product."}</p>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Product</p>
            <p className="mt-1 text-sm font-medium">{product.code}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">Minimum</p>
            <p className="mt-1 text-sm font-medium">{money(product.minimumAmountMinor, product.currency)}</p>
          </div>
        </div>
        <InvestmentForm productId={product.id} currency={product.currency} minimumAmountMinor={product.minimumAmountMinor} />
      </section>
    </main>
  );
}
