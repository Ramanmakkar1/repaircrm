# Automatic licensed product photos

Uploaded product photos always win, followed by the built-in device/parts library. An unknown catalogue item can request a licensed internet fallback automatically. No AI model or paid search API is called.

## Client contract

`POST /inventory/:productId/photo/automatic` takes no body. It returns:

```ts
{
  ok: true,
  status: "ready" | "no_match" | "pending" | "unavailable" | "skipped",
  imageUrl: string | null,
  attribution: {
    title: string,
    author: string,
    sourceUrl: string,
    license: string,
    licenseUrl: string,
    changes?: string
  } | null,
  retryAt?: string // ISO instant; do not retry before it
}
```

The normal ready URL is `/inventory/:productId/photo/automatic/image`. Render it without Next's public image optimizer because it requires the staff session cookie. The image route rechecks the live account, tenant, current catalogue name, and uploaded/library priority before streaming cached bytes with `private, no-store` and `nosniff`.

Show creator, source, licence, and conversion information with each imported photo. Link the source and licence in the product photo details; avoid interactive links nested inside a POS add-item button. Mark it as an internet photo rather than implying an exact uploaded product photo. A strict model/title check improves relevance, but a name match cannot establish the pictured item's condition, colour, or exact retail variant.

`DELETE` at the same automatic endpoint dismisses an unsuitable internet match and removes its stored bytes. It does not affect uploaded photos. Further automatic searches stay disabled for that catalogue name; renaming the item invalidates the dismissal/cache.

## Sources and eligibility

The implementation uses Wikimedia Commons' fixed MediaWiki endpoint, file namespace 6, and `imageinfo` metadata. See [MediaWiki search](https://www.mediawiki.org/wiki/API:Search), [image metadata](https://www.mediawiki.org/wiki/API:Imageinfo), and [Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

Only explicit CC0 1.0, Public Domain Mark 1.0, CC BY, or CC BY-SA licences with their matching Creative Commons licence URL qualify. Missing authors, unsupported/mismatched licence metadata, additional restrictions, non-raster files, and irrelevant model titles are rejected. Original creator credit and licence are retained after resizing/WebP conversion, including ShareAlike licensing for the converted image. Commons metadata is not a warranty of copyright ownership.

Only a short catalogue name is searched: at most six meaningful tokens and 80 characters. Product descriptions, serial/SKU fields, customers, job notes, and other shop records are never queried or read for this feature. Names containing obvious email addresses, URLs, telephone/long numeric identifiers, or excessive text are refused. Keep customer/contact data out of catalogue names as well.

## Bounded network/storage work

- One search returns at most eight candidates; at most two raster downloads are attempted.
- All requests have an eight-second deadline and reject redirects.
- The search host is fixed to `commons.wikimedia.org`; downloads are restricted to HTTPS `upload.wikimedia.org/wikipedia/commons/` and the official `thumb.wikimedia.org/wikipedia/commons/thumb/` thumbnail namespace. Arbitrary client/upstream URLs, credentials, ports, and other hosts are refused. A trusted thumbnail is preferred over a large original; the original is the bounded fallback if no trusted thumbnail exists.
- JSON is capped at 512 KB and downloaded image bytes at 5 MB, including responses without a content length. JPEG/PNG/WebP MIME and magic bytes must agree.
- Sharp decodes the image with a 16-megapixel input limit, rejects animations/corrupt/tiny rasters, and caches a WebP fitting 768 × 768 pixels. The conversion is recorded in the returned attribution.
- Cached bytes use the existing private upload driver (local/S3/R2); automatic records stay separate from Attachment so imported photos cannot masquerade as uploaded exact photos. The R2 8 GB safety calculation counts both attachments and automatic photos.

## Cache, throttles, and failure behavior

`AutomaticProductPhoto` stores one lookup/cache row per product. A hash of the bounded name invalidates outdated photos after renaming. Ready metadata/bytes are reused across sessions. Misses wait seven days; network/storage failures wait six hours; an unfinished process lease expires after two minutes. Repeated/concurrent requests for the same product share work within a Node process and use a persisted claim across processes.

A short PostgreSQL advisory transaction lock serialises a tenant's lookup claims. At most 20 recently searched product rows per shop qualify in a rolling hour, with a separate process-local limit of 30 lookup attempts per hour and two simultaneous searches per shop. Cached hits do not consume search attempts. These modest limits suit the existing single Node VPS and avoid repeated background provider calls. Client queues should also cap concurrent requests and respect `retryAt`.

Provider/DB/storage failures return the normal placeholder result instead of breaking checkout. Before saving a downloaded image, the service rechecks live account/password state, product ownership, catalogue name, and higher-priority images, and cleans up bytes if saving is cancelled or fails. Replacing/dismissing an automatic photo removes its retired object. Tenant/product deletion cleanup must remove the automatic row's stored object before cascading the database row, as with other private uploads.

Migration: `20260930222000_automatic_product_photos`. No existing attachment rows are changed.
