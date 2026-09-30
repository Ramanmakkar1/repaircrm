/** Every entry point opens the one persistent shop conversation. */
export const OPEN_SHOP_ASSISTANT = "repairs-helper:assistant-open";

export type OpenShopAssistantDetail = {
  voice?: boolean;
  /** Prefills the composer; users can review before sending. */
  prompt?: string;
};
