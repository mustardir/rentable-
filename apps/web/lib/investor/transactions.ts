import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface InvestorTransaction {
  id: string;
  reference: string;
  description: string;
  currency: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
  direction: "DEBIT" | "CREDIT";
  amountKobo: string;
  postedAt: string;
  metadata: Record<string, string>;
}

export async function getInvestorTransactions(limit = 10): Promise<InvestorTransaction[]> {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) return [];

  const response = await fetch(`${API_URL}/ledger/me/transactions?limit=${limit}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) return [];
  return response.json();
}
