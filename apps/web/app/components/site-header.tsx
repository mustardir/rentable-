import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-white/10 bg-slate-950/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="font-semibold tracking-tight">Fortress Funds</Link>
        <nav className="flex items-center gap-5 text-sm text-slate-300">
          <Link href="/products" className="transition hover:text-white">Products</Link>
          <Link href="/login" className="rounded-lg border border-white/15 px-4 py-2 text-white transition hover:bg-white/10">Sign in</Link>
        </nav>
      </div>
    </header>
  );
}
