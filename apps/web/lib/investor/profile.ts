import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ACCESS_COOKIE = "fortress_access_token";

export interface InvestorProfile {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  profile: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    country: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export async function getInvestorProfile(): Promise<InvestorProfile | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/investor/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as InvestorProfile;
  } catch {
    return null;
  }
}
