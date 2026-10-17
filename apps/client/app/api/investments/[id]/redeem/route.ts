import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("fortress_access_token")?.value;
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "Investment ID is required." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  if (!idempotencyKey) return NextResponse.json({ message: "Idempotency key is required." }, { status: 400 });
  try {
    const response = await fetch(API_URL + "/investor/investments/subscriptions/" + encodeURIComponent(id) + "/redeem", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey }),
    });
    const data = await response.json().catch(() => null);
    return NextResponse.json(data ?? { message: "Unable to redeem investment." }, { status: response.status });
  } catch {
    return NextResponse.json({ message: "Unable to reach the investment service." }, { status: 502 });
  }
}
