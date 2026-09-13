import { appUrl } from "@/lib/comms/config";

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

function base(name: string, fallback: string): string {
  return (env(name) ?? fallback).replace(/\/+$/, "");
}

export function squareApplicationId(): string | null {
  return env("SQUARE_APPLICATION_ID");
}

export function squareApplicationSecret(): string | null {
  return env("SQUARE_APPLICATION_SECRET");
}

export function squareWebhookSignatureKey(): string | null {
  return env("SQUARE_WEBHOOK_SIGNATURE_KEY");
}

/** Square is opt-in so uploading credentials cannot enable live payment flows. */
export function squareDriverEnabled(): boolean {
  return env("SQUARE_DRIVER")?.toLowerCase() === "square";
}

export function squareEnvironment(): "sandbox" | "production" {
  return env("SQUARE_ENVIRONMENT")?.toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

export function squareApiBase(): string {
  return base(
    "SQUARE_API_BASE",
    squareEnvironment() === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com",
  );
}

export function squareOAuthBase(): string {
  return base(
    "SQUARE_OAUTH_BASE",
    squareEnvironment() === "production"
      ? "https://connect.squareup.com"
      : "https://connect.squareupsandbox.com",
  );
}

export function squareConfigured(): boolean {
  return squareDriverEnabled() && Boolean(squareApplicationId() && squareApplicationSecret());
}

export function squareWebhookReady(): boolean {
  return squareConfigured() && Boolean(squareWebhookSignatureKey());
}

export function squareRedirectUri(): string {
  return `${appUrl()}/api/payments/square/callback`;
}

export function squareWebhookUrl(): string {
  return `${appUrl()}/api/webhooks/square`;
}

/** Pin requests so a future Square release cannot change response semantics. */
export const SQUARE_API_VERSION = "2026-08-19";

export const SQUARE_OAUTH_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "DEVICE_CREDENTIAL_MANAGEMENT",
  "DEVICES_READ",
] as const;
