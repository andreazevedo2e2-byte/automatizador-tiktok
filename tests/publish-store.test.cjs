const { createPublishStore, normalizePostStatus } = require("../server/lib/publish-store.cjs");

describe("publish store", () => {
  it("normalizes unknown statuses to draft", () => {
    expect(normalizePostStatus("published")).toBe("published");
    expect(normalizePostStatus("whatever")).toBe("draft");
  });

  it("uses local memory when Supabase is not configured", async () => {
    const store = createPublishStore();
    await store.upsertRun({ runId: "run-1", sourceUrl: "https://tiktok.test", stage: "preview" });
    await store.saveDestinations("run-1", [
      { accountId: "tt-1", accountName: "One", accountHandle: "one", scheduledAt: "2026-05-01T18:00:00.000Z" },
    ]);
    await store.recordEvent({ runId: "run-1", type: "queued", message: "Sent" });
    await store.updateDestination("run-1", "tt-1", { status: "sent_to_postiz", postizPostId: "post-1" });

    const history = await store.listHistory();

    expect(history).toHaveLength(1);
    expect(history[0].destinations[0]).toMatchObject({
      accountId: "tt-1",
      status: "sent_to_postiz",
      postizPostId: "post-1",
    });
    expect(history[0].events[0].type).toBe("queued");
  });

  it("sends run and destination writes to Supabase REST when configured", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => "[]" }));
    const store = createPublishStore({
      supabaseUrl: "https://supabase.test",
      serviceRoleKey: "secret",
      fetchImpl,
    });

    await store.upsertRun({ runId: "run-1", sourceUrl: "local", stage: "preview" });
    await store.saveDestinations("run-1", [{ accountId: "tt-1", accountName: "One", accountHandle: "one" }]);

    expect(fetchImpl.mock.calls[0][0]).toContain("/rest/v1/post_runs");
    expect(fetchImpl.mock.calls[1][0]).toContain("/rest/v1/post_destinations");
    expect(fetchImpl.mock.calls[1][1].method).toBe("POST");
  });

  it("falls back to local memory if Supabase tables are not ready", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      text: async () => "table not found",
      json: async () => ({ message: "table not found" }),
    }));
    const store = createPublishStore({
      supabaseUrl: "https://supabase.test",
      serviceRoleKey: "secret",
      fetchImpl,
    });

    await store.upsertRun({ runId: "run-1", sourceUrl: "local", stage: "preview" });
    await store.saveDestinations("run-1", [{ accountId: "tt-1", accountName: "One" }]);

    const history = await store.listHistory();
    expect(history[0].runId).toBe("run-1");
    expect(history[0].destinations[0].accountId).toBe("tt-1");
  });
});
