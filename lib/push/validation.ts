export function validPushEndpoint(value: string): boolean {
 try {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password && !url.port && (
   host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host === "web.push.apple.com" || host.endsWith(".notify.windows.com")
  );
 } catch {return false;}
}
export function increasedCounts(current: Record<string, number>, previous: unknown): boolean {
 const before = previous && typeof previous === "object" && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
 return Object.entries(current).some(([key, value]) => value > (typeof before[key] === "number" ? before[key] as number : 0));
}
