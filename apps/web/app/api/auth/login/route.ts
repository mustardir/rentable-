import { NextResponse } from "next/server";

const API_BASE_URL = process.env.FORTRESS_API_URL ?? process.env.NEXT_PUBLIC_API_URL;

export async function POST(request: Request) {
  if (!API_BASE_URL) {
    return NextResponse.json(
      { success: false, message: "Authentication service is not configured" },
      { status: 503 },
    );
  }

  const body = await request.json();
  const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({
    success: false,
    message: "Authentication request failed",
  }));

  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const result = NextResponse.json({ success: true, user: data.user });
  const secure = process.env.NODE_ENV === "production";

  result.cookies.set("fortress_access_token", data.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  result.cookies.set("fortress_refresh_token", data.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return result;
}
