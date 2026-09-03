"""Server tests. Run: .venv/bin/python -m pytest tests -q

Every test that writes runs against temp copies of data.json / uploads; the
real project files are never touched (checked by test_real_files_untouched).
"""
import html
import io
import json
import os
import shutil
import sys

import pytest
from PIL import Image
from werkzeug.security import generate_password_hash

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import server  # noqa: E402

TEST_PASSWORD = 'test-password-123'
TEST_HASH = generate_password_hash(TEST_PASSWORD, method='pbkdf2:sha256:1000')

REAL_FILES = ['data.json', 'analytics.json']
_real_stat = {}


def _snapshot_real_files():
    for name in REAL_FILES:
        p = os.path.join(PROJECT_ROOT, name)
        if os.path.exists(p):
            _real_stat[name] = (os.path.getmtime(p), os.path.getsize(p))
    up = os.path.join(PROJECT_ROOT, 'uploads')
    _real_stat['uploads'] = sorted(os.listdir(up)) if os.path.isdir(up) else []


_snapshot_real_files()


def make_image(path, size=(2000, 1500), fmt='JPEG', color=(200, 90, 30)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.new('RGB', size, color).save(path, fmt)
    return path


def image_bytes(size=(2000, 1500), fmt='PNG'):
    buf = io.BytesIO()
    Image.new('RGB', size, (10, 60, 120)).save(buf, fmt)
    buf.seek(0)
    return buf


SAMPLE_DATA = {
    "categories": [{"id": "cat1", "name": "Fiber", "slug": "Fiber"}],
    "landingPage": {"title": "Hub", "cards": [
        {"id": "c1", "title": "Fiber", "description": "d", "buttonText": "Go",
         "type": "category", "categoryId": "cat1", "visible": True, "order": 0}]},
    "photoRequests": [],
    "venues": [{
        "id": "v1", "name": "Stadium <b>", "categories": ["cat1"],
        "maps": [{
            "id": "m1", "label": "Main", "image": "map1.jpg",
            "locations": [
                # legacy: image only, no images array
                {"id": "l1", "name": "Left \"quoted\"", "number": 1, "image": "location1-1.jpg",
                 "position": {"top": "10%", "left": "20%"}},
                {"id": "l2", "name": "Multi", "number": 2, "image": "location1-2.jpg",
                 "images": ["location1-2.jpg", "uploads/loc-a.jpg"],
                 "position": {"top": "30%", "left": "40%"}},
                {"id": "l3", "name": "Empty", "number": 3, "image": "",
                 "position": {"top": "50%", "left": "60%"}},
            ]
        }]
    }]
}


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    """Point the server at a throwaway project root with its own data.json,
    uploads/, templates/ and a few photos."""
    root = tmp_path / 'proj'
    root.mkdir()
    (root / 'data.json').write_text(json.dumps(SAMPLE_DATA, indent=2))
    (root / 'templates').mkdir()
    shutil.copy(os.path.join(PROJECT_ROOT, 'templates', 'map-template.html'), root / 'templates')
    make_image(str(root / 'location1-1.jpg'), (800, 600))
    make_image(str(root / 'location1-2.jpg'), (800, 600))
    make_image(str(root / 'uploads' / 'loc-a.jpg'), (800, 600))

    monkeypatch.setattr(server, 'BASE_DIR', str(root))
    monkeypatch.setattr(server, 'DATA_FILE', str(root / 'data.json'))
    monkeypatch.setattr(server, 'ANALYTICS_FILE', str(root / 'analytics.json'))
    monkeypatch.setattr(server, 'UPLOAD_FOLDER', str(root / 'uploads'))
    monkeypatch.setattr(server, 'ADMIN_PASSWORD_HASH', TEST_HASH)
    monkeypatch.setattr(server, 'sessions', {})
    monkeypatch.setattr(server, 'failed_logins', {})
    server.ensure_dirs()
    return root


@pytest.fixture
def client(sandbox):
    server.app.config['TESTING'] = True
    return server.app.test_client()


@pytest.fixture
def auth(client):
    r = client.post('/api/auth/login', json={'password': TEST_PASSWORD})
    assert r.status_code == 200, r.get_json()
    return {'Authorization': 'Bearer ' + r.get_json()['token']}


@pytest.fixture
def real_client(monkeypatch):
    """Read-only client against the real project root (static-file tests)."""
    monkeypatch.setattr(server, 'sessions', {})
    monkeypatch.setattr(server, 'ADMIN_PASSWORD_HASH', TEST_HASH)
    server.app.config['TESTING'] = True
    return server.app.test_client()


def read_data(root):
    return json.loads((root / 'data.json').read_text())


def find_location(data, loc_id='l1'):
    for v in data['venues']:
        for m in v['maps']:
            for l in m['locations']:
                if l['id'] == loc_id:
                    return l
    return None


# ---------------------------------------------------------------- auth

@pytest.mark.parametrize('method,path', [
    ('post', '/api/data'),
    ('get', '/api/data'),
    ('put', '/api/landing-page'),
    ('put', '/api/venues/v1/maps/m1/locations/l1'),
    ('post', '/api/venues/v1/maps/m1/locations'),
    ('delete', '/api/venues/v1/maps/m1/locations/l1'),
    ('post', '/api/upload'),
    ('post', '/api/upload/map'),
    ('delete', '/api/upload/loc-a.jpg'),
    ('post', '/api/generate-html'),
    ('post', '/api/photo-requests/req-x/approve'),
    ('get', '/api/analytics'),
])
def test_write_endpoints_require_auth(client, sandbox, method, path):
    before = (sandbox / 'data.json').read_text()
    r = getattr(client, method)(path, json={})
    assert r.status_code == 401
    assert r.get_json() == {'error': 'Session expired'}
    assert (sandbox / 'data.json').read_text() == before


def test_expired_and_bogus_tokens(client):
    r = client.get('/api/data', headers={'Authorization': 'Bearer nope'})
    assert r.status_code == 401 and r.get_json() == {'error': 'Session expired'}


def test_login_wrong_password(client):
    r = client.post('/api/auth/login', json={'password': 'wrong'})
    assert r.status_code == 401
    assert r.get_json()['error']


def test_login_ok_and_verify(client, auth):
    r = client.get('/api/auth/verify', headers=auth)
    assert r.status_code == 200 and r.get_json() == {'valid': True}


# ---------------------------------------------------------------- static allowlist

@pytest.mark.parametrize('path', [
    '/.env', '/server.py', '/.git/config', '/analytics.json', '/tests/test_server.py',
    '/compress_existing_images.py', '/requirements.txt', '/CLAUDE.md', '/start-server.sh',
    '/uploads-backup-2026-07-12.tar.gz', '/.venv/pyvenv.cfg', '/__pycache__/server.cpython-311.pyc',
    '/.env.example', '/uploads/../server.py', '/templates/map-template.html',
])
def test_static_blocklist(real_client, path):
    r = real_client.get(path)
    assert r.status_code == 404, path
    assert r.get_json() == {'error': 'Not found'}


@pytest.mark.parametrize('path', [
    '/', '/Fiber.html', '/style.css', '/script.js', '/data.json', '/manifest.json', '/sw.js',
    '/location1-1.jpg', '/thumbs/location1-1.jpg', '/auburn-logo.png',
])
def test_static_allowlist(real_client, path):
    r = real_client.get(path)
    assert r.status_code == 200, path


def test_uploads_served(real_client):
    uploads = os.path.join(PROJECT_ROOT, 'uploads')
    jpgs = [f for f in os.listdir(uploads) if f.endswith('.jpg')]
    if not jpgs:
        pytest.skip('no uploads on disk')
    r = real_client.get('/uploads/' + jpgs[0])
    assert r.status_code == 200
    assert r.headers['Cache-Control'] == 'public, max-age=31536000, immutable'


def test_static_allowed_helper():
    assert server.static_allowed('Fiber.html')
    assert server.static_allowed('uploads/thumbs/x.jpg')
    assert server.static_allowed('thumbs/location1-1.jpg')
    assert not server.static_allowed('.env')
    assert not server.static_allowed('uploads/.hidden.jpg')
    assert not server.static_allowed('analytics.json')
    assert not server.static_allowed('server.py')
    assert not server.static_allowed('a/../.env')


# ---------------------------------------------------------------- cache headers

@pytest.mark.parametrize('path,expected', [
    ('/location1-1.jpg', 'public, max-age=31536000, immutable'),
    ('/thumbs/location1-1.jpg', 'public, max-age=31536000, immutable'),
    ('/auburn-logo.png', 'public, max-age=31536000, immutable'),
    ('/Fiber.html', 'no-cache'),
    ('/', 'no-cache'),
    ('/data.json', 'no-cache'),
    ('/sw.js', 'no-cache'),
    ('/style.css', 'public, max-age=3600'),
    ('/script.js', 'public, max-age=3600'),
])
def test_cache_headers(real_client, path, expected):
    r = real_client.get(path)
    assert r.status_code == 200
    assert r.headers['Cache-Control'] == expected


# ---------------------------------------------------------------- images contract

def test_load_migrates_images(sandbox):
    data = server.load_data()
    assert find_location(data, 'l1')['images'] == ['location1-1.jpg']
    assert find_location(data, 'l2')['images'] == ['location1-2.jpg', 'uploads/loc-a.jpg']
    assert find_location(data, 'l3')['images'] == []
    assert find_location(data, 'l3')['image'] == ''


def test_get_data_returns_migrated(client, auth):
    data = client.get('/api/data', headers=auth).get_json()
    assert find_location(data, 'l1')['images'] == ['location1-1.jpg']


def test_update_location_normalizes_image_from_images(client, auth, sandbox):
    r = client.put('/api/venues/v1/maps/m1/locations/l1', headers=auth,
                   json={'images': ['uploads/b.jpg', 'uploads/c.jpg'], 'image': 'stale.jpg'})
    assert r.status_code == 200
    body = r.get_json()
    assert body['images'] == ['uploads/b.jpg', 'uploads/c.jpg']
    assert body['image'] == 'uploads/b.jpg'
    saved = find_location(read_data(sandbox), 'l1')
    assert saved['image'] == 'uploads/b.jpg'
    assert saved['images'] == ['uploads/b.jpg', 'uploads/c.jpg']
    assert saved['name'] == 'Left "quoted"'  # untouched fields survive


def test_update_location_empty_images(client, auth, sandbox):
    r = client.put('/api/venues/v1/maps/m1/locations/l2', headers=auth, json={'images': []})
    assert r.status_code == 200
    assert r.get_json()['image'] == '' and r.get_json()['images'] == []


def test_update_location_legacy_image_only_replaces_cover(client, auth, sandbox):
    r = client.put('/api/venues/v1/maps/m1/locations/l2', headers=auth, json={'image': 'uploads/new.jpg'})
    assert r.get_json()['images'] == ['uploads/new.jpg', 'uploads/loc-a.jpg']
    r = client.put('/api/venues/v1/maps/m1/locations/l2', headers=auth, json={'image': ''})
    assert r.get_json()['images'] == ['uploads/loc-a.jpg']
    assert r.get_json()['image'] == 'uploads/loc-a.jpg'


def test_update_location_rejects_non_array_images(client, auth):
    r = client.put('/api/venues/v1/maps/m1/locations/l1', headers=auth, json={'images': 'x.jpg'})
    assert r.status_code == 400 and 'error' in r.get_json()


def test_update_location_not_found(client, auth):
    r = client.put('/api/venues/v1/maps/m1/locations/zzz', headers=auth, json={'name': 'x'})
    assert r.status_code == 404 and r.get_json() == {'error': 'Location not found'}


def test_create_location_normalizes(client, auth, sandbox):
    r = client.post('/api/venues/v1/maps/m1/locations', headers=auth,
                    json={'name': 'New', 'images': ['uploads/x.jpg'], 'position': {'top': '1%', 'left': '2%'}})
    assert r.status_code == 201
    assert r.get_json()['image'] == 'uploads/x.jpg'
    assert r.get_json()['number'] == 4


def test_save_all_data_normalizes(client, auth, sandbox):
    payload = json.loads(json.dumps(SAMPLE_DATA))
    find_location(payload, 'l1')['images'] = ['a.jpg', 'b.jpg']
    find_location(payload, 'l1')['image'] = 'wrong.jpg'
    r = client.post('/api/data', headers=auth, json=payload)
    assert r.status_code == 200
    assert find_location(read_data(sandbox), 'l1')['image'] == 'a.jpg'


# ---------------------------------------------------------------- landing page

def test_landing_page_put_only_touches_landing_page(client, auth, sandbox):
    before = read_data(sandbox)
    new_landing = {'title': 'New Title', 'cards': [{'id': 'c9', 'title': 'X', 'visible': True, 'order': 0}]}
    r = client.put('/api/landing-page', headers=auth, json=new_landing)
    assert r.status_code == 200
    assert r.get_json() == new_landing
    after = read_data(sandbox)
    assert after['landingPage'] == new_landing
    assert after['categories'] == before['categories']
    assert after['photoRequests'] == before['photoRequests']
    # venues are the migrated form of the originals, nothing more
    assert after['venues'] == server.normalize_data(json.loads(json.dumps(before)))['venues']


def test_landing_page_put_rejects_non_object(client, auth):
    r = client.put('/api/landing-page', headers=auth, data='[1,2]', content_type='application/json')
    assert r.status_code == 400 and 'error' in r.get_json()


# ---------------------------------------------------------------- uploads + thumbs

def test_upload_creates_thumbnail(client, auth, sandbox):
    r = client.post('/api/upload', headers=auth,
                    data={'file': (image_bytes((3000, 2000), 'PNG'), 'photo.png')},
                    content_type='multipart/form-data')
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body['success'] is True
    assert body['filename'].startswith('uploads/location-') and body['filename'].endswith('.jpg')
    assert body['thumbnail'] == 'uploads/thumbs/' + os.path.basename(body['filename'])

    full = Image.open(str(sandbox / body['filename']))
    assert max(full.size) <= 1600 and full.format == 'JPEG'
    thumb = Image.open(str(sandbox / body['thumbnail']))
    assert max(thumb.size) <= 480 and thumb.format == 'JPEG'
    assert os.path.getsize(str(sandbox / body['thumbnail'])) < 80 * 1024
    # the original .png is gone (converted to .jpg)
    assert not os.path.exists(str(sandbox / body['filename'][:-4]) + '.png')


def test_upload_rejects_bad_type(client, auth):
    r = client.post('/api/upload', headers=auth,
                    data={'file': (io.BytesIO(b'hi'), 'evil.py')}, content_type='multipart/form-data')
    assert r.status_code == 400 and 'error' in r.get_json()


def test_delete_upload_removes_file_and_thumb(client, auth, sandbox):
    r = client.post('/api/upload', headers=auth,
                    data={'file': (image_bytes(), 'p.jpg')}, content_type='multipart/form-data')
    body = r.get_json()
    full, thumb = sandbox / body['filename'], sandbox / body['thumbnail']
    assert full.exists() and thumb.exists()
    r = client.delete('/api/upload/' + body['filename'], headers=auth)
    assert r.status_code == 200
    assert not full.exists() and not thumb.exists()
    # second delete -> 404
    assert client.delete('/api/upload/' + body['filename'], headers=auth).status_code == 404


def test_delete_upload_cannot_escape_uploads(client, auth, sandbox):
    r = client.delete('/api/upload/../data.json', headers=auth)
    assert r.status_code in (400, 404)
    assert (sandbox / 'data.json').exists()
    r = client.delete('/api/upload/uploads/../location1-1.jpg', headers=auth)
    assert r.status_code in (400, 404)
    assert (sandbox / 'location1-1.jpg').exists()


def test_delete_location_removes_all_upload_images_not_root(client, auth, sandbox):
    thumb = server.make_thumbnail('uploads/loc-a.jpg')
    assert (sandbox / thumb).exists()
    r = client.delete('/api/venues/v1/maps/m1/locations/l2', headers=auth)
    assert r.status_code == 200
    assert not (sandbox / 'uploads' / 'loc-a.jpg').exists()
    assert not (sandbox / thumb).exists()
    assert (sandbox / 'location1-2.jpg').exists()  # root photos are never deleted
    assert find_location(read_data(sandbox), 'l2') is None


def test_thumb_path_for():
    assert server.thumb_path_for('location1-1.jpg') == 'thumbs/location1-1.jpg'
    assert server.thumb_path_for('uploads/x.jpg') == 'uploads/thumbs/x.jpg'
    assert server.thumb_path_for('') == ''


def test_make_thumbnail_missing_source(sandbox):
    assert server.make_thumbnail('nope.jpg') == ''


# ---------------------------------------------------------------- generate-html

def test_generate_html_emits_data_images(client, auth, sandbox):
    r = client.post('/api/generate-html', headers=auth)
    assert r.status_code == 200, r.get_json()
    assert 'Fiber.html' in r.get_json()['files']
    page = (sandbox / 'Fiber.html').read_text()
    assert 'data-images=' in page

    import re
    markers = re.findall(r'<div class="location-marker"(.*?)>', page, re.S)
    assert len(markers) == 3
    parsed = {}
    for m in markers:
        loc_id = re.search(r'data-location-id="([^"]*)"', m).group(1)
        raw = re.search(r'data-images="([^"]*)"', m).group(1)
        parsed[loc_id] = json.loads(html.unescape(raw))
        cover = re.search(r'data-image="([^"]*)"', m).group(1)
        parsed[loc_id + '_cover'] = html.unescape(cover)
    assert parsed['l1'] == ['location1-1.jpg']
    assert parsed['l2'] == ['location1-2.jpg', 'uploads/loc-a.jpg']
    assert parsed['l3'] == [] and parsed['l3_cover'] == ''
    assert parsed['l2_cover'] == 'location1-2.jpg'
    # quotes were escaped, never raw, inside the attribute
    assert 'data-images="[&quot;' in page
    assert 'Stadium &lt;b&gt;' in page
    assert (sandbox / 'index.html').exists()


# ---------------------------------------------------------------- photo requests

def test_approve_photo_request_appends_image(client, auth, sandbox):
    r = client.post('/api/photo-requests',
                    data={'locationId': 'l2', 'venueId': 'v1', 'mapId': 'm1', 'locationName': 'Multi',
                          'photo': (image_bytes(), 'req.jpg')},
                    content_type='multipart/form-data')
    assert r.status_code == 201, r.get_json()
    req = r.get_json()['request']
    assert req['uploadedPhoto'].startswith('uploads/photo-requests/')

    r = client.post(f"/api/photo-requests/{req['id']}/approve", headers=auth)
    assert r.status_code == 200, r.get_json()
    loc = find_location(read_data(sandbox), 'l2')
    assert len(loc['images']) == 3
    assert loc['images'][0] == 'location1-2.jpg'
    new = loc['images'][2]
    assert new.startswith('uploads/location-') and (sandbox / new).exists()
    assert (sandbox / server.thumb_path_for(new)).exists()
    assert read_data(sandbox)['photoRequests'] == []


# ---------------------------------------------------------------- errors

def test_404_is_json(client):
    r = client.get('/api/does-not-exist')
    assert r.status_code == 404 and r.get_json() == {'error': 'Not found'}


def test_health(client):
    assert client.get('/api/health').get_json() == {'ok': True}


def test_real_files_untouched():
    """Must run last: nothing above may have written to the real project files."""
    for name in REAL_FILES:
        p = os.path.join(PROJECT_ROOT, name)
        if name in _real_stat:
            assert (os.path.getmtime(p), os.path.getsize(p)) == _real_stat[name], name
    up = os.path.join(PROJECT_ROOT, 'uploads')
    assert (sorted(os.listdir(up)) if os.path.isdir(up) else []) == _real_stat['uploads']
