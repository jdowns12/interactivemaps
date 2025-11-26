# WEP Interactive Maps - Admin Editor Plan

## Overview
Build a password-protected admin page for the WEP Venue Maps that allows visual editing of maps: drag-and-drop icon positioning, add/edit/delete locations, upload images, and create new map pages and categories. Includes a Python Flask backend for data persistence.

---

## Architecture

### Frontend (Admin Page)
- Password-protected access (VideoProd2020!)
- Visual map editor with drag-and-drop
- CRUD operations for locations, maps, venues, and categories
- Image upload interface
- Auburn-branded design

### Backend (Python Flask)
- Lightweight API server (Pi-friendly)
- JSON file storage for data
- Image upload handling to `/uploads` folder
- HTML generation from data.json

---

## Phase 1: Backend API Server

### 1.1 Create Flask Server (`server.py`)
```python
# Endpoints:
GET  /api/data              # Get all venue data
POST /api/data              # Save all venue data
POST /api/upload            # Upload image file
GET  /api/categories        # Get all categories
POST /api/categories        # Create new category
DELETE /api/categories/:id  # Delete category
POST /api/venues            # Create new venue
PUT  /api/venues/:id        # Update venue
DELETE /api/venues/:id      # Delete venue
POST /api/maps              # Create new map
PUT  /api/maps/:id          # Update map
DELETE /api/maps/:id        # Delete map
POST /api/locations         # Create new location
PUT  /api/locations/:id     # Update location
DELETE /api/locations/:id   # Delete location
POST /api/generate-html     # Generate HTML from data
GET  /api/auth              # Verify admin password
```

### 1.2 File Structure
```
/wepmaps
├── server.py           # Flask backend
├── data.json           # All venue/location data
├── uploads/            # Uploaded images folder
├── admin.html          # Admin editor page
├── admin.css           # Admin styles
├── admin.js            # Admin JavaScript
└── [existing files...]
```

### 1.3 Data Structure (Enhanced data.json)
```json
{
  "categories": [
    {
      "id": "fiber",
      "name": "Fiber Connectivity",
      "slug": "Fiber",
      "icon": "fiber-icon.svg"
    },
    {
      "id": "espn",
      "name": "ESPN Positions",
      "slug": "ESPN"
    },
    {
      "id": "camera",
      "name": "Camera Positions",
      "slug": "camera_positions"
    }
  ],
  "venues": [
    {
      "id": "neville-arena",
      "name": "Neville Arena",
      "type": "arena",
      "category": "fiber",
      "maps": [
        {
          "id": "map1",
          "label": "3rd and 4th floor",
          "subtitle": "Concourse Level",
          "image": "map1.jpg",
          "locations": [
            {
              "id": "1.1",
              "number": 1,
              "name": "Main Left",
              "position": { "top": 80, "left": 47.2 },
              "image": "location1-1.jpg",
              "description": "Description here...",
              "fiber": "12 ST",
              "color": null
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Phase 2: Admin Authentication

### 2.1 Login Page
- Simple password field (no username needed)
- Password: `VideoProd2020!`
- Store auth token in sessionStorage
- Auto-logout on browser close
- Admin link in header (top-right corner)

### 2.2 Security
- Password hashed with bcrypt on server
- Session-based auth (not stored in code)
- All API endpoints require valid session
- CORS restricted to same-origin

---

## Phase 3: Admin Dashboard UI

### 3.1 Layout Design
```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  WEP Maps Admin              [Logout] [View Site]│
├──────────────┬──────────────────────────────────────────┤
│              │                                          │
│  CATEGORIES  │         MAP EDITOR CANVAS                │
│  ─────────── │                                          │
│  ▶ Fiber     │    ┌────────────────────────────┐       │
│    • Neville │    │                            │       │
│    • JH Stad │    │      [Map Image]           │       │
│  ▶ ESPN      │    │         ⓵ ⓶               │       │
│  ▶ Camera    │    │      ⓷    ⓸              │       │
│              │    │                            │       │
│  [+Category] │    └────────────────────────────┘       │
│  [+Venue]    │                                          │
│  [+Map]      │    LOCATION DETAILS                      │
│              │    ┌────────────────────────────┐       │
│              │    │ Name: [__________]         │       │
│              │    │ Desc: [__________]         │       │
│              │    │ Image: [Upload]  [Preview] │       │
│              │    │ Fiber: [__________]        │       │
│              │    │ [Save] [Delete]            │       │
│              │    └────────────────────────────┘       │
└──────────────┴──────────────────────────────────────────┘
```

### 3.2 Sidebar Features
- Collapsible category/venue/map tree
- Drag to reorder venues within categories
- Right-click context menu (Edit, Delete, Duplicate)
- Quick-add buttons at bottom

### 3.3 Map Editor Canvas
- Display selected map image at full size
- Show all location icons with numbers
- Click icon to select and show details panel
- Drag icon to reposition (updates percentage coords)
- Double-click empty area to add new location
- Zoom in/out controls
- Grid overlay toggle (optional)

### 3.4 Location Details Panel
- Form fields for: number, name, description, fiber info
- Image upload with preview
- Color selector (for floor filtering)
- Save/Cancel/Delete buttons
- Coordinates display (read-only, auto-calculated)

---

## Phase 4: Drag-and-Drop Editor

### 4.1 Icon Positioning
```javascript
// Calculate percentage position from pixel coordinates
function getPercentPosition(e, mapElement) {
  const rect = mapElement.getBoundingClientRect();
  const left = ((e.clientX - rect.left) / rect.width) * 100;
  const top = ((e.clientY - rect.top) / rect.height) * 100;
  return { left: left.toFixed(2), top: top.toFixed(2) };
}
```

### 4.2 Drag Behavior
- Click and hold icon to start drag
- Visual feedback (icon follows cursor, ghost outline at original)
- Drop to update position
- Snap-to-grid option (5% increments)
- Undo/Redo support

### 4.3 New Location Creation
- Double-click on map to place new icon
- Auto-increment location number
- Opens detail panel for entry
- Cancel reverts placement

---

## Phase 5: Image Upload

### 5.1 Upload Flow
1. Click "Upload Image" in location details
2. Select file from device or drag-drop
3. Preview shows immediately (client-side)
4. On save, POST to `/api/upload`
5. Server saves to `/uploads/` with unique filename
6. Returns filename to store in data.json

### 5.2 Image Handling
- Accept: jpg, jpeg, png, webp
- Max size: 5MB
- Auto-rename to prevent conflicts: `location-{venueId}-{mapId}-{locationId}-{timestamp}.jpg`
- Thumbnail generation (optional, for faster loading)

### 5.3 Map Image Upload
- Separate upload for map background images
- Stored in `/uploads/maps/`
- Updates map.image field

---

## Phase 6: Create New Maps/Venues/Categories

### 6.1 New Category Modal
```
┌─────────────────────────────────┐
│  Create New Category            │
├─────────────────────────────────┤
│  Name: [________________]       │
│  Slug: [________________]       │
│  (auto-generates from name)     │
│                                 │
│  [Cancel]           [Create]    │
└─────────────────────────────────┘
```

### 6.2 New Venue Modal
```
┌─────────────────────────────────┐
│  Create New Venue               │
├─────────────────────────────────┤
│  Name: [________________]       │
│  Type: [Arena ▼]               │
│  Category: [Fiber ▼]           │
│                                 │
│  [Cancel]           [Create]    │
└─────────────────────────────────┘
```

### 6.3 New Map Modal
```
┌─────────────────────────────────┐
│  Create New Map                 │
├─────────────────────────────────┤
│  Label: [________________]      │
│  Subtitle: [________________]   │
│  Venue: [Neville Arena ▼]      │
│  Map Image: [Upload...]         │
│             [Preview]           │
│                                 │
│  [Cancel]           [Create]    │
└─────────────────────────────────┘
```

---

## Phase 7: HTML Generation

### 7.1 Generate on Save
When admin saves changes, backend generates HTML files:
- `Fiber.html` - All fiber connectivity venues
- `ESPN.html` - All ESPN position venues
- `camera_positions.html` - All camera position venues
- Custom category pages as needed

### 7.2 Template Engine
```python
def generate_html(category):
    template = load_template('map-template.html')
    venues = get_venues_by_category(category)
    return render(template, venues=venues)
```

### 7.3 Regenerate Button
- "Regenerate All HTML" button in admin
- Shows diff preview before applying
- Backup previous versions

---

## Phase 8: Admin UI Design (Auburn Theme)

### 8.1 Color Palette
- Primary: Navy #0C2340
- Accent: Orange #E87722
- Background: Light Gray #F5F5F5
- Cards: White #FFFFFF
- Text: Dark Gray #333333

### 8.2 Visual Style
- Clean, minimal interface
- Card-based layout with subtle shadows
- Orange accent for primary actions
- Navy header bar
- Smooth transitions and hover effects

### 8.3 Responsive Design
- Works on tablet for on-site editing
- Minimum width: 768px (not mobile-optimized)
- Scrollable sidebar, fixed header

---

## Implementation Order

| Step | Task | Files |
|------|------|-------|
| 1 | Create Flask server with basic API | server.py |
| 2 | Add authentication endpoint | server.py |
| 3 | Create admin login page | admin.html, admin.css |
| 4 | Build admin dashboard layout | admin.html, admin.css |
| 5 | Implement sidebar navigation | admin.js |
| 6 | Build map editor canvas | admin.js, admin.css |
| 7 | Add drag-and-drop positioning | admin.js |
| 8 | Create location details panel | admin.html, admin.js |
| 9 | Implement image upload | server.py, admin.js |
| 10 | Add CRUD for locations | server.py, admin.js |
| 11 | Add CRUD for maps | server.py, admin.js |
| 12 | Add CRUD for venues | server.py, admin.js |
| 13 | Add CRUD for categories | server.py, admin.js |
| 14 | Build HTML generation engine | server.py |
| 15 | Add admin link to main header | header.js |
| 16 | Test full workflow | - |
| 17 | Deploy to Raspberry Pi | - |

---

## Files to Create

| File | Purpose |
|------|---------|
| `server.py` | Flask backend with API endpoints |
| `admin.html` | Admin editor page |
| `admin.css` | Admin-specific styles |
| `admin.js` | Editor logic, drag-drop, API calls |
| `templates/map-template.html` | Template for generating map pages |
| `uploads/` | Directory for uploaded images |
| `requirements.txt` | Python dependencies |

---

## Raspberry Pi Deployment

### Requirements
```
flask==2.3.0
flask-cors==4.0.0
bcrypt==4.1.0
pillow==10.0.0  # For image processing
```

### Setup Commands
```bash
# On Raspberry Pi
cd /home/pi/wepmaps
pip install -r requirements.txt
python server.py
# Or use systemd service for auto-start
```

### Service File (`/etc/systemd/system/wepmaps.service`)
```ini
[Unit]
Description=WEP Maps Server
After=network.target

[Service]
User=pi
WorkingDirectory=/home/pi/wepmaps
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

---

## Security Notes

- Password is hashed, not stored in plain text
- Session tokens expire after 24 hours
- Admin pages not indexed by search engines
- File upload validates file types and size
- API endpoints validate all input data
