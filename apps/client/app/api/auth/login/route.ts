import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
export async function POST(request: NextRequest) {
  if (!API_URL) return NextResponse.json({ message: "Authentication service is not configured" }, { status: 500 });
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ message: "Email and password are required" }, { status: 400 });
    const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }), cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.accessToken || !data?.refreshToken) return NextResponse.json({ message: data?.message ?? "Invalid credentials" }, { status: response.ok ? 502 : response.status });
    const result = NextResponse.json({ success: true, user: data.user });
    const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
    result.cookies.set("fortress_access_token", data.accessToken, { ...cookie, maxAge: 15 * 60 });
    result.cookies.set("fortress_refresh_token", data.refreshToken, { ...cookie, maxAge: 30 * 24 * 60 * 60 });
    return result;
  } catch { return NextResponse.json({ message: "Authentication service is unavailable" }, { status: 502 }); }
}
