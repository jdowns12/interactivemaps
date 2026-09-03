# Plan: Bug fixes, faster photos, and multi-photo locations

Date: 2026-09-03. Branch: `claude/fixes-multiphoto`. Live service: `interactivemaps.service` on port 8081, public at https://wepmaps.gumdrop.space.

Primary users are on phones at venues. Every change must look right at 390x844 (phone) first and 1440x900 (desktop) second.

## Goals

1. Close the security hole (server serves `.env`, `server.py`, `.git/`).
2. Make the admin editor honest about failures (session expiry, API errors, concurrent edits).
3. Fix the mobile interaction bugs on the public pages (swipe-to-close, dead search results, stale cache).
4. Make photos load faster (thumbnails, long-lived cache headers, tighter compression).
5. Allow two or more photos per location, shown one at a time in a swipeable strip, never stacked.
6. Add an automated test suite so all of the above stays fixed.

## Shared contract (all tracks must follow this exactly)

### Data model (`data.json`)

Each location gains an `images` array. `image` stays as a mirror of `images[0]` for backward compatibility.

```json
{ "id": "...", "name": "...", "image": "location1-1.jpg", "images": ["location1-1.jpg", "uploads/location-2026...-abcd.jpg"] }
```

- Server migrates on load: if `images` is missing, set `images = [image]` if `image` is non-empty else `[]`. Always set `image = images[0] if images else ""` before saving.
- A location may have zero, one, or many images. The first image is the cover.
- Image paths are relative to the project root, exactly as today (`location1-1.jpg` or `uploads/xxx.jpg`).

### Thumbnails

- For any image path `DIR/NAME.jpg`, its thumbnail is `DIR/thumbs/NAME.jpg` (root photos: `thumbs/location1-1.jpg`; uploads: `uploads/thumbs/xxx.jpg`).
- Thumbnails are JPEG, longest side 480px, quality 78. Full images are JPEG, longest side 1600px, quality 80.
- The server generates both on upload and exposes `python3 compress_existing_images.py --thumbs` to backfill. Frontend derives the thumb path itself and falls back to the full image on load error.

### Generated HTML (`server.py` generate-html)

Marker divs keep `data-image` (cover) and gain `data-images` containing a JSON array of paths, HTML-escaped. Example:

```html
<div class="location-marker" data-image="a.jpg" data-images="[&quot;a.jpg&quot;, &quot;b.jpg&quot;]" ...>
```

Frontend parses `data-images` with `JSON.parse`, falling back to `[data-image]` if missing or invalid.

### API

- `POST /api/upload` unchanged: one file in, `{success, filename, thumbnail}` out.
- `PUT /api/venues/<v>/maps/<m>/locations/<l>` accepts `images` (array). Server normalizes `image` from it.
- `DELETE /api/upload/<path>` unchanged, deletes full image and its thumb, only inside `uploads/`.
- New `PUT /api/landing-page` replaces only the `landingPage` key. Admin must stop POSTing the whole dataset to `/api/data` for card edits.
- Every write endpoint holds `file_write_lock` around load, mutate, and save.
- Error responses are always `{"error": "..."}` with a 4xx/5xx status. 401 body is `{"error": "Session expired"}`.

### Multi-photo UI, public pages

- Photo strip: horizontal, one photo visible at a time, full width of the sheet, `scroll-snap-type: x mandatory`, native swipe on touch. Fixed aspect box (4:3 on phone, 16:10 on desktop) so the sheet never jumps.
- Below the strip: dot indicator plus a "2 / 3" counter. Desktop also shows left/right arrow buttons and keyboard arrows work.
- Strip shows thumbnails. Tapping a photo opens the existing zoom modal with the full image, and the modal gets prev/next.
- One photo: no dots, no arrows, no counter. Zero photos: the existing placeholder and photo-request form.
- Preload on map-in-view fetches thumbnails only, never full images.

### Multi-photo UI, admin

- Replace the single preview with a horizontal row of thumbnails. Each has an X to remove and can be dragged to reorder. The first is labeled "Cover".
- The upload input accepts multiple files and uploads them one by one via `/api/upload`, appending each to `images`.
- After any upload or delete, save the location and call generate-html so the public pages match.

## Tracks and file ownership

Agents work in the same checkout at the same time. Each track may edit only its own files. If a track needs something from another track, it follows the contract above and does not edit the other track's files.

### Track A: Server (`server.py`, `compress_existing_images.py`, `requirements.txt`, `.env.example`, `tests/test_server.py`)

1. Static route allowlist: serve only `*.html`, `*.css`, `*.js`, `*.json` (except `analytics.json`), `*.jpg/.jpeg/.png/.webp/.gif/.ico/.svg/.webmanifest`, `manifest.json`, `sw.js`, and anything under `uploads/` and `thumbs/`. Return 404 for dotfiles, `*.py`, `*.md`, `*.sh`, `*.txt`, `*.tar.gz`, `.git`, `.venv`, `__pycache__`, `tests`. Add a regression test that fetches `/.env`, `/server.py`, `/.git/config`, `/analytics.json` and expects 404.
2. Locking: every load-mutate-save path runs inside `file_write_lock` (use a `with_data()` helper that takes a mutator).
3. `threaded=True` in `app.run`.
4. Cache headers: images (`.jpg`, `.png`, `.webp`, `.gif`) get `Cache-Control: public, max-age=31536000, immutable`. HTML, `data.json`, `sw.js` get `no-cache`. CSS and JS get `max-age=3600`.
5. Image migration and normalization on load and save per the contract.
6. Thumbnail generation on upload, thumbnail deletion on delete, `--thumbs` backfill flag, and run the backfill so `thumbs/` exists for every existing photo. Also apply the 1600px / q80 settings to new uploads only. Do not recompress existing photos.
7. `data-images` in generated HTML.
8. `PUT /api/landing-page`.
9. Clean data: for the 30 locations whose `image` points at a file that does not exist, set `images` to `[]` and `image` to `""`. Print the list of affected locations in the agent report.
10. Tests in `tests/test_server.py` using Flask's test client against a temporary copy of `data.json` and a temp uploads dir: auth required on write endpoints, 401 body shape, static allowlist, upload creates thumb, location update normalizes `image` from `images`, landing-page endpoint does not touch venues, generate-html emits `data-images`.

### Track B: Public frontend (`script.js`, `search.js`, `sw.js`, `style.css`, `print.css`, `templates/map-template.html`, `manifest.json`, `image-zoom.js`, `index.html`, plus a new `icon-512.png`)

1. Scope swipe-to-close to the expanded map container. Ignore gestures that start inside any element with vertical scroll (`overflow-y: auto` and `scrollHeight > clientHeight`). Require the gesture to be mostly vertical and not preceded by scrolling.
2. Search: results whose map is not on the current page navigate to `<category page>.html#<mapId>` and that page scrolls to and expands the map on load. Determine the category page from `data.json` categories.
3. Service worker: bump `CACHE_VERSION`. `data.json` and all `.html` become network-first with a 3 second timeout and cache fallback. Images stay cache-first. Add a `controllerchange` listener in `script.js` that shows a small "Updated, tap to refresh" toast instead of silently serving stale content.
4. `print.css`: update selectors to the current `.location-marker` and `.marker-number` markup, remove rules for classes that no longer exist.
5. `manifest.json`: add a 512x512 maskable icon generated from `auburn-logo.png` with Pillow.
6. Photo strip per the contract, in `script.js` and `style.css`. Thumbnail path derivation with fallback. Preload thumbnails only.
7. Zoom modal: prev/next and keyboard arrows when a location has more than one photo.
8. Everything must work with both `data-images` present and absent (old generated pages until regenerated).

### Track C: Admin editor (`admin.js`, `admin.html`, `admin.css`)

1. `api()` helper: inspect `response.ok`. On 401, clear the token, show the login screen with "Session expired, please log in again", and throw. On any other error, throw an `Error` with the server message. Every caller that mutates local state must only do so after a successful response. Deletes call `loadData()` afterwards.
2. Landing page card edits use `PUT /api/landing-page`.
3. Touch drag: call `preventDefault()` on `touchmove` while dragging a marker.
4. Escape `card.title`, `category.name`, `venue.name`, `map.label`, `location.name` everywhere they go into `innerHTML`.
5. Upload calls `generateHTML()` after success, matching delete.
6. Multi-photo UI per the contract, working with `images` array. Keep the photo-request approval flow working: approving a request appends the approved image to `images`.
7. Update the guided tour text where it mentions the single photo.

### Track D: Tests and verification (after A, B, C)

1. Run `.venv/bin/python -m pytest tests -q`.
2. Start a preview server on port 8091 with a copy of `.env`, run generate-html via the API, and check with curl: `/.env` is 404, `/Fiber.html` contains `data-images`, `/thumbs/location1-1.jpg` is 200 and under 80 KB, `/location1-1.jpg` has the immutable cache header.
3. Headless Chromium screenshots of `Fiber.html` at 390x844 and 1440x900 with a multi-photo location open, saved to the scratchpad, for a human look. Use `chromium --headless=new --screenshot --window-size=...` plus a small injected script, or a Node script if puppeteer is available.
4. Kill the preview server by its exact PID.

### Review and fix

Three reviewers, one per track, verify the contract and hunt for regressions. Confirmed findings go back to a fixer for that track. Tests rerun.

### Rollout

1. Commit on `claude/fixes-multiphoto`, merge to `main`.
2. `sudo systemctl restart interactivemaps`, then hit `/api/health` or `/` and `/.env` on 8081.
3. Log in to the admin, publish once so every category page regenerates with `data-images`.
4. Hard-refresh a phone once to pick up the new service worker.
5. Rotate the admin password (the old hash was publicly readable) and push to GitHub.

## Out of scope

- Redesigning the landing page or admin layout.
- Video, captions, or per-photo metadata.
- Replacing Flask's server with gunicorn. `threaded=True` is enough for this traffic.
