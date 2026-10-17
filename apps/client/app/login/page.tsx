"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(data?.message ?? "Unable to sign in."); return; }
      router.push("/dashboard");
      router.refresh();
    } catch { setError("Authentication service is unavailable."); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/" className="text-sm font-semibold text-cyan-300">Fortress Fund</Link>
        <h1 className="mt-10 text-4xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-3 text-slate-400">Access your authenticated investor workspace.</p>
        <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border border-white/10 bg-white/[0.05] p-7">
          <label className="block"><span className="text-sm text-slate-300">Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-300" /></label>
          <label className="block"><span className="text-sm text-slate-300">Password</span><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 outline-none focus:border-cyan-300" /></label>
          {error ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
          <button disabled={loading} className="w-full rounded-xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50">{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}
