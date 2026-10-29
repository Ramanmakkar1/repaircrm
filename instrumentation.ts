/** Next compiles instrumentation for both runtimes. Keep Node-only dependencies
 * behind the runtime-specific dynamic import, including the job timer. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runtimeKnowsAlbertaPermanentTime } = await import("@/lib/dashboard/zone");
    if (!runtimeKnowsAlbertaPermanentTime()) {
      console.error(
        `[timezone] Node ${process.version} has tzdata ${process.versions.tz ?? "unknown"}, which predates Alberta's permanent UTC-6 (tzdata 2026c). Shop times in America/Edmonton will be an hour off after 2026-11-01. Run Node 22.23.3 or newer (.nvmrc).`,
      );
    }
    const { startAutomation } = await import("@/lib/jobs/timer");
    await startAutomation();
  }
}
