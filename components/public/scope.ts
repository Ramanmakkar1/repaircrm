import { manrope } from "@/components/landing/fonts";
import "./public-site.css";

/**
 * The class names that switch a subtree to the public look (the landing page's
 * Manrope type, blue pill buttons, light palette). No hooks and nothing
 * server-only, so client screens such as the check-in desk can use it too.
 */
export const PUBLIC_SCOPE = `${manrope.className} ${manrope.variable} rf-landing public-site`;
