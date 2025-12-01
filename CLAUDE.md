# Interactive Maps - Auburn Athletics

## Quick Reference
- **Port**: 8080
- **Manual Start**: `python3 server.py`
- **Local**: http://192.168.1.5:8080
- **GitHub**: https://github.com/jdowns12/interactivemaps
- **Admin Password**: VideoProd2020!

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
- `POST /api/auth/login` - Admin authentication

## File Upload
- Max size: 5MB
- Formats: PNG, JPG, JPEG, WebP, GIF
- Location: `/uploads/`

## Dependencies
- flask==2.3.0
- flask-cors==4.0.0
- werkzeug>=2.3.0

## Git Status
- 11 staged files pending commit (admin editor system)
- Need to commit and push

## Notes
- No systemd service (manual start)
- PWA enabled for offline access
- Admin sessions: 24-hour expiration
