export default function DashboardDocumentsPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Documents</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your documents</h1>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-8">
        <p className="text-lg font-medium">No documents available yet.</p>
        <p className="mt-2 text-sm leading-6 text-slate-400">Investment confirmations and contracts will appear here once authenticated document generation is connected.</p>
      </div>
    </section>
  );
}
