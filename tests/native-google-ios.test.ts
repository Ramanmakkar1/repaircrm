import { describe, expect, it } from "vitest";

import { isIosAppUserAgent } from "@/lib/native-app";
import config from "../mobile/capacitor.config.json";

const IPHONE_WEBVIEW = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const IPAD_WEBVIEW = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

describe("Apple 4.8: no Google button inside the iOS app", () => {
  it("recognises the iOS shell from the user agent it appends, iPad included", () => {
    const suffix = config.ios.appendUserAgent;
    expect(isIosAppUserAgent(`${IPHONE_WEBVIEW} ${suffix}`)).toBe(true);
    expect(isIosAppUserAgent(`${IPAD_WEBVIEW} ${suffix}`)).toBe(true);
  });

  it("leaves Android, Safari and desktop browsers alone", () => {
    expect(isIosAppUserAgent(`Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile ${config.android.appendUserAgent}`)).toBe(false);
    expect(isIosAppUserAgent(`${IPHONE_WEBVIEW} Version/18.0 Safari/604.1`)).toBe(false);
    expect(isIosAppUserAgent(null)).toBe(false);
  });
});
