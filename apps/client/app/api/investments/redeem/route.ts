import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

export async function POST(request: NextRequest) {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) {
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const subscriptionId =
      typeof body.subscriptionId === "string" ? body.subscriptionId.trim() : "";

    if (!subscriptionId) {
      return NextResponse.json(
        { message: "Investment subscription is required" },
        { status: 400 },
      );
    }

    const idempotencyKey = crypto.randomUUID();
    const response = await fetch(
      `${API_URL}/investor/investments/subscriptions/${encodeURIComponent(subscriptionId)}/redeem`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ idempotencyKey }),
        cache: "no-store",
      },
    );

    const data = await response.json().catch(() => null);

    if (response.status === 401) {
      return NextResponse.json(
        { message: "Authentication required" },
        { status: 401 },
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { message: data?.message ?? "Unable to redeem the investment" },
        { status: response.status || 502 },
      );
    }

    return NextResponse.json({ success: true, investment: data });
  } catch {
    return NextResponse.json(
      { message: "Investment service is unavailable" },
      { status: 502 },
    );
  }
}
