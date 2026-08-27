"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message ?? "Unable to sign in. Please check your credentials.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Fortress Funds</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to access your investor workspace.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="block text-sm font-medium">
            Email
            <input type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none transition focus:border-cyan-300" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none transition focus:border-cyan-300" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button>
        </form>
      </div>
    </main>
  );
}
