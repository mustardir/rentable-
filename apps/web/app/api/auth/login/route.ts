import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
const ACCESS_COOKIE = "fortress_access_token";
const REFRESH_COOKIE = "fortress_refresh_token";

export async function POST(req: NextRequest) {
  if (!API_URL) {
    return NextResponse.json({ success: false, message: "Authentication service is not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return NextResponse.json({ success: false, message: "Email and password are required" }, { status: 400 });
    }

    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.accessToken || !data?.refreshToken) {
      return NextResponse.json(
        { success: false, message: response.ok ? "Login failed" : data?.message ?? "Invalid credentials" },
        { status: response.ok ? 502 : response.status },
      );
    }

    const result = NextResponse.json({ success: true, user: data.user });
    const secure = process.env.NODE_ENV === "production";
    const baseCookie = { httpOnly: true, secure, sameSite: "lax" as const, path: "/" };

    result.cookies.set(ACCESS_COOKIE, data.accessToken, { ...baseCookie, maxAge: 15 * 60 });
    result.cookies.set(REFRESH_COOKIE, data.refreshToken, { ...baseCookie, maxAge: 30 * 24 * 60 * 60 });

    return result;
  } catch {
    return NextResponse.json({ success: false, message: "Login failed" }, { status: 500 });
  }
}
