export type AutomaticPhotoAttribution = {
  title: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  changes?: string;
};

export type AutomaticPhotoStatus = "ready" | "no_match" | "pending" | "unavailable" | "skipped";

export type AutomaticPhotoResult = {
  ok: true;
  status: AutomaticPhotoStatus;
  imageUrl: string | null;
  attribution: AutomaticPhotoAttribution | null;
  /** Client may retry after this instant, never on every render. */
  retryAt?: string;
};
