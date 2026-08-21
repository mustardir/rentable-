import { describe, expect, it } from "vitest";

import { AuditStore, computeAuditHash } from "../src";

describe("AuditStore", () => {
  it("creates a globally ordered, hash-chained event stream", async () => {
    const store = new AuditStore();

    const first = await store.append({
      eventType: "kyc.submitted",
      entityType: "InvestorProfile",
      entityId: "investor_1",
      payload: { status: "IN_REVIEW", actor: { role: "USER", id: "user_1" } },
    });
    const second = await store.append({
      eventType: "kyc.approved",
      entityType: "InvestorProfile",
      entityId: "investor_1",
      payload: { status: "APPROVED" },
    });

    expect(first.sequence).toBe(1n);
    expect(second.sequence).toBe(2n);
    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);
    expect(store.verify()).toEqual({ valid: true });
  });

  it("chains each entity independently while retaining global ordering", async () => {
    const store = new AuditStore();

    const investorA = await store.append({
      eventType: "wallet.created",
      entityType: "InvestorProfile",
      entityId: "A",
      payload: { wallet: "w_a" },
    });
    const investorB = await store.append({
      eventType: "wallet.created",
      entityType: "InvestorProfile",
      entityId: "B",
      payload: { wallet: "w_b" },
    });
    const investorANext = await store.append({
      eventType: "wallet.updated",
      entityType: "InvestorProfile",
      entityId: "A",
      payload: { wallet: "w_a2" },
    });

    expect(investorA.sequence).toBe(1n);
    expect(investorB.sequence).toBe(2n);
    expect(investorANext.sequence).toBe(3n);
    expect(investorB.previousHash).toBeNull();
    expect(investorANext.previousHash).toBe(investorA.hash);
    expect(store.verify()).toEqual({ valid: true });
  });

  it("canonicalizes object key order before hashing", () => {
    const base = {
      sequence: 1n,
      eventType: "test.event",
      entityType: "Account",
      entityId: "acct_1",
      previousHash: null,
    } as const;

    const left = computeAuditHash({ ...base, payload: { b: 2, a: 1 } });
    const right = computeAuditHash({ ...base, payload: { a: 1, b: 2 } });

    expect(left).toBe(right);
  });

  it("returns all events and filters events by entity", async () => {
    const store = new AuditStore();

    await store.append({
      eventType: "wallet.created",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { balanceKobo: 0 },
    });
    await store.append({
      eventType: "wallet.updated",
      entityType: "Wallet",
      entityId: "wallet_2",
      payload: { balanceKobo: 5_000 },
    });
    await store.append({
      eventType: "wallet.funded",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { amountKobo: 10_000 },
    });

    expect(store.all()).toHaveLength(3);
    expect(store.forEntity("Wallet", "wallet_1")).toHaveLength(2);
    expect(store.forEntity("Wallet", "missing")).toEqual([]);
  });

  it("protects stored snapshots from caller mutation", async () => {
    const store = new AuditStore();
    await store.append({
      eventType: "profile.updated",
      entityType: "InvestorProfile",
      entityId: "investor_1",
      payload: { profile: { status: "ACTIVE" } },
    });

    const events = store.all() as Array<{ payload: { profile: { status: string } } }>;
    events[0]!.payload.profile.status = "TAMPERED";

    expect(store.all()[0]!.payload).toEqual({ profile: { status: "ACTIVE" } });
  });

  it("detects a global sequence gap", async () => {
    const store = new AuditStore();
    await store.append({
      eventType: "deposit.received",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { amountKobo: 100_000 },
    });
    const second = await store.append({
      eventType: "deposit.confirmed",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { status: "POSTED" },
    });

    const internal = store as unknown as { events: Array<typeof second> };
    internal.events[1] = { ...second, sequence: 3n };

    expect(store.verify()).toMatchObject({ valid: false, reason: "SEQUENCE_GAP", eventId: second.id });
  });

  it("detects a per-entity previous hash mismatch", async () => {
    const store = new AuditStore();
    const first = await store.append({
      eventType: "wallet.created",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { balanceKobo: 0 },
    });
    const second = await store.append({
      eventType: "wallet.funded",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { amountKobo: 10_000 },
    });

    const internal = store as unknown as { events: Array<typeof second> };
    internal.events[1] = { ...second, previousHash: "wrong-previous-hash" };

    expect(first.hash).not.toBe("wrong-previous-hash");
    expect(store.verify()).toMatchObject({ valid: false, reason: "PREVIOUS_HASH_MISMATCH", eventId: second.id });
  });

  it("detects tampering in the hash chain", async () => {
    const store = new AuditStore();
    await store.append({
      eventType: "deposit.received",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { amountKobo: 100_000 },
    });
    const second = await store.append({
      eventType: "deposit.confirmed",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { status: "POSTED" },
    });

    const internal = store as unknown as { events: Array<typeof second> };
    internal.events[1] = { ...second, hash: "tampered" };

    expect(store.verify()).toMatchObject({ valid: false, reason: "HASH_MISMATCH" });
  });

  it("rejects events without material identity fields", async () => {
    const store = new AuditStore();

    await expect(
      store.append({
        eventType: "",
        entityType: "InvestorProfile",
        entityId: "investor_1",
        payload: {},
      }),
    ).rejects.toThrow("INVALID_AUDIT_EVENT");
  });
});
