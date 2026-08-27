const products = [
  {
    code: "FORT-INVEST-001",
    name: "Fortress Investment",
    type: "Investment",
    currency: "USD",
    minimum: "$50.00",
    status: "Available",
    description: "A structured investment product designed for disciplined long-term capital growth.",
  },
  {
    code: "FORT-FIXED-001",
    name: "Fortress Fixed Income",
    type: "Fixed Income",
    currency: "NGN",
    minimum: "₦50,000",
    status: "Coming soon",
    description: "A fixed-income product for investors seeking predictable income characteristics.",
  },
];

export default function ProductsPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto max-w-7xl px-6 py-20 sm:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Fortress Funds</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Investment products built for disciplined capital.</h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">Explore products, review their terms and choose the opportunity that fits your investment objectives.</p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {products.map((product) => (
            <article key={product.code} className="rounded-3xl border border-white/10 bg-white/[0.06] p-7 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium tracking-widest text-slate-400">{product.code}</p>
                  <h2 className="mt-2 text-2xl font-semibold">{product.name}</h2>
                </div>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">{product.status}</span>
              </div>

              <p className="mt-5 leading-7 text-slate-300">{product.description}</p>

              <dl className="mt-7 grid grid-cols-2 gap-5 border-y border-white/10 py-6">
                <div><dt className="text-xs uppercase tracking-wider text-slate-500">Type</dt><dd className="mt-1 font-medium">{product.type}</dd></div>
                <div><dt className="text-xs uppercase tracking-wider text-slate-500">Currency</dt><dd className="mt-1 font-medium">{product.currency}</dd></div>
                <div><dt className="text-xs uppercase tracking-wider text-slate-500">Minimum</dt><dd className="mt-1 text-lg font-semibold">{product.minimum}</dd></div>
              </dl>

              <button className="mt-6 w-full rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200">View product</button>
            </article>
          ))}
        </div>

        <p className="mt-10 max-w-3xl text-sm leading-6 text-slate-500">Investment products are subject to their applicable terms, eligibility requirements and risk disclosures. This catalogue currently uses presentation data only; it does not access investor accounts or ledger balances.</p>
      </section>
    </main>
  );
}
