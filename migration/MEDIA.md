# Aurora — Media & Asset Inventory

## How uploads work today

1. UI calls `api.media.upload(file)` (`src/api/aurora.js`).
2. Adapter calls Base44 `integrations.Core.UploadFile({ file })`.
3. Base44 stores the file in **public** storage and returns `{ file_url }` on
   `https://media.base44.com/images/public/<appId>/<hash>_<name>`.
4. The URL string is stored in the entity record. No file ids, sizes, or mime types are kept.

There is no deletion of uploaded files (removing an image from a product only removes the URL).
There are no size/type limits beyond the `accept="image/*"` input attribute.

## Where uploads are triggered

| Feature | Component | Stored in | Who uploads | Cap |
|---|---|---|---|---|
| Product images | `src/components/admin/product/ImagesTab.jsx` | `Product.images[].url` | Admin | none |
| Bespoke reference images | `src/pages/Bespoke.jsx` | `BespokeRequest.reference_images[]` | Anonymous customer | 5 |
| Special-request reference images | `src/components/product/SpecialRequestDrawer.jsx` | cart line → `Order.items[].special_request.images[]` | Anonymous customer | `Product.special_request.max_images` (default 3) |

## Every field that contains an image URL

| Entity | Field | Source today |
|---|---|---|
| Product | `images[].url` | Unsplash (seed) or Base44 upload |
| Product | `seo.og_image` | empty in all records; admin text field |
| Category | `image` | Unsplash (seed); no admin UI |
| Collection | `hero_image` | Unsplash (seed); no admin UI |
| BespokeRequest | `reference_images[]` | Base44 upload |
| Order | `items[].image` | Copied from product featured image at add-to-cart |
| Order | `items[].special_request.images[]` | Base44 upload |

## Static branding assets (hard-coded)

| Asset | URL | Used in |
|---|---|---|
| Logo | `https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/5aceb367c_aurora.png` | `src/config/brand.js` → Header, Footer, Hero; `index.html` favicon |
| Hero background | `https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/ff194d237_generated_image.png` | `src/config/brand.js` → Hero |
| Bespoke section image | `https://media.base44.com/images/public/6a96ec0b8baf3855e79b34f6/85e389944_generated_image.png` | `src/config/brand.js` → BespokeSection |

Testimonials / BrandStory contain no images. Category and collection seed images are Unsplash
hotlinks (`images.unsplash.com/...?w=900&q=80`) — they will keep working but are not owned assets.

## The `Image` component

`src/components/ui/image.jsx` (+ `image-helpers.js`) is a Base44/Wix media-aware `<img>`
wrapper: for `media.base44.com` and `static.wixstatic.com` URLs it requests server-side
resized WebP variants with `srcset`, a blurred placeholder and a fallback image. **Any other
host renders as a normal `<img>`**, so re-hosted assets will simply work without optimisation.
Decide whether to keep it, replace with a plain `<img>`, or adapt the URL builder to your CDN.

## Migration checklist (do NOT do this before the new backend exists)

1. Run the data export (`EXPORT.md`) and collect every URL matching `^https://media\.base44\.com/`
   from the fields above plus the three branding constants.
2. Download each file while the Base44 app is still live (URLs are public, no auth needed).
3. Upload to R2 (or equivalent) under a stable key scheme, e.g. `products/<productId>/<n>.<ext>`.
4. Rewrite the URLs in the exported JSON before importing into D1.
5. Update `src/config/brand.js` and the favicon in `index.html`.
6. Replace `backend.media.upload` with presigned-upload logic; add server-side validation
   (mime type, ≤ 10 MB suggested) and make product uploads admin-only.
7. Optionally migrate Unsplash seed images to owned assets.

At the time of this handover **no records contain `media.base44.com` URLs** — all seeded
catalogue images are Unsplash and there are zero orders / bespoke requests. Only the three
branding assets and favicon need re-hosting unless content is added before migration.