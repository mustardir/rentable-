import { describe, expect, it } from "vitest";

import { AuditStore, computeAuditHash } from "../src";
import type { AuditEvent } from "../src/types";

function internalEvents(store: AuditStore): AuditEvent[] {
  return (store as unknown as { events: AuditEvent[] }).events;
}

describe("AuditStore", () => {
  it("appends immutable, sequential, hash-chained events", async () => {
    const store = new AuditStore();

    const first = await store.append({
      eventType: "wallet.created",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { currency: "NGN", balance: 0 },
    });
    const second = await store.append({
      eventType: "wallet.updated",
      entityType: "Wallet",
      entityId: "wallet_1",
      payload: { balance: 100 },
    });
    const other = await store.append({
      eventType: "profile.updated",
      entityType: "InvestorProfile",
      entityId: "investor_1",
      payload: { status: "ACTIVE" },
    });

    expect(first.sequence).toBe(1n);
    expect(second.sequence).toBe(2n);
    expect(other.sequence).toBe(3n);
    expect(first.previousHash).toBeNull();
    expect(second.previousHash).toBe(first.hash);
    expect(other.previousHash).toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.payload)).toBe(true);
    expect(store.verify()).toEqual({ valid: true });
  });

  it("returns all events and filters by entity", async () => {
    const store = new AuditStore();
    await store.append({ eventType: "wallet.created", entityType: "Wallet", entityId: "wallet_1", payload: { currency: "NGN" } });
    await store.append({ eventType: "wallet.updated", entityType: "Wallet", entityId: "wallet_1", payload: { status: "ACTIVE" } });
    await store.append({ eventType: "wallet.created", entityType: "Wallet", entityId: "wallet_2", payload: { currency: "USD" } });

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

    const events = store.all() as unknown as Array<{ payload: { profile: { status: string } } }>;
    events[0]!.payload.profile.status = "TAMPERED";

    expect(store.all()[0]!.payload).toEqual({ profile: { status: "ACTIVE" } });
  });

  it("rejects invalid event input", async () => {
    const store = new AuditStore();

    await expect(
      store.append({ eventType: "", entityType: "Wallet", entityId: "wallet_1", payload: {} }),
    ).rejects.toThrow("INVALID_AUDIT_EVENT");
  });

  it("detects a global sequence gap", async () => {
    const store = new AuditStore();
    await store.append({ eventType: "deposit.received", entityType: "JournalEntry", entityId: "entry_1", payload: { amount: 100 } });
    await store.append({ eventType: "deposit.reversed", entityType: "JournalEntry", entityId: "entry_1", payload: { amount: 100 } });

    const events = internalEvents(store);
    const target = events[1]!;
    events[1] = { ...target, sequence: 3n };

    expect(store.verify()).toEqual({ valid: false, reason: "SEQUENCE_GAP", eventId: target.id });
  });

  it("detects a previous-hash mismatch", async () => {
    const store = new AuditStore();
    await store.append({ eventType: "wallet.created", entityType: "Wallet", entityId: "wallet_1", payload: {} });
    await store.append({ eventType: "wallet.updated", entityType: "Wallet", entityId: "wallet_1", payload: {} });

    const events = internalEvents(store);
    const target = events[1]!;
    events[1] = { ...target, previousHash: "broken" };

    expect(store.verify()).toEqual({ valid: false, reason: "PREVIOUS_HASH_MISMATCH", eventId: target.id });
  });

  it("detects event hash tampering", async () => {
    const store = new AuditStore();
    await store.append({ eventType: "wallet.created", entityType: "Wallet", entityId: "wallet_1", payload: { currency: "NGN" } });

    const events = internalEvents(store);
    const target = events[0]!;
    events[0] = { ...target, hash: "tampered" };

    expect(store.verify()).toEqual({ valid: false, reason: "HASH_MISMATCH", eventId: target.id });
  });

  it("recomputes the expected hash from the event fields", async () => {
    const store = new AuditStore();
    const event = await store.append({
      eventType: "transfer.posted",
      entityType: "Transaction",
      entityId: "txn_1",
      actorUserId: "user_1",
      actorRole: "ADMIN",
      payload: { amount: 125000, metadata: { b: 2, a: 1 } },
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
    });

    expect(event.hash).toBe(computeAuditHash(event));
    expect(store.verify()).toEqual({ valid: true });
  });
});
