import Link from "next/link";
import { getInvestorProfile } from "../../../lib/investor/profile";

export default async function DashboardProfilePage() {
  const investor = await getInvestorProfile();

  if (!investor) {
    return (
      <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Profile & KYC</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Your profile</h1>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <p className="text-lg font-medium">Profile unavailable</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Your authenticated session could not be validated. Please sign in again.</p>
          <Link href="/login" className="mt-5 inline-block rounded-xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950">Sign in</Link>
        </div>
      </section>
    );
  }

  const profile = investor.profile;
  const fullName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Investor";

  return (
    <section className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Profile & KYC</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">{fullName}</h1>
      <p className="mt-2 text-slate-400">{investor.email}</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <p className="text-xs uppercase tracking-wider text-slate-500">Account</p>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-slate-500">Role</dt><dd>{investor.role}</dd></div>
            <div><dt className="text-slate-500">Phone</dt><dd>{profile?.phone ?? "—"}</dd></div>
            <div><dt className="text-slate-500">Country</dt><dd>{profile?.country ?? "—"}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <p className="text-xs uppercase tracking-wider text-slate-500">Verification</p>
          <p className="mt-3 text-lg font-medium">KYC remains isolated</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">This profile endpoint exposes no KYC documents or financial records. Those remain behind their own authorization boundaries.</p>
        </div>
      </div>
    </section>
  );
}
