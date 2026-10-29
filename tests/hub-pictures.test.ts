import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hubTilePhoto, TOUCH_WORKSPACES, workspaceActions, workspacePhoto } from "@/lib/touch-workspace";
import { OWNER_PANELS } from "@/components/settings/settings-panels";

const root = path.resolve(__dirname, "..");
const exists = (src: string) => fs.existsSync(path.join(root, "public", src));

/** The tile pictures on Home, read from the page source (the tiles are built inline there). */
function homePhotos(): string[] {
  const source = fs.readFileSync(path.join(root, "app/(app)/counter/page.tsx"), "utf8");
  const dirs: Record<string, string> = { PRODUCTS: "/images/products", HOME: "/images/home", CATALOG: "/images/catalog" };
  return [...source.matchAll(/photo: `\$\{(\w+)\}\/([\w-]+\.webp)`/g)].map(([, dir, file]) => `${dirs[dir]}/${file}`);
}

describe("every tile on a hub has its own picture", () => {
  it.each(Object.keys(TOUCH_WORKSPACES))("the %s hub", (key) => {
    const hub = TOUCH_WORKSPACES[key];
    // The owner sees every tile, so this is the fullest version of the hub.
    const photos = workspaceActions(hub, "OWNER").map((action) => hubTilePhoto(action, workspacePhoto(key)));
    expect(new Set(photos).size).toBe(photos.length);
    for (const photo of photos) expect(exists(photo), photo).toBe(true);
  });

  it("Home (all three tabs together)", () => {
    const photos = homePhotos();
    expect(photos.length).toBeGreaterThanOrEqual(18);
    expect(new Set(photos).size).toBe(photos.length);
    for (const photo of photos) expect(exists(photo), photo).toBe(true);
  });

  it("Settings", () => {
    const photos = OWNER_PANELS.map((panel) => panel.photo).filter((photo): photo is string => Boolean(photo));
    expect(new Set(photos).size).toBe(photos.length);
    for (const photo of photos) expect(exists(photo), photo).toBe(true);
  });
});
