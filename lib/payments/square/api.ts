import { SQUARE_API_VERSION, squareApiBase } from "./config";

export class SquareApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Square HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "SquareApiError";
  }
}

export async function squareRequest<T>(input: {
  path: string;
  accessToken: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
}): Promise<T> {
  const response = await fetch(`${squareApiBase()}${input.path}`, {
    method: input.method ?? "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Square-Version": SQUARE_API_VERSION,
      Accept: "application/json",
      ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new SquareApiError(response.status, text);
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new SquareApiError(response.status, "Square returned invalid JSON.");
  }
}
