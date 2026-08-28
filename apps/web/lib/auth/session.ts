import { cookies } from "next/headers";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ACCESS_COOKIE = "fortress_access_token";

export interface AuthSession {
  id: string;
  email: string;
  role: string;
}

export async function getServerSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as AuthSession;
  } catch {
    return null;
  }
}

export { ACCESS_COOKIE };
