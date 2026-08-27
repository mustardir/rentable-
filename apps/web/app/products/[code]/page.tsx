import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "../../components/site-header";
import { SiteFooter } from "../../components/site-footer";

const products = {
  "FORT-INVEST-001": {
    code: "FORT-INVEST-001",
    name: "Fortress Investment",
    type: "Investment",
    currency: "USD",
    minimum: "$50.00",
    status: "Available",
    description: "A structured investment product designed for disciplined long-term capital growth.",
    terms: ["Minimum subscription: $50.00", "Currency: USD", "Status: Available for eligible investors", "Investment terms and applicable disclosures apply"],
  },
  "FORT-FIXED-001": {
    code: "FORT-FIXED-001",
    name: "Fortress Fixed Income",
    type: "Fixed Income",
    currency: "NGN",
    minimum: "₦50,000",
    status: "Coming soon",
    description: "A fixed-income product for investors seeking predictable income characteristics.",
    terms: ["Minimum subscription: ₦50,000", "Currency: NGN", "Status: Coming soon", "Final terms and disclosures will apply when launched"],
  },
} as const;

export default async function ProductDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const product = products[code as keyof typeof products];
  if (!product) notFound();

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-20 sm:px-10">
        <Link href="/products" className="text-sm text-cyan-300 hover:text-cyan-200">← Back to products</Link>
        <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.06] p-8 sm:p-12">
          <p className="text-xs font-medium tracking-[0.2em] text-slate-500">{product.code}</p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{product.name}</h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">{product.description}</p>
            </div>
            <span className="w-fit rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">{product.status}</span>
          </div>

          <dl className="mt-10 grid gap-6 border-y border-white/10 py-8 sm:grid-cols-3">
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Type</dt><dd className="mt-1 font-medium">{product.type}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Currency</dt><dd className="mt-1 font-medium">{product.currency}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-slate-500">Minimum</dt><dd className="mt-1 text-xl font-semibold">{product.minimum}</dd></div>
          </dl>

          <div className="mt-8">
            <h2 className="text-xl font-semibold">Key terms</h2>
            <ul className="mt-4 space-y-3 text-slate-300">
              {product.terms.map((term) => <li key={term}>• {term}</li>)}
            </ul>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-slate-900/70 p-5 text-sm leading-6 text-slate-400">
            This product-detail page currently uses presentation data only. No investor account, wallet, KYC record or ledger balance is accessed here.
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
