
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

  it("detects a global sequence gap", async () => {
    const store = new AuditStore();
    await store.append({
      eventType: "deposit.received",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { amount: 100 },
    });
    await store.append({
      eventType: "deposit.reversed",
      entityType: "JournalEntry",
      entityId: "entry_1",
      payload: { amount: 100 },
    });
    expect(store.verify()).toBe(true);
  });
