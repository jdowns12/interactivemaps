# Interactive Maps - Auburn Athletics

Flask site with interactive venue maps (fiber, ESPN, camera positions, photos) for Auburn
Athletics / WEP, with a password-protected admin editor. Live on the Raspberry Pi as systemd
`interactivemaps.service` (port 8081, https://wepmaps.gumdrop.space via Cloudflare Tunnel,
LAN http://192.168.1.5:8081). Quiet since 2026-09-10. Successor of `../wepmaps` (static).
Primary users are on phones at venues: check every change at 390x844 first, then 1440x900.

Stack: follows ~/Projects/STACK.md. Here: Raspberry Pi (`interactivemaps.service`, :8081) behind Cloudflare Tunnel at wepmaps.gumdrop.space, Flask, `data.json` + uploads. Deviations: one admin password hash instead of accounts; repo on personal `jdowns12`.

## Commands
- Tests: `python3 -m pytest tests -q` (sandboxed; never touches `data.json` or `uploads/`).
  There is no `.venv` in this checkout on the Mac; the Pi has one (`.venv/bin/python`).
- Admin UI regression: `node tests/e2e/admin-verify.js` against a preview copy on port 8092
  whose `.env` hash is for password `preview123` (Playwright is in `~/.npm/_npx/e41f203b7505f1fb`).
- Run locally: `PORT=8092 python3 server.py` on a copy of the data. Do not use
  `start-server.sh`: it is the static-era `http.server` on port 8080 and bypasses the API.
- Deploy: push to the `pi` remote, then `sudo systemctl restart interactivemaps` on the Pi
  (`jadondowns@100.121.240.8`). GitHub: https://github.com/jdowns12/interactivemaps.

## Rules
1. The admin password is a salted hash in `.env` (`ADMIN_PASSWORD_HASH`, gitignored); see
   `.env.example` for how to generate one. Never commit `.env` or quote a password.
2. Sessions last 24 hours; every 401 body is `{"error": "Session expired"}`. Keep that shape; the
   admin JS keys on it.
3. `server.py` serves an allowlist only (html/css/js/json/images, `uploads/`, `thumbs/`).
   Dotfiles, `.py`, `.md`, `tests/`, `templates/` and `analytics.json` must stay 404.
4. Uploads: 25 MB max (browser shrinks to 1920px first), PNG/JPG/WebP/GIF, recompressed to
   1600px JPEG q80 in `uploads/`, thumbnail at `DIR/thumbs/NAME` (480px q78). Backfill thumbs
   with `python3 compress_existing_images.py --thumbs`.
5. Each location has `images` (array, first is the cover) and `image` (legacy mirror of
   `images[0]`). Generated pages carry `data-images` (HTML-escaped JSON) on each marker. Keep
   both fields in sync.
6. Admin saves auto-publish; `GET /api/publish-status` returns `{lastModified, lastPublished, dirty}`.
   No existing admin capability may be lost (list in `PLAN-ADMIN-WORKFLOW.md`, "Must keep").

## API (server.py)
`GET/POST /api/data` · `POST /api/upload` · `POST /api/upload/map` · `DELETE /api/upload/<path>`
(uploads/ only) · `POST /api/generate-html` · `PUT /api/landing-page` · `GET /api/health` ·
`GET /api/publish-status` · `POST /api/auth/login`.

## Docs
- Photo and data contract: `PLAN-FIXES-AND-MULTIPHOTO.md`. Admin editor workflow (placement
  mode, drawer, accordion, auto-publish, Photos needed view, pinch zoom, blank-map canvas ratio):
  `PLAN-ADMIN-WORKFLOW.md`. Read the relevant one before changing the admin editor or data shape.
