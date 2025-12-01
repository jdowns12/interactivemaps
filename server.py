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
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5MB max file size

# Admin password (hashed)
ADMIN_PASSWORD_HASH = hashlib.sha256('VideoProd2020!'.encode()).hexdigest()

# Session storage (in-memory for simplicity)
sessions = {}

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'maps'), exist_ok=True)

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
    """Delete a venue"""
    data = load_data()
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
    """Delete a map"""
    data = load_data()

    for venue in data['venues']:
        if venue['id'] == venue_id:
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
    """Delete a location"""
    data = load_data()

    for venue in data['venues']:
        if venue['id'] == venue_id:
            for m in venue['maps']:
                if m['id'] == map_id:
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
            category_venues = [v for v in venues if v.get('category') == category['id']]

            if not category_venues:
                continue

            # Generate venues HTML
            venues_html = generate_venues_html(category_venues)

            # Replace template placeholders
            html = template.replace('{{CATEGORY_NAME}}', category['name'])
            html = html.replace('{{VENUES_CONTENT}}', venues_html)

            # Write to file
            filename = f"{category['slug']}.html"
            with open(filename, 'w') as f:
                f.write(html)

            generated_files.append(filename)

        return jsonify({"success": True, "files": generated_files})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

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

            # Add location markers
            for loc in m.get('locations', []):
                pos = loc.get('position', {})
                top = pos.get('top', '0%')
                left = pos.get('left', '0%')
                venue_html += f'''
                    <div class="location-marker" style="top: {top}; left: {left};" data-location="{loc['id']}">
                        <span class="marker-number">{loc.get('number', '')}</span>
                    </div>
                '''

            venue_html += '''
                </div>
            </div>
            '''

        venue_html += '</div></section>'
        html_parts.append(venue_html)

    return '\n'.join(html_parts)

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
    print(f"Server running at: http://0.0.0.0:8080")
    print(f"Admin page: http://[your-ip]:8080/admin.html")
    print("=" * 50)
    app.run(host='0.0.0.0', port=8080, debug=True)
