# Interactive Maps - Auburn Athletics

## Quick Reference
- **Port**: 8081
- **Run/Restart**: `sudo systemctl restart interactivemaps` (systemd service, auto-restarts)
- **Local**: http://192.168.1.5:8081
- **Public**: https://wepmaps.gumdrop.space (Cloudflare Tunnel → localhost:8081)
- **GitHub**: https://github.com/jdowns12/interactivemaps
- **Admin Password**: salted hash in `.env` (`ADMIN_PASSWORD_HASH`, gitignored) — see `.env.example`

## Purpose
Interactive venue maps for Auburn Athletics with fiber connectivity, ESPN camera positions, and venue information.

## Key Features
- Interactive venue maps with clickable markers
- Multiple categories: Fiber, ESPN, Camera Positions
- Password-protected admin editor
- Drag-drop marker positioning
- PWA enabled (offline support)
- Auburn branding (Navy #0C2340, Orange #E86100)
- 100+ location photos with zoom
- Print-optimized layouts

## Key Files
- `server.py` - Flask backend (API endpoints)
- `data.json` - All venue/location data
- `admin.html` / `admin.js` / `admin.css` - Admin editor
- `index.html` - Landing page
- `Fiber.html`, `ESPN.html`, `camera_positions.html` - Generated category pages
- `script.js` - Map interaction
- `sw.js` - Service worker for PWA
- `templates/map-template.html` - Template for generating pages

## API Endpoints
- `GET /api/data` - Get all venue data
- `POST /api/data` - Save all data
- `POST /api/upload` - Upload location images
- `POST /api/upload/map` - Upload map images
- `POST /api/generate-html` - Generate HTML from data
- `PUT /api/landing-page` - Replace only the landing page cards
- `DELETE /api/upload/<path>` - Delete an uploaded image and its thumbnail (uploads/ only)
- `GET /api/health` - Liveness check
- `POST /api/auth/login` - Admin authentication (401 body is always `{"error": "Session expired"}`)

## File Upload
- Max size: 5MB
- Formats: PNG, JPG, JPEG, WebP, GIF
- Location: `/uploads/`, recompressed to 1600px JPEG q80
- Thumbnail written to `DIR/thumbs/NAME` (480px, q78). Backfill: `python3 compress_existing_images.py --thumbs`

## Photos per location
- Each location has `images` (array, first is the cover) and `image` (mirror of `images[0]`, legacy)
- Generated pages carry `data-images` (HTML-escaped JSON array) on each marker
- Full contract: `PLAN-FIXES-AND-MULTIPHOTO.md`

## Tests
- `.venv/bin/python -m pytest tests -q` (sandboxed, never touches real data.json or uploads/)

## Static serving
- `server.py` only serves an allowlist (html/css/js/json/images, `uploads/`, `thumbs/`). Dotfiles, `.py`, `.md`, `tests/`, `templates/`, `analytics.json` are 404.

## Dependencies
- flask>=3.0,<4, werkzeug>=3.0,<4, flask-cors>=6, Pillow, pytest (see requirements.txt)

## Notes
- Runs as systemd service `interactivemaps.service` (enabled, auto-restart)
- Reads `.env` at startup for `ADMIN_PASSWORD_HASH` (and optional `PORT`)
- PWA enabled for offline access
- Admin sessions: 24-hour expiration
