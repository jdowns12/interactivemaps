# Plan: Admin editor workflow overhaul

Date: 2026-09-03. Branch: `claude/admin-workflow`. Builds on `PLAN-FIXES-AND-MULTIPHOTO.md` (read it first for the photo/data contract).

Rule zero: no existing admin capability may be lost. Every feature listed under "Must keep" has to work at the end, on desktop and on a 390px wide phone.

## Must keep

Categories, venues, maps (create, edit, delete), landing page cards (add, edit, reorder, hide, delete), map image upload, the blank grid canvas for maps without an image ("build your own map"), marker drag on mouse and touch, location create/edit/delete, renumber, location search, multi-photo row (add, reorder, remove, cover), photo request notifications and approval, guided tour, Publish, View Site, logout, session-expiry handling.

## Shared contract

### Server additions (`server.py`)

- `data.json` gains a top-level `meta` object: `{"lastModified": iso8601, "lastPublished": iso8601 | null}`. `save_data` sets `lastModified`. `generate_html` sets `lastPublished` after writing files. `normalize_data` creates `meta` if missing.
- `GET /api/publish-status` (auth) returns `{"lastModified", "lastPublished", "dirty": bool}` where dirty means lastPublished is null or older than lastModified.
- Maps accept an optional `canvas` string, one of `"16:9"`, `"4:3"`, `"1:1"`, `"3:4"`, default `"16:9"`. Stored on the map object. Only meaningful when the map has no image.
- Generated public pages: a map with no image renders its container with `style="aspect-ratio: W / H"` from `canvas`, and the marker container fills it, so markers placed on the blank canvas in the admin appear at the same relative positions publicly.
- `GET /api/data` continues to return everything including `meta`.

### Admin behaviour

1. **Add Location button and tap-to-place.** A `+ Add Location` button in the Locations list header. Clicking it arms placement mode: cursor becomes crosshair, the canvas gets a `placing` class and a hint banner "Tap the map to place the new location. Esc cancels." The next single click or tap on the canvas creates the location there and opens its details. Double-click on desktop still works as before. Escape or clicking the button again cancels.
2. **Sidebar drawer on phones.** At 768px and below, the sidebar is off-canvas. A menu button in the header opens it as a full-height drawer with a scrim. Choosing a map closes the drawer and scrolls the editor into view at the top. On desktop the sidebar is unchanged except the Landing Page section starts collapsed and remembers its state in localStorage.
3. **Details accordion.** Location details render inline directly beneath the selected item in the Locations list instead of in a panel that covers the list. Only one item is expanded at a time. The list scrolls so the expanded item is visible. The Save and Delete row is sticky at the bottom of the expanded block. On phones the list and its accordion sit below the map, full width. Keep the existing form field ids so the tour and existing handlers keep working; the form element moves, it is not rebuilt.
4. **Auto-publish and status line.** Every successful save (location, map, venue, category, landing page, photo change, renumber, reorder, delete) calls generate-html afterwards, debounced 1.5 s so a drag or a burst of edits publishes once. The Publish button becomes a status strip in the sidebar footer: "Published just now", "Published 3 min ago", or an orange "Unpublished changes, Republish" state when `/api/publish-status` reports dirty or a publish failed. Clicking it republishes. Poll the status every 60 s.
5. **Photo status.** Each location list item shows a small camera badge with the photo count. Zero photos renders the badge grey with a "0". A filter toggle "Needs photos" at the top of the list hides locations that have photos. A new "Photos needed" entry at the top of the sidebar (above Landing Page) opens a site-wide view in the main area: a table grouped by venue and map of every location with zero photos, each row with the location name, number, and an Add Photos button that uploads directly to that location using the same shrink-and-upload path. Count badge on the entry.
6. **Destructive actions moved.** Remove the red Delete Map button from the editor header. Put "Delete this map" as a secondary red text button at the bottom of the Edit Map Info modal. Same treatment for category and venue: the small x in the tree becomes a pencil-only affordance and delete lives in the edit modal. Confirmation modal text names the item and, for maps and venues, says how many locations will be removed.
7. **Map fit and zoom.** The canvas fits the available width. On touch devices pinch-zoom and two-finger pan work on the canvas (CSS transform on an inner wrapper; markers must stay correctly positioned and draggable while zoomed). A small "Reset zoom" control appears when zoomed. Marker size stays constant on screen while zooming (counter-scale the markers).
8. **Blank map builder.** The Create Map modal gets a "Canvas shape" selector (16:9 wide, 4:3, 1:1 square, 3:4 tall) shown when no image is chosen, with a one-line note that an image can be uploaded later from Edit Map Info. The blank canvas in the editor uses that ratio. Edit Map Info shows the same selector while the map has no image.
9. **Tour.** Update tour steps for the Add Location button flow (replace the double-click step), the status strip instead of Publish, and the moved delete buttons. Every tour target selector must exist.
10. **Keyboard.** Escape cancels placement mode or collapses the open accordion. Enter in a single-line field saves the location.

### File ownership

- Track A, server: `server.py`, `tests/test_server.py`.
- Track B, public: `script.js`, `style.css`, `templates/map-template.html` (only for the imageless-map aspect ratio).
- Track C, admin: `admin.js`, `admin.html`, `admin.css`.

### Verification (Track D)

Playwright at 1440x900 and 390x844 against a preview server on port 8092 with a known password (`preview123` hash written to the preview copy's `.env`). Screenshot and assert: Add Location placement on mobile via tap creates a marker; drawer opens and closes and the map scrolls into view; accordion expands under the item with the list still visible; status strip text after a save; photo badges and the Needs photos filter; the Photos needed view; Delete Map absent from header and present in the modal; pinch zoom transform applied with markers counter-scaled; canvas shape selector in Create Map; the tour runs through step 5 without a missing target. pytest passes.
