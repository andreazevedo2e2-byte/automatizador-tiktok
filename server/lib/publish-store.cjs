const allowedStatuses = new Set([
  "draft",
  "sent_to_postiz",
  "scheduled",
  "waiting_manual_publish",
  "published",
  "failed",
]);

function normalizePostStatus(status) {
  return allowedStatuses.has(status) ? status : "draft";
}

function normalizeDestination(runId, destination = {}) {
  return {
    runId,
    accountId: String(destination.accountId || destination.id || "").trim(),
    accountName: String(destination.accountName || destination.name || "").trim(),
    accountHandle: String(destination.accountHandle || destination.handle || "").trim(),
    scheduledAt: destination.scheduledAt || null,
    status: normalizePostStatus(destination.status),
    postizPostId: destination.postizPostId || null,
    postizResponse: destination.postizResponse || null,
    error: destination.error || null,
    updatedAt: new Date().toISOString(),
  };
}

function createMemoryStore() {
  const runs = new Map();
  const destinationMap = new Map();
  const eventMap = new Map();

  return {
    async upsertRun(run) {
      const existing = runs.get(run.runId) || {};
      runs.set(run.runId, { ...existing, ...run, updatedAt: new Date().toISOString() });
    },
    async saveDestinations(runId, destinations = []) {
      const normalized = destinations.map((destination) => normalizeDestination(runId, destination));
      destinationMap.set(runId, normalized);
      return normalized;
    },
    async updateDestination(runId, accountId, patch = {}) {
      const current = destinationMap.get(runId) || [];
      const next = current.map((destination) =>
        destination.accountId === accountId
          ? {
              ...destination,
              ...patch,
              status: normalizePostStatus(patch.status || destination.status),
              updatedAt: new Date().toISOString(),
            }
          : destination
      );
      destinationMap.set(runId, next);
      return next.find((destination) => destination.accountId === accountId) || null;
    },
    async recordEvent(event) {
      const runEvents = eventMap.get(event.runId) || [];
      const nextEvent = {
        id: `${event.runId}-${runEvents.length + 1}`,
        createdAt: new Date().toISOString(),
        ...event,
      };
      runEvents.push(nextEvent);
      eventMap.set(event.runId, runEvents);
      return nextEvent;
    },
    async listHistory() {
      return Array.from(runs.values())
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
        .map((run) => ({
          ...run,
          destinations: destinationMap.get(run.runId) || [],
          events: eventMap.get(run.runId) || [],
        }));
    },
  };
}

function createSupabaseRestStore({ supabaseUrl, serviceRoleKey, fetchImpl = fetch }) {
  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=representation",
  };

  async function request(path, options = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    if (!response.ok) {
      throw new Error(`Supabase request failed ${response.status}: ${await response.text()}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  return {
    async upsertRun(run) {
      await request("/rest/v1/post_runs?on_conflict=run_id", {
        method: "POST",
        body: JSON.stringify([
          {
            run_id: run.runId,
            source_url: run.sourceUrl || "",
            stage: run.stage || "",
            caption_english: run.captionEnglish || "",
            caption_portuguese: run.captionPortuguese || "",
            hashtags: run.hashtags || [],
            provider: run.provider || "",
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    },
    async saveDestinations(runId, destinations = []) {
      const normalized = destinations.map((destination) => normalizeDestination(runId, destination));
      if (!normalized.length) return [];
      await request("/rest/v1/post_destinations?on_conflict=run_id,account_id", {
        method: "POST",
        body: JSON.stringify(
          normalized.map((destination) => ({
            run_id: destination.runId,
            account_id: destination.accountId,
            account_name: destination.accountName,
            account_handle: destination.accountHandle,
            scheduled_at: destination.scheduledAt,
            status: destination.status,
            postiz_post_id: destination.postizPostId,
            postiz_response: destination.postizResponse,
            error: destination.error,
            updated_at: destination.updatedAt,
          }))
        ),
      });
      return normalized;
    },
    async updateDestination(runId, accountId, patch = {}) {
      const normalizedPatch = {
        status: normalizePostStatus(patch.status),
        postiz_post_id: patch.postizPostId || null,
        postiz_response: patch.postizResponse || null,
        error: patch.error || null,
        updated_at: new Date().toISOString(),
      };
      const [updated] = await request(
        `/rest/v1/post_destinations?run_id=eq.${encodeURIComponent(runId)}&account_id=eq.${encodeURIComponent(accountId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(normalizedPatch),
        }
      );
      return updated || null;
    },
    async recordEvent(event) {
      const [created] = await request("/rest/v1/post_events", {
        method: "POST",
        body: JSON.stringify([
          {
            run_id: event.runId,
            account_id: event.accountId || null,
            type: event.type || "event",
            message: event.message || "",
            details: event.details || {},
          },
        ]),
      });
      return created || null;
    },
    async listHistory() {
      return request(
        "/rest/v1/post_runs?select=*,post_destinations(*),post_events(*)&order=updated_at.desc&limit=100",
        { method: "GET", headers: { Prefer: "return=representation" } }
      );
    },
  };
}

function createPublishStore(config = {}) {
  if (config.disableSupabase) return createMemoryStore();
  const supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL || "";
  const serviceRoleKey = config.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (supabaseUrl && serviceRoleKey) {
    const primary = createSupabaseRestStore({ supabaseUrl, serviceRoleKey, fetchImpl: config.fetchImpl || fetch });
    const fallback = createMemoryStore();

    async function withFallback(method, args) {
      try {
        return await primary[method](...args);
      } catch (error) {
        console.warn(`[publish-store] Supabase unavailable for ${method}; using local fallback.`, error.message);
        return fallback[method](...args);
      }
    }

    return {
      upsertRun: (...args) => withFallback("upsertRun", args),
      saveDestinations: (...args) => withFallback("saveDestinations", args),
      updateDestination: (...args) => withFallback("updateDestination", args),
      recordEvent: (...args) => withFallback("recordEvent", args),
      listHistory: (...args) => withFallback("listHistory", args),
    };
  }
  return createMemoryStore();
}

module.exports = {
  createPublishStore,
  normalizeDestination,
  normalizePostStatus,
};
