/**
 * TypeSafe's Jev — a "System One" model that answers typed questions (pick one
 * option, yes/no, a level) with probabilities, instead of generating text.
 *
 *   TYPESAFE_API_KEY    turns it on (server-side only, never sent to a browser)
 *   TYPESAFE_MODEL      default "jev-latest"
 *   TYPESAFE_API_BASE   default "https://api.typesafe.ai" (tests point it at a fake)
 *   ASSISTANT_ROUTER    "off" keeps the key but stops the assistant using Jev
 *
 * Plain `fetch`, no SDK, like every other provider in this app: the SDK needs
 * Node 20 APIs, and this code also runs on Cloudflare Workers.
 *
 * Never throws: a Jev outage must degrade the assistant to its generative path,
 * not break it. Callers get `{ ok: false }` and decide.
 */

export type JevQuestion =
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "noul"; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
  | { type: "score"; instructions: unknown; criteria: unknown[] };

export type JevChoice = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevNoul = { type: "noul"; noul: number };
export type JevAnswer = JevChoice | JevNoul | { type: "score"; score: number; confidence: number };

export type JevResult =
  | { ok: true; answers: Record<string, JevAnswer> }
  | { ok: false; reason: string };

const TIMEOUT_MS = 8_000;

export function jevConfigured(): boolean {
  return (
    Boolean(process.env.TYPESAFE_API_KEY?.trim()) &&
    process.env.ASSISTANT_ROUTER?.trim().toLowerCase() !== "off"
  );
}

function base(): string {
  return (process.env.TYPESAFE_API_BASE?.trim() || "https://api.typesafe.ai").replace(/\/+$/, "");
}

export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
): Promise<JevResult> {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (!key) return { ok: false, reason: "TYPESAFE_API_KEY is not set" };

  try {
    const response = await fetch(`${base()}/v1/systemone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.TYPESAFE_MODEL?.trim() || "jev-latest",
        state,
        questions,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, reason: `typesafe ${response.status} ${detail.slice(0, 160)}` };
    }
    const body = (await response.json()) as { answers?: Record<string, JevAnswer> };
    if (!body?.answers || typeof body.answers !== "object") {
      return { ok: false, reason: "typesafe returned no answers" };
    }
    return { ok: true, answers: body.answers };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "typesafe request failed" };
  }
}
