#!/usr/bin/env python3
"""
WEP Venue Maps - Flask Backend Server
Provides API endpoints for the admin editor
"""

import os
import json
import uuid
import secrets
import threading
from html import escape as html_escape
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from werkzeug.security import check_password_hash
from werkzeug.exceptions import HTTPException, NotFound

try:
    from PIL import Image as PILImage, ExifTags
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

# Everything on disk is addressed relative to the project root (the directory
# containing this file) so the server behaves the same no matter the cwd.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_dotenv(path=None):
    """Load KEY=VALUE pairs from a .env file into os.environ (no dependency needed)."""
    path = path or os.path.join(BASE_DIR, '.env')
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ.setdefault(key.strip(), value.strip())
    except FileNotFoundError:
        pass

load_dotenv()

# static_folder=None: Flask's built-in static route is disabled so every file
# request goes through serve_static() and its allowlist below.
app = Flask(__name__, static_folder=None)
app.secret_key = secrets.token_hex(32)
CORS(app, supports_credentials=True)

# Configuration (module globals so tests can point them at temp copies)
DATA_FILE = os.path.join(BASE_DIR, 'data.json')
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ANALYTICS_FILE = os.path.join(BASE_DIR, 'analytics.json')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB max file size
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Image sizing (see PLAN-FIXES-AND-MULTIPHOTO.md, "Thumbnails")
FULL_MAX_DIM = 1600
FULL_QUALITY = 80
THUMB_MAX_DIM = 480
THUMB_QUALITY = 78
THUMBS_DIRNAME = 'thumbs'

# Static allowlist: only these extensions are ever served from the project root.
STATIC_EXTENSIONS = {
    'html', 'css', 'js', 'json',
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'ico', 'svg', 'webmanifest',
}
STATIC_BLOCKED_FILES = {'analytics.json'}
STATIC_BLOCKED_DIRS = {'.git', '.venv', '__pycache__', 'tests', 'templates'}
IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp', 'gif'}

# Admin password: salted hash loaded from .env (never stored in source).
# Generate a new one with:
#   python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('newpass', method='pbkdf2:sha256:600000'))"
ADMIN_PASSWORD_HASH = os.environ.get('ADMIN_PASSWORD_HASH', '')

# Session storage (in-memory for simplicity)
sessions = {}

# Login rate limiting: per-IP timestamps of recent failed attempts
LOGIN_MAX_FAILURES = 5
LOGIN_WINDOW_SECONDS = 15 * 60
failed_logins = {}

# Serialize JSON file access. RLock so with_data() can wrap load/save, which
# also take the lock, without deadlocking.
file_write_lock = threading.RLock()

# Analytics - track unique sessions per day
visitor_sessions = set()  # Track session IDs seen today
last_analytics_date = None


def ensure_dirs():
    """Create the upload folders (safe to call any time)."""
    for d in ('', 'maps', 'photo-requests', THUMBS_DIRNAME):
        os.makedirs(os.path.join(UPLOAD_FOLDER, d), exist_ok=True)

ensure_dirs()


def abs_path(rel):
    """Resolve a project-relative path (as stored in data.json) to an absolute one."""
    if os.path.isabs(rel):
        return rel
    return os.path.join(BASE_DIR, rel)


def rel_path(path):
    """Project-relative path with forward slashes, as stored in data.json."""
    return os.path.relpath(path, BASE_DIR).replace(os.sep, '/')


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

def load_analytics():
    """Load analytics data from JSON file"""
    try:
        with open(ANALYTICS_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"daily": {}, "total_sessions": 0, "total_pageviews": 0}

def save_analytics(data):
    """Save analytics data to JSON file (atomic write, serialized)"""
    with file_write_lock:
        tmp = ANALYTICS_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, ANALYTICS_FILE)

def track_visit(session_id):
    """Track a page visit"""
    global visitor_sessions, last_analytics_date

    today = datetime.now().strftime('%Y-%m-%d')
    with file_write_lock:
        analytics = load_analytics()

        # Reset daily sessions if it's a new day
        if last_analytics_date != today:
            visitor_sessions = set()
            last_analytics_date = today

        # Initialize today's stats if needed
        analytics.setdefault('daily', {})
        if today not in analytics['daily']:
            analytics['daily'][today] = {'sessions': 0, 'pageviews': 0}

        # Track pageview
        analytics['daily'][today]['pageviews'] += 1
        analytics['total_pageviews'] = analytics.get('total_pageviews', 0) + 1

        # Track unique session
        if session_id and session_id not in visitor_sessions:
            visitor_sessions.add(session_id)
            analytics['daily'][today]['sessions'] += 1
            analytics['total_sessions'] = analytics.get('total_sessions', 0) + 1

        save_analytics(analytics)
    return analytics


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def _open_oriented_rgb(filepath):
    """Open an image with Pillow, apply EXIF orientation, and flatten to RGB."""
    img = PILImage.open(filepath)

    # Apply EXIF rotation before anything else
    try:
        exif = img._getexif()
        if exif:
            for tag, value in exif.items():
                if ExifTags.TAGS.get(tag) == 'Orientation':
                    if value == 3:
                        img = img.rotate(180, expand=True)
                    elif value == 6:
                        img = img.rotate(270, expand=True)
                    elif value == 8:
                        img = img.rotate(90, expand=True)
                    break
    except Exception:
        pass

    # Convert to RGB (handles PNG with transparency, etc.)
    if img.mode in ('RGBA', 'P', 'LA'):
        background = PILImage.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'RGBA':
            background.paste(img, mask=img.split()[3])
        else:
            background.paste(img)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    return img

def _fit(img, max_dimension):
    w, h = img.size
    if max(w, h) > max_dimension:
        scale = max_dimension / max(w, h)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), PILImage.LANCZOS)
    return img

def compress_image(filepath, max_dimension=FULL_MAX_DIM, quality=FULL_QUALITY):
    """Resize and compress an image using Pillow. Saves in-place as JPEG.
    Respects EXIF orientation so portrait phone photos come out right-side-up.
    Returns the final filepath (extension may change to .jpg)."""
    if not PILLOW_AVAILABLE:
        return filepath

    try:
        img = _fit(_open_oriented_rgb(filepath), max_dimension)

        # Always save as JPEG for consistency
        base = os.path.splitext(filepath)[0]
        out_path = base + '.jpg'
        img.save(out_path, 'JPEG', quality=quality, optimize=True)

        # Remove original if it had a different extension
        if out_path != filepath and os.path.exists(filepath):
            os.remove(filepath)

        return out_path
    except Exception:
        # If anything fails, leave the file as-is
        return filepath

def thumb_path_for(image_path):
    """DIR/NAME.ext -> DIR/thumbs/NAME.ext (works on relative or absolute paths)."""
    if not image_path:
        return ''
    d, name = os.path.split(image_path)
    return os.path.join(d, THUMBS_DIRNAME, name) if d else os.path.join(THUMBS_DIRNAME, name)

def make_thumbnail(image_path, max_dimension=THUMB_MAX_DIM, quality=THUMB_QUALITY):
    """Write DIR/thumbs/NAME.jpg for an image. `image_path` may be absolute or
    project-relative. Returns the project-relative thumbnail path, or '' if the
    thumbnail could not be made."""
    if not PILLOW_AVAILABLE or not image_path:
        return ''
    src = abs_path(image_path)
    if not os.path.isfile(src):
        return ''
    dst = thumb_path_for(src)
    try:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        img = _fit(_open_oriented_rgb(src), max_dimension)
        ext = os.path.splitext(dst)[1].lower()
        if ext in ('.jpg', '.jpeg', ''):
            img.save(dst, 'JPEG', quality=quality, optimize=True)
        elif ext == '.png':
            img.save(dst, 'PNG', optimize=True)
        elif ext == '.webp':
            img.save(dst, 'WEBP', quality=quality)
        else:
            # gif and anything else: store JPEG bytes under the same name; the
            # frontend falls back to the full image if the browser objects.
            img.save(dst, 'JPEG', quality=quality, optimize=True)
        return rel_path(dst)
    except Exception as e:
        print(f"[Thumb] Failed for {image_path}: {e}")
        return ''

def delete_image_file(image_path):
    """Delete an image file and its thumbnail, but only if it really lives
    inside the uploads folder. Root photos (location1-1.jpg) are never deleted."""
    if not image_path:
        return
    # Resolve symlinks/'..' so a path like 'uploads/../data.json' can't escape
    filepath = os.path.realpath(abs_path(image_path))
    uploads_root = os.path.realpath(UPLOAD_FOLDER)
    if not filepath.startswith(uploads_root + os.sep):
        return

    for p in (filepath, thumb_path_for(filepath)):
        if os.path.isfile(p):
            try:
                os.remove(p)
                print(f"[Cleanup] Deleted: {p}")
            except Exception as e:
                print(f"[Cleanup] Failed to delete {p}: {e}")


# ---------------------------------------------------------------------------
# Data file
# ---------------------------------------------------------------------------

def normalize_location_images(loc):
    """Apply the images/image contract to one location, in place.

    - `images` missing: images = [image] if image else []
    - `image` is always a mirror of images[0] (or "" when there are none)
    """
    if not isinstance(loc, dict):
        return loc
    images = loc.get('images')
    if not isinstance(images, list):
        image = loc.get('image') or ''
        images = [image] if isinstance(image, str) and image else []
    images = [i for i in images if isinstance(i, str) and i]
    loc['images'] = images
    loc['image'] = images[0] if images else ''
    return loc

def normalize_data(data):
    """Migrate/normalize the whole dataset in place and return it."""
    if not isinstance(data, dict):
        data = {}
    data.setdefault('categories', [])
    data.setdefault('venues', [])
    for venue in data.get('venues', []) or []:
        for m in venue.get('maps', []) or []:
            for loc in m.get('locations', []) or []:
                normalize_location_images(loc)
    return data

def load_data():
    """Load data from JSON file (normalized per the images contract)."""
    try:
        with open(DATA_FILE, 'r') as f:
            return normalize_data(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"categories": [], "venues": []}

def save_data(data):
    """Save data to JSON file (atomic write, serialized)"""
    normalize_data(data)
    with file_write_lock:
        tmp = DATA_FILE + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(tmp, DATA_FILE)

def with_data(mutator):
    """Run load -> mutator(data) -> save atomically under the file lock.

    The mutator returns whatever the caller wants back (typically a Flask
    response). If it raises, nothing is written."""
    with file_write_lock:
        data = load_data()
        result = mutator(data)
        save_data(data)
        return result

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token or token not in sessions:
            return jsonify({"error": "Session expired"}), 401
        # Check if session is expired (24 hours)
        if sessions[token]['expires'] < datetime.now():
            del sessions[token]
            return jsonify({"error": "Session expired"}), 401
        return f(*args, **kwargs)
    return decorated

def generate_id():
    """Generate a unique ID"""
    return str(uuid.uuid4())[:8]

def get_json_object():
    """Request body as a dict, or None if it isn't a JSON object."""
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------

def static_allowed(filename):
    """Allowlist for files served from the project root."""
    parts = filename.replace('\\', '/').split('/')
    if any(p == '' or p == '..' or p.startswith('.') for p in parts):
        return False
    if parts[0] in STATIC_BLOCKED_DIRS:
        return False
    if filename in STATIC_BLOCKED_FILES:
        return False
    if parts[0] in ('uploads', THUMBS_DIRNAME):
        return True
    ext = parts[-1].rsplit('.', 1)[1].lower() if '.' in parts[-1] else ''
    return ext in STATIC_EXTENSIONS

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    if not static_allowed(filename):
        abort(404)
    return send_from_directory(BASE_DIR, filename)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    if not static_allowed('uploads/' + filename):
        abort(404)
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.after_request
def set_cache_headers(response):
    """Long-lived caching for images, no-cache for HTML/data/sw, 1h for CSS/JS."""
    path = request.path
    if path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
        return response
    if request.method not in ('GET', 'HEAD') or response.status_code != 200:
        return response
    name = path.rsplit('/', 1)[-1]
    ext = name.rsplit('.', 1)[1].lower() if '.' in name else ''
    if ext in IMAGE_EXTENSIONS:
        response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    elif path == '/' or ext == 'html' or name in ('data.json', 'sw.js'):
        response.headers['Cache-Control'] = 'no-cache'
    elif ext in ('css', 'js'):
        response.headers['Cache-Control'] = 'public, max-age=3600'
    return response

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate admin user"""
    data = get_json_object() or {}
    password = data.get('password', '')

    # Rate limit: block an IP after too many recent failures
    ip = request.remote_addr or 'unknown'
    now = datetime.now()
    recent = [t for t in failed_logins.get(ip, [])
              if (now - t).total_seconds() < LOGIN_WINDOW_SECONDS]
    failed_logins[ip] = recent
    if len(recent) >= LOGIN_MAX_FAILURES:
        return jsonify({"success": False, "error": "Too many attempts. Try again later."}), 429

    if ADMIN_PASSWORD_HASH and isinstance(password, str) and check_password_hash(ADMIN_PASSWORD_HASH, password):
        failed_logins.pop(ip, None)
        token = secrets.token_hex(32)
        sessions[token] = {
            'created': datetime.now(),
            'expires': datetime.now() + timedelta(hours=24)
        }
        return jsonify({"success": True, "token": token})

    failed_logins[ip].append(now)
    return jsonify({"success": False, "error": "Invalid password"}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout admin user"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token in sessions:
        del sessions[token]
    return jsonify({"success": True})

@app.route('/api/auth/verify', methods=['GET'])
def verify_auth():
    """Verify if current session is valid"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token and token in sessions and sessions[token]['expires'] > datetime.now():
        return jsonify({"valid": True})
    return jsonify({"valid": False, "error": "Session expired"}), 401


# ---------------------------------------------------------------------------
# Data endpoints
# ---------------------------------------------------------------------------

@app.route('/api/data', methods=['GET'])
@require_auth
def get_data():
    """Get all venue data"""
    return jsonify(load_data())

@app.route('/api/data', methods=['POST'])
@require_auth
def save_all_data():
    """Save all venue data"""
    data = get_json_object()
    if data is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    with file_write_lock:
        save_data(data)
    return jsonify({"success": True})

@app.route('/api/landing-page', methods=['PUT'])
@require_auth
def update_landing_page():
    """Replace only the landingPage key; venues/categories are untouched."""
    landing = get_json_object()
    if landing is None:
        return jsonify({"error": "Expected a JSON object"}), 400

    def mutate(data):
        data['landingPage'] = landing
        return jsonify(landing)
    return with_data(mutate)

# Category endpoints
@app.route('/api/categories', methods=['GET'])
@require_auth
def get_categories():
    """Get all categories"""
    data = load_data()
    return jsonify(data.get('categories', []))

@app.route('/api/categories', methods=['POST'])
@require_auth
def create_category():
    """Create a new category"""
    new_category = get_json_object()
    if new_category is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    new_category['id'] = generate_id()

    def mutate(data):
        data.setdefault('categories', []).append(new_category)
        return jsonify(new_category), 201
    return with_data(mutate)

@app.route('/api/categories/<category_id>', methods=['PUT'])
@require_auth
def update_category(category_id):
    """Update a category"""
    updated = get_json_object()
    if updated is None:
        return jsonify({"error": "Expected a JSON object"}), 400

    def mutate(data):
        for i, cat in enumerate(data.get('categories', [])):
            if cat['id'] == category_id:
                data['categories'][i] = {**cat, **updated, 'id': category_id}
                return jsonify(data['categories'][i])
        return jsonify({"error": "Category not found"}), 404
    return with_data(mutate)

@app.route('/api/categories/<category_id>', methods=['DELETE'])
@require_auth
def delete_category(category_id):
    """Delete a category"""
    def mutate(data):
        data['categories'] = [c for c in data.get('categories', []) if c['id'] != category_id]
        return jsonify({"success": True})
    return with_data(mutate)

# Venue endpoints
@app.route('/api/venues', methods=['GET'])
@require_auth
def get_venues():
    """Get all venues"""
    data = load_data()
    return jsonify(data.get('venues', []))

@app.route('/api/venues', methods=['POST'])
@require_auth
def create_venue():
    """Create a new venue"""
    new_venue = get_json_object()
    if new_venue is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    new_venue['id'] = generate_id()
    new_venue['maps'] = []

    def mutate(data):
        data['venues'].append(new_venue)
        return jsonify(new_venue), 201
    return with_data(mutate)

@app.route('/api/venues/<venue_id>', methods=['PUT'])
@require_auth
def update_venue(venue_id):
    """Update a venue"""
    updated = get_json_object()
    if updated is None:
        return jsonify({"error": "Expected a JSON object"}), 400

    def mutate(data):
        for i, venue in enumerate(data['venues']):
            if venue['id'] == venue_id:
                data['venues'][i] = {**venue, **updated, 'id': venue_id}
                return jsonify(data['venues'][i])
        return jsonify({"error": "Venue not found"}), 404
    return with_data(mutate)

def _delete_map_images(m):
    delete_image_file(m.get('image', ''))
    for loc in m.get('locations', []):
        _delete_location_images(loc)

def _delete_location_images(loc):
    normalize_location_images(loc)
    for img in dict.fromkeys(loc.get('images', []) + [loc.get('image', '')]):
        delete_image_file(img)

@app.route('/api/venues/<venue_id>', methods=['DELETE'])
@require_auth
def delete_venue(venue_id):
    """Delete a venue and all its images"""
    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for m in venue.get('maps', []):
                    _delete_map_images(m)
                break
        data['venues'] = [v for v in data['venues'] if v['id'] != venue_id]
        return jsonify({"success": True})
    return with_data(mutate)

# Map endpoints
@app.route('/api/venues/<venue_id>/maps', methods=['POST'])
@require_auth
def create_map(venue_id):
    """Create a new map for a venue"""
    new_map = get_json_object()
    if new_map is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    new_map['id'] = generate_id()
    new_map['locations'] = []

    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                venue.setdefault('maps', []).append(new_map)
                return jsonify(new_map), 201
        return jsonify({"error": "Venue not found"}), 404
    return with_data(mutate)

@app.route('/api/venues/<venue_id>/maps/<map_id>', methods=['PUT'])
@require_auth
def update_map(venue_id, map_id):
    """Update a map"""
    updated = get_json_object()
    if updated is None:
        return jsonify({"error": "Expected a JSON object"}), 400

    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for i, m in enumerate(venue['maps']):
                    if m['id'] == map_id:
                        venue['maps'][i] = {**m, **updated, 'id': map_id}
                        return jsonify(venue['maps'][i])
        return jsonify({"error": "Map not found"}), 404
    return with_data(mutate)

@app.route('/api/venues/<venue_id>/maps/<map_id>', methods=['DELETE'])
@require_auth
def delete_map(venue_id, map_id):
    """Delete a map and all its images"""
    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for m in venue['maps']:
                    if m['id'] == map_id:
                        _delete_map_images(m)
                        break
                venue['maps'] = [m for m in venue['maps'] if m['id'] != map_id]
                return jsonify({"success": True})
        return jsonify({"error": "Venue not found"}), 404
    return with_data(mutate)

# Location endpoints
def _apply_location_update(loc, updated):
    """Merge a PUT body into a location, honouring the images contract.

    - `images` in the body wins and `image` is derived from it.
    - Legacy clients that send only `image`: a non-empty value replaces the
      cover (images[0]); an empty value removes the cover only.
    """
    merged = {**loc, **updated}
    if 'images' not in updated and 'image' in updated:
        current = [i for i in (loc.get('images') or []) if i]
        new_cover = updated.get('image') or ''
        if not new_cover:
            merged['images'] = current[1:]
        elif current and current[0] == new_cover:
            merged['images'] = current
        else:
            merged['images'] = [new_cover] + [i for i in current[1:] if i != new_cover]
    return normalize_location_images(merged)

@app.route('/api/venues/<venue_id>/maps/<map_id>/locations', methods=['POST'])
@require_auth
def create_location(venue_id, map_id):
    """Create a new location on a map"""
    new_location = get_json_object()
    if new_location is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    new_location['id'] = generate_id()
    normalize_location_images(new_location)

    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for m in venue['maps']:
                    if m['id'] == map_id:
                        # Auto-assign number if not provided
                        if 'number' not in new_location:
                            existing_numbers = [loc.get('number', 0) for loc in m['locations']]
                            new_location['number'] = max(existing_numbers, default=0) + 1
                        m['locations'].append(new_location)
                        return jsonify(new_location), 201
        return jsonify({"error": "Map not found"}), 404
    return with_data(mutate)

@app.route('/api/venues/<venue_id>/maps/<map_id>/locations/<location_id>', methods=['PUT'])
@require_auth
def update_location(venue_id, map_id, location_id):
    """Update a location (accepts `images`; `image` is normalized from it)."""
    updated = get_json_object()
    if updated is None:
        return jsonify({"error": "Expected a JSON object"}), 400
    if 'images' in updated and not isinstance(updated['images'], list):
        return jsonify({"error": "images must be an array"}), 400

    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for m in venue['maps']:
                    if m['id'] == map_id:
                        for i, loc in enumerate(m['locations']):
                            if loc['id'] == location_id:
                                m['locations'][i] = _apply_location_update(loc, {**updated, 'id': location_id})
                                return jsonify(m['locations'][i])
        return jsonify({"error": "Location not found"}), 404
    return with_data(mutate)

@app.route('/api/venues/<venue_id>/maps/<map_id>/locations/<location_id>', methods=['DELETE'])
@require_auth
def delete_location(venue_id, map_id, location_id):
    """Delete a location and its images"""
    def mutate(data):
        for venue in data['venues']:
            if venue['id'] == venue_id:
                for m in venue['maps']:
                    if m['id'] == map_id:
                        for loc in m['locations']:
                            if loc['id'] == location_id:
                                _delete_location_images(loc)
                                break
                        m['locations'] = [loc for loc in m['locations'] if loc['id'] != location_id]
                        return jsonify({"success": True})
        return jsonify({"error": "Location not found"}), 404
    return with_data(mutate)


# ---------------------------------------------------------------------------
# Image upload endpoints
# ---------------------------------------------------------------------------

def _receive_upload(subdir, prefix):
    """Validate request.files['file'] and save it. Returns (abs_path, error_response)."""
    if 'file' not in request.files:
        return None, (jsonify({"error": "No file provided"}), 400)

    file = request.files['file']
    if file.filename == '':
        return None, (jsonify({"error": "No file selected"}), 400)

    if not allowed_file(file.filename):
        return None, (jsonify({"error": "File type not allowed"}), 400)

    ext = file.filename.rsplit('.', 1)[1].lower()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f"{prefix}-{timestamp}-{secrets.token_hex(4)}.{ext}"

    ensure_dirs()
    filepath = os.path.join(UPLOAD_FOLDER, subdir, filename) if subdir else os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)
    return filepath, None

@app.route('/api/upload', methods=['POST'])
@require_auth
def upload_image():
    """Upload a location image. Returns {success, filename, thumbnail}."""
    filepath, err = _receive_upload('', 'location')
    if err:
        return err

    # Compress / resize — phone photos can be 4-6 MB; bring them to ≤1600px
    final_path = compress_image(filepath, max_dimension=FULL_MAX_DIM, quality=FULL_QUALITY)
    thumbnail = make_thumbnail(final_path)

    return jsonify({"success": True, "filename": rel_path(final_path), "thumbnail": thumbnail})

@app.route('/api/upload/map', methods=['POST'])
@require_auth
def upload_map_image():
    """Upload a map image"""
    filepath, err = _receive_upload('maps', 'map')
    if err:
        return err

    # Compress map images too — keep them crisp but not oversized
    final_path = compress_image(filepath, max_dimension=2560, quality=88)

    return jsonify({"success": True, "filename": rel_path(final_path)})

@app.route('/api/upload/<path:filename>', methods=['DELETE'])
@require_auth
def delete_upload(filename):
    """Delete an uploaded image and its thumbnail. Only files inside uploads/."""
    rel = filename.replace('\\', '/')
    if not rel.startswith('uploads/'):
        rel = 'uploads/' + rel
    target = os.path.realpath(abs_path(rel))
    uploads_root = os.path.realpath(UPLOAD_FOLDER)
    if not target.startswith(uploads_root + os.sep):
        return jsonify({"error": "Not an upload"}), 400
    if not os.path.isfile(target):
        return jsonify({"error": "File not found"}), 404
    delete_image_file(rel)
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# HTML Generation endpoint
# ---------------------------------------------------------------------------

@app.route('/api/generate-html', methods=['POST'])
@require_auth
def generate_html():
    """Generate HTML files from data"""
    try:
        with file_write_lock:
            data = load_data()
            categories = data.get('categories', [])
            venues = data.get('venues', [])

            # Load template
            template_path = os.path.join(BASE_DIR, 'templates', 'map-template.html')
            if not os.path.exists(template_path):
                return jsonify({"error": "Template not found"}), 500

            with open(template_path, 'r') as f:
                template = f.read()

            generated_files = []

            for category in categories:
                # Support both old 'category' string and new 'categories' array
                category_venues = []
                for v in venues:
                    venue_categories = v.get('categories', [])
                    # Fallback to legacy 'category' field if 'categories' not present
                    if not venue_categories and v.get('category'):
                        venue_categories = [v.get('category')]
                    if category['id'] in venue_categories:
                        category_venues.append(v)

                # Generate venues HTML (empty string if no venues)
                venues_html = generate_venues_html(category_venues) if category_venues else ''

                # Replace template placeholders
                html = template.replace('{{CATEGORY_NAME}}', category['name'])
                html = html.replace('{{VENUES_CONTENT}}', venues_html)

                # Write to file
                filename = f"{category['slug']}.html"
                with open(os.path.join(BASE_DIR, filename), 'w') as f:
                    f.write(html)

                generated_files.append(filename)

            # Generate index.html from landingPage config
            landing_page = data.get('landingPage', {})
            if landing_page.get('cards'):
                index_html = generate_index_html(landing_page, categories)
                with open(os.path.join(BASE_DIR, 'index.html'), 'w') as f:
                    f.write(index_html)
                generated_files.append('index.html')

        return jsonify({"success": True, "files": generated_files})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def generate_index_html(landing_page, categories):
    """Generate index.html from landingPage config"""
    title = html_escape(landing_page.get('title', 'Athletics Information Hub'))
    cards = landing_page.get('cards', [])

    # Filter visible cards and sort by order
    visible_cards = [c for c in cards if c.get('visible', True)]
    visible_cards.sort(key=lambda x: x.get('order', 0))

    cards_html = ''
    for card in visible_cards:
        # Determine link URL
        if card.get('type') == 'custom':
            href = card.get('url', '#')
        else:
            # Find category slug
            category = next((c for c in categories if c['id'] == card.get('categoryId')), None)
            href = f"{category['slug']}.html" if category else '#'

        cards_html += f'''
            <a href="{html_escape(href)}" class="link-card">
                <div class="card-accent"></div>
                <div class="link-card-content">
                    <h3>{html_escape(card.get('title', ''))}</h3>
                    <p>{html_escape(card.get('description', ''))}</p>
                    <div class="link-button">
                        <span>{html_escape(card.get('buttonText', 'View'))}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M5 12h14M12 5l7 7-7 7"/>
                        </svg>
                    </div>
                </div>
            </a>
'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="icon" href="auburn-logo.png">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --primary-navy: #0C2340;
            --primary-orange: #E87722;
            --primary-orange-dark: #D4531B;
            --background: #f0f2f5;
            --surface: #ffffff;
            --text-primary: #1f2937;
            --text-secondary: #4b5563;
            --border-color: #e5e7eb;
            --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
            --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            --radius-md: 12px;
            --radius-lg: 16px;
        }}

        * {{
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: var(--background);
            color: var(--text-primary);
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            line-height: 1.5;
        }}

        .header {{
            background: linear-gradient(180deg, var(--primary-navy) 0%, #0a1d33 100%);
            color: white;
            padding: 1.25rem 2rem;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            position: sticky;
            top: 0;
            z-index: 100;
        }}

        .header img {{
            height: 50px;
            margin-right: 1rem;
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
        }}

        .header h1 {{
            font-size: 1.75rem;
            font-weight: 700;
            margin: 0;
            letter-spacing: 0.02em;
            color: var(--primary-orange);
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }}

        .main-content {{
            flex-grow: 1;
            padding: 2.5rem 2rem;
            max-width: 1100px;
            margin: 0 auto;
            width: 100%;
        }}

        .page-intro {{
            text-align: center;
            margin-bottom: 2.5rem;
        }}

        .page-intro h2 {{
            color: var(--primary-navy);
            font-size: 1.5rem;
            font-weight: 600;
            margin: 0 0 0.5rem 0;
        }}

        .page-intro p {{
            color: var(--text-secondary);
            margin: 0;
        }}

        .grid-container {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1.5rem;
        }}

        .link-card {{
            background-color: var(--surface);
            border-radius: var(--radius-lg);
            box-shadow: var(--shadow-md);
            overflow: hidden;
            transition: transform 0.25s ease, box-shadow 0.25s ease;
            display: flex;
            flex-direction: column;
            border: 1px solid var(--border-color);
            text-decoration: none;
            position: relative;
        }}

        .link-card:hover {{
            transform: translateY(-6px);
            box-shadow: var(--shadow-xl);
        }}

        .card-accent {{
            height: 4px;
            background: linear-gradient(90deg, var(--primary-orange) 0%, var(--primary-navy) 100%);
        }}

        .link-card-content {{
            padding: 1.75rem;
            flex-grow: 1;
            display: flex;
            flex-direction: column;
        }}

        .link-card-content h3 {{
            font-size: 1.35rem;
            font-weight: 600;
            margin: 0 0 0.75rem 0;
            color: var(--primary-navy);
        }}

        .link-card-content p {{
            font-size: 0.95rem;
            color: var(--text-secondary);
            margin: 0 0 1.5rem 0;
            flex-grow: 1;
            line-height: 1.6;
        }}

        .link-button {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            background: linear-gradient(135deg, var(--primary-orange) 0%, var(--primary-orange-dark) 100%);
            color: white;
            padding: 0.875rem 1.5rem;
            border-radius: var(--radius-md);
            font-weight: 600;
            font-size: 0.9rem;
            transition: all 0.2s ease;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            box-shadow: 0 2px 8px rgba(232, 119, 34, 0.3);
        }}

        .link-card:hover .link-button {{
            background: linear-gradient(135deg, var(--primary-orange-dark) 0%, #c45a15 100%);
            box-shadow: 0 4px 12px rgba(232, 119, 34, 0.4);
        }}

        .link-button svg {{
            transition: transform 0.2s ease;
        }}

        .link-card:hover .link-button svg {{
            transform: translateX(4px);
        }}

        .footer {{
            background: linear-gradient(180deg, var(--primary-navy) 0%, #0a1d33 100%);
            color: #9ca3af;
            text-align: center;
            padding: 1.5rem;
            font-size: 0.875rem;
            margin-top: auto;
        }}

        .footer p {{
            margin: 0;
        }}

        @media (max-width: 768px) {{
            .header {{
                padding: 1rem 1.25rem;
            }}

            .header h1 {{
                font-size: 1.35rem;
            }}

            .header img {{
                height: 40px;
            }}

            .main-content {{
                padding: 1.5rem 1rem;
            }}

            .grid-container {{
                grid-template-columns: 1fr;
            }}
        }}
    </style>
</head>
<body>

    <header class="header">
        <img src="auburn-logo.png" alt="Auburn Logo">
        <h1>{title}</h1>
    </header>

    <main class="main-content">
        <div class="page-intro">
            <h2>Welcome to Auburn Athletics</h2>
            <p>Select a category below to view venue information and maps</p>
        </div>
        <div class="grid-container">
{cards_html}
        </div>
    </main>

    <footer class="footer">
        <p>&copy; <span id="currentYear"></span> Auburn Athletics Department. All rights reserved.</p>
    </footer>

    <script>
        document.getElementById('currentYear').textContent = new Date().getFullYear();
    </script>

</body>
</html>
'''

def generate_venues_html(venues):
    """Generate HTML for venues"""
    html_parts = []

    for venue in venues:
        venue_html = f'''
        <section class="venue" id="{venue['id']}">
            <h2 class="venue-title">{html_escape(venue['name'])}</h2>
            <div class="map-tabs">
        '''

        # Add map tabs
        for i, m in enumerate(venue.get('maps', [])):
            active = 'active' if i == 0 else ''
            venue_html += f'''
                <button class="map-tab {active}" data-map="{m['id']}">{html_escape(m.get('label', ''))}</button>
            '''

        venue_html += '</div><div class="maps-container">'

        # Add maps
        for i, m in enumerate(venue.get('maps', [])):
            active = 'active' if i == 0 else ''
            map_label = html_escape(m.get('label', ''))
            # Maps created without an image (e.g. during the tutorial) must not
            # crash generation — render a placeholder instead of a broken <img>
            if m.get('image'):
                map_image_html = f'<img src="{html_escape(m["image"])}" alt="{map_label}" class="map-image">'
            else:
                map_image_html = '<div class="map-image map-image-placeholder">Map image coming soon</div>'
            venue_html += f'''
            <div class="map-panel {active}" id="{m['id']}">
                <div class="map-container">
                    {map_image_html}
            '''

            # Add location markers with full data attributes
            for loc in m.get('locations', []):
                normalize_location_images(loc)
                pos = loc.get('position', {})
                top = pos.get('top', '0%')
                left = pos.get('left', '0%')
                name = html_escape(loc.get('name', ''))
                description = html_escape(loc.get('description', ''))
                fiber = html_escape(loc.get('fiber', ''))
                image = html_escape(loc.get('image', ''))
                # data-images: JSON array of every photo path, HTML-escaped so the
                # frontend can JSON.parse(el.dataset.images)
                images = html_escape(json.dumps(loc.get('images', [])), quote=True)
                number = loc.get('number', '')
                map_label = html_escape(m.get('label', ''))
                venue_name = html_escape(venue.get('name', ''))
                venue_html += f'''
                    <div class="location-marker" style="top: {top}; left: {left};"
                         data-location-id="{loc['id']}"
                         data-venue-id="{venue['id']}"
                         data-map-id="{m['id']}"
                         data-name="{name}"
                         data-description="{description}"
                         data-fiber="{fiber}"
                         data-image="{image}"
                         data-images="{images}"
                         data-number="{number}"
                         data-venue-name="{venue_name}"
                         data-map-label="{map_label}">
                        <span class="marker-number">{number}</span>
                    </div>
                '''

            venue_html += '''
                </div>
            </div>
            '''

        venue_html += '</div></section>'
        html_parts.append(venue_html)

    return '\n'.join(html_parts)


# ---------------------------------------------------------------------------
# Photo Request endpoints
# ---------------------------------------------------------------------------

@app.route('/api/photo-requests', methods=['POST'])
def create_photo_request():
    """Submit a photo request (public - no auth required)"""
    try:
        # Create request object
        photo_request = {
            'id': f"req-{generate_id()}",
            'locationId': request.form.get('locationId', ''),
            'locationName': request.form.get('locationName', 'Unknown'),
            'venueName': request.form.get('venueName', ''),
            'mapLabel': request.form.get('mapLabel', ''),
            'venueId': request.form.get('venueId', ''),
            'mapId': request.form.get('mapId', ''),
            'requestedAt': datetime.now().isoformat(),
            'status': 'pending',
            'uploadedPhoto': None
        }

        # Handle uploaded photo if present
        if 'photo' in request.files:
            file = request.files['photo']
            if file and file.filename != '' and allowed_file(file.filename):
                ext = file.filename.rsplit('.', 1)[1].lower()
                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                filename = f"request-{timestamp}-{secrets.token_hex(4)}.{ext}"
                ensure_dirs()
                filepath = os.path.join(UPLOAD_FOLDER, 'photo-requests', filename)
                file.save(filepath)
                photo_request['uploadedPhoto'] = f"uploads/photo-requests/{filename}"

        def mutate(data):
            data.setdefault('photoRequests', []).append(photo_request)
            return jsonify({"success": True, "request": photo_request}), 201
        return with_data(mutate)
    except HTTPException:
        raise  # let Flask return the proper status (e.g. 413 for oversized uploads)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/photo-requests', methods=['GET'])
@require_auth
def get_photo_requests():
    """Get all pending photo requests (admin only)"""
    data = load_data()
    requests = data.get('photoRequests', [])
    # Filter to only pending requests
    pending = [r for r in requests if r.get('status') == 'pending']
    return jsonify(pending)

@app.route('/api/photo-requests/<request_id>', methods=['DELETE'])
@require_auth
def dismiss_photo_request(request_id):
    """Dismiss/delete a photo request (admin only)"""
    def mutate(data):
        if 'photoRequests' not in data:
            return jsonify({"error": "Request not found"}), 404

        # Find and remove the request (and its pending photo file)
        original_count = len(data['photoRequests'])
        for r in data['photoRequests']:
            if r['id'] == request_id:
                delete_image_file(r.get('uploadedPhoto') or '')
        data['photoRequests'] = [r for r in data['photoRequests'] if r['id'] != request_id]

        if len(data['photoRequests']) == original_count:
            return jsonify({"error": "Request not found"}), 404
        return jsonify({"success": True})
    return with_data(mutate)

@app.route('/api/photo-requests/<request_id>/approve', methods=['POST'])
@require_auth
def approve_photo_request(request_id):
    """Approve a photo request: the photo is appended to the location's images (admin only)"""
    def mutate(data):
        if 'photoRequests' not in data:
            return jsonify({"error": "Request not found"}), 404

        photo_request = next((r for r in data['photoRequests'] if r['id'] == request_id), None)
        if not photo_request:
            return jsonify({"error": "Request not found"}), 404

        if not photo_request.get('uploadedPhoto'):
            return jsonify({"error": "No photo to approve"}), 400

        venue_id = photo_request.get('venueId')
        map_id = photo_request.get('mapId')
        location_id = photo_request.get('locationId')

        location = None
        for venue in data.get('venues', []):
            if venue['id'] == venue_id:
                for m in venue.get('maps', []):
                    if m['id'] == map_id:
                        for loc in m.get('locations', []):
                            if loc['id'] == location_id:
                                location = loc
                                break

        if location is None:
            return jsonify({"error": "Location not found"}), 404

        # Move the uploaded photo into the regular uploads folder, compress it
        # like a normal upload, and make its thumbnail
        old_path = photo_request['uploadedPhoto']
        new_rel = old_path
        if old_path.startswith('uploads/photo-requests/'):
            ext = old_path.rsplit('.', 1)[1].lower()
            timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
            new_filename = f"location-{timestamp}-{secrets.token_hex(4)}.{ext}"
            old_filepath = abs_path(old_path)
            new_filepath = os.path.join(UPLOAD_FOLDER, new_filename)
            if os.path.exists(old_filepath):
                os.replace(old_filepath, new_filepath)
                new_filepath = compress_image(new_filepath, max_dimension=FULL_MAX_DIM, quality=FULL_QUALITY)
                new_rel = rel_path(new_filepath)
        make_thumbnail(new_rel)

        normalize_location_images(location)
        if new_rel not in location['images']:
            location['images'].append(new_rel)
        normalize_location_images(location)

        # Remove the request from photoRequests
        data['photoRequests'] = [r for r in data['photoRequests'] if r['id'] != request_id]
        return jsonify({"success": True, "message": "Photo added to location", "image": new_rel,
                        "images": location['images']})
    return with_data(mutate)


# ---------------------------------------------------------------------------
# Analytics endpoints
# ---------------------------------------------------------------------------

@app.route('/api/track', methods=['POST'])
def track_pageview():
    """Track a page visit"""
    session_id = request.cookies.get('visitor_id')
    if not session_id:
        session_id = secrets.token_hex(16)

    track_visit(session_id)

    response = jsonify({"success": True})
    # Set cookie for 1 year
    response.set_cookie('visitor_id', session_id, max_age=365*24*60*60, httponly=True, samesite='Lax')
    return response

@app.route('/api/analytics', methods=['GET'])
@require_auth
def get_analytics():
    """Get analytics data (admin only)"""
    analytics = load_analytics()
    daily = analytics.get('daily', {})

    # Get last 30 days
    today = datetime.now()
    last_30_days = []
    for i in range(30):
        date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        day = daily.get(date, {'sessions': 0, 'pageviews': 0})
        last_30_days.append({
            'date': date,
            'sessions': day.get('sessions', 0),
            'pageviews': day.get('pageviews', 0)
        })

    return jsonify({
        'total_sessions': analytics.get('total_sessions', 0),
        'total_pageviews': analytics.get('total_pageviews', 0),
        'last_30_days': last_30_days,
        'today': daily.get(today.strftime('%Y-%m-%d'), {'sessions': 0, 'pageviews': 0})
    })


# ---------------------------------------------------------------------------
# Error handlers: every error is {"error": "..."} with a 4xx/5xx status
# ---------------------------------------------------------------------------

@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 5MB."}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": "Bad request"}), 400

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8081))
    print("=" * 50)
    print("WEP Venue Maps Server")
    print("=" * 50)
    print(f"Server running at: http://0.0.0.0:{port}")
    print(f"Admin page: http://[your-ip]:{port}/admin.html")
    if not ADMIN_PASSWORD_HASH:
        print("WARNING: ADMIN_PASSWORD_HASH not set in .env — admin login is disabled")
    print("=" * 50)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
