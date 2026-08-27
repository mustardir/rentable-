export default function DashboardProfilePage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Profile & KYC</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your profile</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <p className="text-xs uppercase tracking-wider text-slate-500">Account</p>
          <p className="mt-3 text-lg font-medium">Authentication required</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Account details will be loaded only for the authenticated investor.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <p className="text-xs uppercase tracking-wider text-slate-500">Verification</p>
          <p className="mt-3 text-lg font-medium">KYC status unavailable</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">KYC information will be supplied by the secure compliance API in a later layer.</p>
        </div>
      </div>
    </section>
  );
}
