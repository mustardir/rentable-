'use server';

import { revalidatePath } from 'next/cache';
import { confirmWalletRequest } from '../lib/wallet';

export async function approveWalletRequest(id: string) {
  try {
    await confirmWalletRequest(id);
    revalidatePath('/');
    return { ok: true, message: 'Wallet request confirmed and posted to the ledger.' };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unable to confirm wallet request.' };
  }
}
