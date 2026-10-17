import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type WalletRequest = {
  id: string;
  type: "DEPOSIT" | "WITHDRAWAL";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "REVERSED" | "CANCELLED";
  amountKobo: string;
  currency: string;
  reference: string;
  idempotencyKey: string;
  journalEntryId?: string | null;
  completedAt?: string | null;
};

async function walletRequest(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) return null;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string | string[] } | null;
    const message = Array.isArray(body?.message) ? body?.message.join(", ") : body?.message;
    throw new Error(message || `Wallet request failed (${response.status})`);
  }

  return response.json();
}

export async function createDeposit(amountKobo: string) {
  return walletRequest("/wallet/deposits", {
    method: "POST",
    body: JSON.stringify({ amountKobo, currency: "NGN", idempotencyKey: crypto.randomUUID() }),
  });
}

export async function createWithdrawal(amountKobo: string) {
  return walletRequest("/wallet/withdrawals", {
    method: "POST",
    body: JSON.stringify({ amountKobo, currency: "NGN", idempotencyKey: crypto.randomUUID() }),
  });
}

export async function getWalletRequests(limit = 20): Promise<WalletRequest[]> {
  const result = await walletRequest(`/wallet/requests?limit=${Math.min(100, Math.max(1, Math.trunc(limit)))}`);
  return Array.isArray(result) ? result : [];
}
