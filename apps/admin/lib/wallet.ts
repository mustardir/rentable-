import { cookies } from 'next/headers';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const ACCESS_COOKIE = 'fortress_access_token';

export interface WalletRequest {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  status: string;
  amountKobo: string;
  currency: string;
  reference: string;
  idempotencyKey: string;
  journalEntryId: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
}

async function request(path: string, init?: RequestInit) {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) throw new Error('Admin session required');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error((await response.text()) || `Wallet API request failed (${response.status})`);
  return response.json();
}

export async function getPendingWalletRequests(limit = 50): Promise<WalletRequest[]> {
  return request(`/wallet/admin/requests?limit=${limit}`);
}

export async function confirmWalletRequest(id: string) {
  return request(`/wallet/transactions/${id}/confirm`, { method: 'POST' });
}
