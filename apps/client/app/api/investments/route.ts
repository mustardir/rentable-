import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3001";

export async function POST(request: NextRequest) {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

  try {
    const body = await request.json();
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const amountMinor = typeof body.amountMinor === "string" ? body.amountMinor : "";
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    const reference = typeof body.reference === "string" && body.reference.trim() ? body.reference.trim() : undefined;

    if (!productId || !/^[0-9]+$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json({ message: "Invalid investment details" }, { status: 400 });
    }

    const idempotencyKey = crypto.randomUUID();
    const createResponse = await fetch(`${API_URL}/investor/investments/subscriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ productId, amountMinor, currency, idempotencyKey, ...(reference ? { reference } : {}) }),
      cache: "no-store",
    });
    const created = await createResponse.json().catch(() => null);
    if (createResponse.status === 401) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    if (!createResponse.ok || !created?.id) {
      return NextResponse.json({ message: created?.message ?? "Unable to create the investment" }, { status: createResponse.status || 502 });
    }

    const fundResponse = await fetch(`${API_URL}/investor/investments/subscriptions/${encodeURIComponent(created.id)}/fund`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const funded = await fundResponse.json().catch(() => null);
    if (fundResponse.status === 401) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    if (!fundResponse.ok) {
      return NextResponse.json({ message: funded?.message ?? "Investment created but could not be funded" }, { status: fundResponse.status || 502 });
    }
    return NextResponse.json({ success: true, investment: funded });
  } catch {
    return NextResponse.json({ message: "Investment service is unavailable" }, { status: 502 });
  }
}
