"use server";

import { revalidatePath } from "next/cache";
import { createDeposit, createWithdrawal } from "../../lib/investor/wallet";

type ActionState = { ok: boolean; message: string };

function toKobo(value: string): string {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Enter a valid NGN amount");
  const [major, minor = ""] = normalized.split(".");
  const amount = BigInt(major) * 100n + BigInt(minor.padEnd(2, "0"));
  if (amount <= 0n) throw new Error("Amount must be greater than ₦0.00");
  return amount.toString();
}

export async function requestDeposit(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await createDeposit(toKobo(String(formData.get("amount") ?? "")));
    revalidatePath("/dashboard");
    return { ok: true, message: "Deposit request submitted for review." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to submit deposit request" };
  }
}

export async function requestWithdrawal(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await createWithdrawal(toKobo(String(formData.get("amount") ?? "")));
    revalidatePath("/dashboard");
    return { ok: true, message: "Withdrawal request submitted for review." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unable to submit withdrawal request" };
  }
}
