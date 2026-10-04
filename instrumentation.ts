/** Next compiles instrumentation for both runtimes. Keep Node-only dependencies
 * behind the runtime-specific dynamic import, including the job timer. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startAutomation } = await import("@/lib/jobs/timer");
    await startAutomation();
  }
}
