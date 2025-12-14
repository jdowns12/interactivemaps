#!/usr/bin/env python3
"""
WEP Venue Maps - Flask Backend Server
Provides API endpoints for the admin editor
"""

import os
import json
import uuid
import hashlib
import secrets
from html import escape as html_escape
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session
from flask_cors import CORS
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = secrets.token_hex(32)
CORS(app, supports_credentials=True)

# Configuration
DATA_FILE = 'data.json'
UPLOAD_FOLDER = 'uploads'
ANALYTICS_FILE = 'analytics.json'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB max file size

# Admin password (hashed)
ADMIN_PASSWORD_HASH = hashlib.sha256('VideoProd2020!'.encode()).hexdigest()

# Session storage (in-memory for simplicity)
sessions = {}

# Analytics - track unique sessions per day
visitor_sessions = set()  # Track session IDs seen today
last_analytics_date = None

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'maps'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'photo-requests'), exist_ok=True)

def load_analytics():
    """Load analytics data from JSON file"""
    try:
        with open(ANALYTICS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"daily": {}, "total_sessions": 0, "total_pageviews": 0}

def save_analytics(data):
    """Save analytics data to JSON file"""
    with open(ANALYTICS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def track_visit(session_id):
    """Track a page visit"""
    global visitor_sessions, last_analytics_date

    today = datetime.now().strftime('%Y-%m-%d')
    analytics = load_analytics()

    # Reset daily sessions if it's a new day
    if last_analytics_date != today:
        visitor_sessions = set()
        last_analytics_date = today

    # Initialize today's stats if needed
    if today not in analytics['daily']:
        analytics['daily'][today] = {'sessions': 0, 'pageviews': 0}

    # Track pageview
    analytics['daily'][today]['pageviews'] += 1
    analytics['total_pageviews'] += 1

    # Track unique session
    if session_id and session_id not in visitor_sessions:
        visitor_sessions.add(session_id)
        analytics['daily'][today]['sessions'] += 1
        analytics['total_sessions'] += 1

    save_analytics(analytics)
    return analytics

# Helper functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def load_data():
    """Load data from JSON file"""
    try:
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"categories": [], "venues": []}
    except json.JSONDecodeError:
        return {"categories": [], "venues": []}

def save_data(data):
    """Save data to JSON file"""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def require_auth(f):
    """Decorator to require authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization', '').replace('Bearer ', '')
        if not token or token not in sessions:
            return jsonify({"error": "Unauthorized"}), 401
        # Check if session is expired (24 hours)
        if sessions[token]['expires'] < datetime.now():
            del sessions[token]
            return jsonify({"error": "Session expired"}), 401
        return f(*args, **kwargs)
    return decorated

def generate_id():
    """Generate a unique ID"""
    return str(uuid.uuid4())[:8]

def delete_image_file(image_path):
    """Delete an image file if it exists"""
    if not image_path:
        return
    # Handle both 'uploads/file.jpg' and 'file.jpg' formats
    if image_path.startswith('uploads/'):
        filepath = image_path
    else:
        filepath = image_path

    # Make sure we're only deleting from uploads folder
    if os.path.exists(filepath) and 'uploads' in filepath:
        try:
            os.remove(filepath)
            print(f"[Cleanup] Deleted: {filepath}")
        except Exception as e:
            print(f"[Cleanup] Failed to delete {filepath}: {e}")

# Static file routes
@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('.', filename)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# Authentication endpoints
@app.route('/api/auth/login', methods=['POST'])
def login():
    """Authenticate admin user"""
    data = request.get_json()
    password = data.get('password', '')

    if hashlib.sha256(password.encode()).hexdigest() == ADMIN_PASSWORD_HASH:
        token = secrets.token_hex(32)
        sessions[token] = {
            'created': datetime.now(),
            'expires': datetime.now() + timedelta(hours=24)
        }
        return jsonify({"success": True, "token": token})

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
    return jsonify({"valid": False}), 401

# Data endpoints
@app.route('/api/data', methods=['GET'])
@require_auth
def get_data():
    """Get all venue data"""
    return jsonify(load_data())

@app.route('/api/data', methods=['POST'])
@require_auth
def save_all_data():
    """Save all venue data"""
    data = request.get_json()
    save_data(data)
    return jsonify({"success": True})

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
    data = load_data()
    new_category = request.get_json()
    new_category['id'] = generate_id()

    if 'categories' not in data:
        data['categories'] = []

    data['categories'].append(new_category)
    save_data(data)
    return jsonify(new_category), 201

@app.route('/api/categories/<category_id>', methods=['PUT'])
@require_auth
def update_category(category_id):
    """Update a category"""
    data = load_data()
    updated = request.get_json()

    for i, cat in enumerate(data.get('categories', [])):
        if cat['id'] == category_id:
            data['categories'][i] = {**cat, **updated}
            save_data(data)
            return jsonify(data['categories'][i])

    return jsonify({"error": "Category not found"}), 404

@app.route('/api/categories/<category_id>', methods=['DELETE'])
@require_auth
def delete_category(category_id):
    """Delete a category"""
    data = load_data()
    data['categories'] = [c for c in data.get('categories', []) if c['id'] != category_id]
    save_data(data)
    return jsonify({"success": True})

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
    data = load_data()
    new_venue = request.get_json()
    new_venue['id'] = generate_id()
    new_venue['maps'] = []

    data['venues'].append(new_venue)
    save_data(data)
    return jsonify(new_venue), 201

@app.route('/api/venues/<venue_id>', methods=['PUT'])
@require_auth
def update_venue(venue_id):
    """Update a venue"""
    data = load_data()
    updated = request.get_json()

    for i, venue in enumerate(data['venues']):
        if venue['id'] == venue_id:
            data['venues'][i] = {**venue, **updated}
            save_data(data)
            return jsonify(data['venues'][i])

    return jsonify({"error": "Venue not found"}), 404

@app.route('/api/venues/<venue_id>', methods=['DELETE'])
@require_auth
def delete_venue(venue_id):
    """Delete a venue and all its images"""
    data = load_data()

    # Find venue and delete all associated images
    for venue in data['venues']:
        if venue['id'] == venue_id:
            for m in venue.get('maps', []):
                # Delete map image
                delete_image_file(m.get('image', ''))
                # Delete all location images
                for loc in m.get('locations', []):
                    delete_image_file(loc.get('image', ''))
            break

    data['venues'] = [v for v in data['venues'] if v['id'] != venue_id]
    save_data(data)
    return jsonify({"success": True})

# Map endpoints
@app.route('/api/venues/<venue_id>/maps', methods=['POST'])
@require_auth
def create_map(venue_id):
    """Create a new map for a venue"""
    data = load_data()
    new_map = request.get_json()
    new_map['id'] = generate_id()
    new_map['locations'] = []

    for venue in data['venues']:
        if venue['id'] == venue_id:
            venue['maps'].append(new_map)
            save_data(data)
            return jsonify(new_map), 201

    return jsonify({"error": "Venue not found"}), 404

@app.route('/api/venues/<venue_id>/maps/<map_id>', methods=['PUT'])
@require_auth
def update_map(venue_id, map_id):
    """Update a map"""
    data = load_data()
    updated = request.get_json()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            for i, m in enumerate(venue['maps']):
                if m['id'] == map_id:
                    venue['maps'][i] = {**m, **updated}
                    save_data(data)
                    return jsonify(venue['maps'][i])

    return jsonify({"error": "Map not found"}), 404

@app.route('/api/venues/<venue_id>/maps/<map_id>', methods=['DELETE'])
@require_auth
def delete_map(venue_id, map_id):
    """Delete a map and all its images"""
    data = load_data()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            # Find the map and delete its images
            for m in venue['maps']:
                if m['id'] == map_id:
                    # Delete map image
                    delete_image_file(m.get('image', ''))
                    # Delete all location images
                    for loc in m.get('locations', []):
                        delete_image_file(loc.get('image', ''))
                    break
            venue['maps'] = [m for m in venue['maps'] if m['id'] != map_id]
            save_data(data)
            return jsonify({"success": True})

    return jsonify({"error": "Venue not found"}), 404

# Location endpoints
@app.route('/api/venues/<venue_id>/maps/<map_id>/locations', methods=['POST'])
@require_auth
def create_location(venue_id, map_id):
    """Create a new location on a map"""
    data = load_data()
    new_location = request.get_json()
    new_location['id'] = generate_id()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            for m in venue['maps']:
                if m['id'] == map_id:
                    # Auto-assign number if not provided
                    if 'number' not in new_location:
                        existing_numbers = [loc.get('number', 0) for loc in m['locations']]
                        new_location['number'] = max(existing_numbers, default=0) + 1
                    m['locations'].append(new_location)
                    save_data(data)
                    return jsonify(new_location), 201

    return jsonify({"error": "Map not found"}), 404

@app.route('/api/venues/<venue_id>/maps/<map_id>/locations/<location_id>', methods=['PUT'])
@require_auth
def update_location(venue_id, map_id, location_id):
    """Update a location"""
    data = load_data()
    updated = request.get_json()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            for m in venue['maps']:
                if m['id'] == map_id:
                    for i, loc in enumerate(m['locations']):
                        if loc['id'] == location_id:
                            m['locations'][i] = {**loc, **updated}
                            save_data(data)
                            return jsonify(m['locations'][i])

    return jsonify({"error": "Location not found"}), 404

@app.route('/api/venues/<venue_id>/maps/<map_id>/locations/<location_id>', methods=['DELETE'])
@require_auth
def delete_location(venue_id, map_id, location_id):
    """Delete a location and its image"""
    data = load_data()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            for m in venue['maps']:
                if m['id'] == map_id:
                    # Find and delete the location's image
                    for loc in m['locations']:
                        if loc['id'] == location_id:
                            delete_image_file(loc.get('image', ''))
                            break
                    m['locations'] = [loc for loc in m['locations'] if loc['id'] != location_id]
                    save_data(data)
                    return jsonify({"success": True})

    return jsonify({"error": "Location not found"}), 404

# Image upload endpoints
@app.route('/api/upload', methods=['POST'])
@require_auth
def upload_image():
    """Upload a location image"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    # Generate unique filename
    ext = file.filename.rsplit('.', 1)[1].lower()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f"location-{timestamp}-{secrets.token_hex(4)}.{ext}"

    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    return jsonify({"success": True, "filename": f"uploads/{filename}"})

@app.route('/api/upload/map', methods=['POST'])
@require_auth
def upload_map_image():
    """Upload a map image"""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    # Generate unique filename
    ext = file.filename.rsplit('.', 1)[1].lower()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f"map-{timestamp}-{secrets.token_hex(4)}.{ext}"

    filepath = os.path.join(UPLOAD_FOLDER, 'maps', filename)
    file.save(filepath)

    return jsonify({"success": True, "filename": f"uploads/maps/{filename}"})

# HTML Generation endpoint
@app.route('/api/generate-html', methods=['POST'])
@require_auth
def generate_html():
    """Generate HTML files from data"""
    try:
        data = load_data()
        categories = data.get('categories', [])
        venues = data.get('venues', [])

        # Load template
        template_path = 'templates/map-template.html'
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
            with open(filename, 'w') as f:
                f.write(html)

            generated_files.append(filename)

        # Generate index.html from landingPage config
        landing_page = data.get('landingPage', {})
        if landing_page.get('cards'):
            index_html = generate_index_html(landing_page, categories)
            with open('index.html', 'w') as f:
                f.write(index_html)
            generated_files.append('index.html')

        return jsonify({"success": True, "files": generated_files})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def generate_index_html(landing_page, categories):
    """Generate index.html from landingPage config"""
    title = landing_page.get('title', 'Athletics Information Hub')
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
            <a href="{href}" class="link-card">
                <div class="card-accent"></div>
                <div class="link-card-content">
                    <h3>{card.get('title', '')}</h3>
                    <p>{card.get('description', '')}</p>
                    <div class="link-button">
                        <span>{card.get('buttonText', 'View')}</span>
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
            <h2 class="venue-title">{venue['name']}</h2>
            <div class="map-tabs">
        '''

        # Add map tabs
        for i, m in enumerate(venue.get('maps', [])):
            active = 'active' if i == 0 else ''
            venue_html += f'''
                <button class="map-tab {active}" data-map="{m['id']}">{m['label']}</button>
            '''

        venue_html += '</div><div class="maps-container">'

        # Add maps
        for i, m in enumerate(venue.get('maps', [])):
            active = 'active' if i == 0 else ''
            venue_html += f'''
            <div class="map-panel {active}" id="{m['id']}">
                <div class="map-container">
                    <img src="{m['image']}" alt="{m['label']}" class="map-image">
            '''

            # Add location markers with full data attributes
            for loc in m.get('locations', []):
                pos = loc.get('position', {})
                top = pos.get('top', '0%')
                left = pos.get('left', '0%')
                name = html_escape(loc.get('name', ''))
                description = html_escape(loc.get('description', ''))
                fiber = html_escape(loc.get('fiber', ''))
                image = loc.get('image', '')
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

# Photo Request endpoints
@app.route('/api/photo-requests', methods=['POST'])
def create_photo_request():
    """Submit a photo request (public - no auth required)"""
    try:
        data = load_data()

        # Initialize photoRequests if not exists
        if 'photoRequests' not in data:
            data['photoRequests'] = []

        # Get form data
        location_id = request.form.get('locationId', '')
        location_name = request.form.get('locationName', 'Unknown')
        venue_name = request.form.get('venueName', '')
        map_label = request.form.get('mapLabel', '')
        venue_id = request.form.get('venueId', '')
        map_id = request.form.get('mapId', '')

        # Create request object
        photo_request = {
            'id': f"req-{generate_id()}",
            'locationId': location_id,
            'locationName': location_name,
            'venueName': venue_name,
            'mapLabel': map_label,
            'venueId': venue_id,
            'mapId': map_id,
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
                filepath = os.path.join(UPLOAD_FOLDER, 'photo-requests', filename)
                file.save(filepath)
                photo_request['uploadedPhoto'] = f"uploads/photo-requests/{filename}"

        data['photoRequests'].append(photo_request)
        save_data(data)

        return jsonify({"success": True, "request": photo_request}), 201
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
    data = load_data()

    if 'photoRequests' not in data:
        return jsonify({"error": "Request not found"}), 404

    # Find and remove the request
    original_count = len(data['photoRequests'])
    data['photoRequests'] = [r for r in data['photoRequests'] if r['id'] != request_id]

    if len(data['photoRequests']) == original_count:
        return jsonify({"error": "Request not found"}), 404

    save_data(data)
    return jsonify({"success": True})

@app.route('/api/photo-requests/<request_id>/approve', methods=['POST'])
@require_auth
def approve_photo_request(request_id):
    """Approve a photo request and add the photo to the location (admin only)"""
    data = load_data()

    if 'photoRequests' not in data:
        return jsonify({"error": "Request not found"}), 404

    # Find the request
    photo_request = None
    for r in data['photoRequests']:
        if r['id'] == request_id:
            photo_request = r
            break

    if not photo_request:
        return jsonify({"error": "Request not found"}), 404

    if not photo_request.get('uploadedPhoto'):
        return jsonify({"error": "No photo to approve"}), 400

    # Find the location and update its image
    venue_id = photo_request.get('venueId')
    map_id = photo_request.get('mapId')
    location_id = photo_request.get('locationId')

    location_found = False
    for venue in data.get('venues', []):
        if venue['id'] == venue_id:
            for m in venue.get('maps', []):
                if m['id'] == map_id:
                    for loc in m.get('locations', []):
                        if loc['id'] == location_id:
                            # Move the uploaded photo to regular uploads folder
                            old_path = photo_request['uploadedPhoto']
                            if old_path.startswith('uploads/photo-requests/'):
                                # Generate new filename
                                ext = old_path.rsplit('.', 1)[1].lower()
                                timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
                                new_filename = f"location-{timestamp}-{secrets.token_hex(4)}.{ext}"
                                old_filepath = os.path.join('.', old_path)
                                new_filepath = os.path.join(UPLOAD_FOLDER, new_filename)

                                # Move file
                                if os.path.exists(old_filepath):
                                    os.rename(old_filepath, new_filepath)
                                    loc['image'] = f"uploads/{new_filename}"
                                else:
                                    loc['image'] = old_path
                            else:
                                loc['image'] = old_path

                            location_found = True
                            break

    if not location_found:
        return jsonify({"error": "Location not found"}), 404

    # Remove the request from photoRequests
    data['photoRequests'] = [r for r in data['photoRequests'] if r['id'] != request_id]

    save_data(data)
    return jsonify({"success": True, "message": "Photo added to location"})


# Analytics tracking endpoint (called from frontend)
@app.route('/api/track', methods=['POST'])
def track_pageview():
    """Track a page visit"""
    session_id = request.cookies.get('visitor_id')
    if not session_id:
        session_id = secrets.token_hex(16)

    page = request.json.get('page', '/') if request.is_json else '/'
    track_visit(session_id)

    response = jsonify({"success": True})
    # Set cookie for 1 year
    response.set_cookie('visitor_id', session_id, max_age=365*24*60*60, httponly=True, samesite='Lax')
    return response

# Get analytics data (admin only)
@app.route('/api/analytics', methods=['GET'])
@require_auth
def get_analytics():
    """Get analytics data"""
    analytics = load_analytics()

    # Get last 30 days
    today = datetime.now()
    last_30_days = []
    for i in range(30):
        date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        if date in analytics['daily']:
            last_30_days.append({
                'date': date,
                'sessions': analytics['daily'][date]['sessions'],
                'pageviews': analytics['daily'][date]['pageviews']
            })
        else:
            last_30_days.append({
                'date': date,
                'sessions': 0,
                'pageviews': 0
            })

    return jsonify({
        'total_sessions': analytics['total_sessions'],
        'total_pageviews': analytics['total_pageviews'],
        'last_30_days': last_30_days,
        'today': analytics['daily'].get(today.strftime('%Y-%m-%d'), {'sessions': 0, 'pageviews': 0})
    })

# Error handlers
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 5MB."}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("WEP Venue Maps Server")
    print("=" * 50)
    print(f"Server running at: http://0.0.0.0:8081")
    print(f"Admin page: http://[your-ip]:8081/admin.html")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8081, debug=False)
