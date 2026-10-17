import { NextResponse } from "next/server";

export async function POST() {
  const result = NextResponse.json({ success: true });
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  result.cookies.set("fortress_access_token", "", { ...cookie, maxAge: 0 });
  result.cookies.set("fortress_refresh_token", "", { ...cookie, maxAge: 0 });
  return result;
}
