import { default as handler } from "./.open-next/worker.js";

/** Add Cloudflare Cron support while keeping OpenNext's generated fetch path. */
const worker = {
  fetch: handler.fetch,

  async scheduled(event, env, ctx) {
    const cronSecret = Reflect.get(env, "CRON_SECRET");
    if (typeof cronSecret !== "string" || cronSecret.length < 32) {
      console.error(
        JSON.stringify({
          event: "jobs_cron_failed",
          reason: "CRON_SECRET is not configured",
        }),
      );
      return;
    }

    const request = new Request("https://repairpilot.internal/api/cron", {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const response = await handler.fetch(request, env, ctx);

    if (!response.ok) {
      console.error(
        JSON.stringify({
          event: "jobs_cron_failed",
          cron: event.cron,
          status: response.status,
        }),
      );
      return;
    }

    await response.body?.cancel();
    console.log(
      JSON.stringify({ event: "jobs_cron_completed", cron: event.cron }),
    );
  },
};

export default worker;

// The re-export keeps OpenNext's Durable Object cache handlers available.
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
