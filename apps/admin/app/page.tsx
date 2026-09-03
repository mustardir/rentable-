import WalletApprovalPanel from './wallet-approval-panel';
import { getPendingWalletRequests } from '../lib/wallet';

export const dynamic = 'force-dynamic';

export default async function Home() {
  try {
    const requests = await getPendingWalletRequests(50);
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-2 border-b border-zinc-200 pb-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-zinc-500">Fortress Finance</p>
            <h1 className="text-3xl font-bold tracking-tight">Operations Console</h1>
            <p className="text-sm text-zinc-600">Admin & Compliance wallet review</p>
          </header>
          <WalletApprovalPanel requests={requests} />
          <p className="mt-5 text-xs text-zinc-500">Confirmations are permission-checked by the API and posted atomically to the immutable ledger.</p>
        </div>
      </main>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load the operations console.';
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
        <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Fortress Finance</p>
          <h1 className="mt-2 text-2xl font-bold text-zinc-950">Operations access required</h1>
          <p className="mt-3 text-sm text-zinc-600">{message}. Sign in with an active ADMIN or COMPLIANCE account before using wallet approvals.</p>
        </div>
      </main>
    );
  }
}
