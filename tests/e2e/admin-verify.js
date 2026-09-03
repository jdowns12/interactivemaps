// Admin workflow verification (Track D). Rerun with:
//   node admin-verify.js [desk|mob] [baseUrl]
// Screenshots: av-<size>-<step>.png in this directory; results in av-results-<size>.json
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require('/home/jadondowns/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const DIR = __dirname;
const BASE = process.argv[3] || 'http://127.0.0.1:8092';
const SIZES = {
    desk: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false },
    mob: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};
const which = process.argv[2] ? [process.argv[2]] : ['desk', 'mob'];
const PHOTOS = [1, 2, 3].map(i => path.join(DIR, `av-photo-${i}.jpg`));
const TAG = 'AV' + Date.now().toString(36).slice(-4);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run(size) {
    const cfg = SIZES[size];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ...cfg, permissions: [] });
    const page = await context.newPage();
    const results = [];
    let stepNo = 0;
    let errors = [];
    const pushErr = (kind, text) => { errors.push(`${kind}: ${text}`); };
    page.on('pageerror', e => pushErr('pageerror', e.message));
    page.on('console', m => { if (m.type() === 'error') pushErr('console.error', m.text()); });
    page.on('response', r => { if (r.status() >= 400) pushErr('http', `${r.status()} ${r.request().method()} ${r.url()}`); });
    page.on('dialog', d => d.accept());

    const shot = async (name) => {
        const file = path.join(DIR, `av-${size}-${String(stepNo).padStart(2, '0')}-${name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        return file;
    };
    const step = async (name, fn) => {
        stepNo++;
        errors = [];
        const rec = { step: `${stepNo}-${name}`, passed: true, detail: '', errors: [], screenshot: '' };
        try {
            const detail = await fn();
            rec.detail = detail || 'ok';
        } catch (e) {
            rec.passed = false;
            rec.detail = e.message.split('\n')[0];
        }
        await sleep(200);
        try { rec.screenshot = await shot(name); } catch (e) { rec.detail += ` (screenshot failed: ${e.message})`; }
        if (errors.length) { rec.errors = errors.slice(); rec.passed = false; }
        results.push(rec);
        console.log(`[${size}] ${rec.passed ? 'PASS' : 'FAIL'} ${rec.step}: ${rec.detail}${rec.errors.length ? ' | ' + rec.errors.join(' ; ') : ''}`);
    };
    const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
    const isVisible = (sel) => page.evaluate((s) => {
        const el = document.querySelector(s);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }, sel);
    const waitText = async (sel, re, ms = 6000) => {
        const t0 = Date.now();
        let txt = '';
        while (Date.now() - t0 < ms) {
            txt = await page.evaluate((s) => document.querySelector(s)?.textContent || '', sel);
            if (re.test(txt)) return txt;
            await sleep(150);
        }
        throw new Error(`Timed out waiting for ${sel} to match ${re}; got "${txt.trim()}"`);
    };
    const openDrawer = async () => {
        if (!cfg.isMobile) return;
        const open = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
        if (!open) { await page.click('#sidebar-menu-btn'); await sleep(350); }
    };
    const closeDrawer = async () => {
        if (!cfg.isMobile) return;
        await page.evaluate(() => { if (typeof Admin !== 'undefined') Admin.closeDrawer(); });
        await sleep(300);
    };
    const canvasPoint = async (fx, fy) => {
        const box = await page.locator('#map-canvas').boundingBox();
        return { x: box.x + box.width * fx, y: box.y + box.height * fy };
    };
    const tapOrClick = async (x, y) => {
        if (cfg.hasTouch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
    };
    // Synthetic two-finger pinch on #map-viewport (Playwright has no pinch API)
    const pinch = async (fromDist, toDist) => {
        return page.evaluate(({ fromDist, toDist }) => {
            const vp = document.getElementById('map-viewport');
            const r = vp.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const mk = (type, pts) => {
                const touches = pts.map((p, i) => new Touch({ identifier: i, target: vp, clientX: p.x, clientY: p.y, pageX: p.x + scrollX, pageY: p.y + scrollY, screenX: p.x, screenY: p.y }));
                const ev = new TouchEvent(type, {
                    touches: type === 'touchend' ? [] : touches,
                    targetTouches: type === 'touchend' ? [] : touches,
                    changedTouches: touches, bubbles: true, cancelable: true
                });
                vp.dispatchEvent(ev);
            };
            const pts = (d) => [{ x: cx - d / 2, y: cy }, { x: cx + d / 2, y: cy }];
            mk('touchstart', pts(fromDist));
            const steps = 6;
            for (let i = 1; i <= steps; i++) mk('touchmove', pts(fromDist + (toDist - fromDist) * i / steps));
            mk('touchend', pts(toDist));
            return true;
        }, { fromDist, toDist });
    };
    const tourState = () => page.evaluate(() => {
        const s = Tutorial.steps[Tutorial.currentStep];
        const pop = document.querySelector('.tutorial-popover');
        let target = null;
        try { target = s.targetFn ? s.targetFn() : (s.target ? document.querySelector(s.target) : null); } catch (e) { target = null; }
        return {
            id: s.id, type: s.type, title: s.title, index: Tutorial.currentStep, active: Tutorial.active,
            targetExists: !!target, targetVisible: !!(target && target.getBoundingClientRect().width > 0),
            fallback: pop.classList.contains('fullscreen-mode'),
            nextVisible: getComputedStyle(pop.querySelector('.tutorial-next')).display !== 'none'
        };
    });

    let locIds = [];
    let categoryName = `${TAG} Category ${size}`;
    let venueName = `${TAG} Venue ${size}`;
    let mapLabel = `${TAG} Map ${size}`;
    let cardTitle = `${TAG} Card ${size}`;

    // ---------------------------------------------------------------- login
    await step('login', async () => {
        await page.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle' });
        await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
        await page.reload({ waitUntil: 'networkidle' });
        assert(await isVisible('#login-screen'), 'login screen not visible');
        await page.fill('#password', 'preview123');
        await page.click('#login-form button[type="submit"]');
        await page.waitForSelector('#admin-dashboard:not(.hidden)', { timeout: 8000 });
        await page.waitForSelector('#nav-tree .tree-category', { timeout: 8000 });
        await sleep(600);
        assert(!(await isVisible('#login-screen')), 'login screen still visible after login');
        return 'logged in through the real form';
    });

    await step('dashboard-layout', async () => {
        const sidebarVisible = await isVisible('#sidebar');
        const menuVisible = await isVisible('#sidebar-menu-btn');
        if (cfg.isMobile) {
            assert(!sidebarVisible || await page.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().right <= 0), 'sidebar should be off-canvas on phone');
            assert(menuVisible, 'menu button should be visible on phone');
        } else {
            assert(sidebarVisible, 'sidebar should be visible on desktop');
            assert(!menuVisible, 'menu button should be hidden on desktop');
            const landingExpanded = await page.evaluate(() => document.querySelector('.landing-page-section').classList.contains('expanded'));
            assert(!landingExpanded, 'Landing Page section should start collapsed on desktop');
        }
        // Delete Map must not be in the editor header; only inside the map modal
        const headerHasDelete = await page.evaluate(() => {
            const header = document.querySelector('#map-editor .editor-header, #map-editor header, .map-editor-header');
            const scope = header || document.getElementById('map-editor');
            return !!scope && [...scope.querySelectorAll('button')].some(b => /delete map/i.test(b.textContent));
        });
        assert(!headerHasDelete, 'Delete Map button still present in editor header');
        const deleteInModal = await page.evaluate(() => !!document.querySelector('#map-modal #delete-map-btn'));
        assert(deleteInModal, '#delete-map-btn not inside #map-modal');
        const strip = await page.evaluate(() => document.getElementById('publish-status-text')?.textContent || '');
        assert(!/Checking/.test(strip), `status strip stuck on "${strip}"`);
        return `sidebar ok; delete-map only in modal; strip="${strip.trim()}"`;
    });

    // -------------------------------------------------------------- drawer
    if (cfg.isMobile) {
        await step('drawer-open', async () => {
            await page.click('#sidebar-menu-btn');
            await sleep(400);
            const open = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
            assert(open, 'sidebar did not get .open');
            const left = await page.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().left);
            assert(Math.abs(left) < 2, `drawer left=${left}`);
            assert(await isVisible('#sidebar-scrim'), 'scrim not visible');
            assert(await page.evaluate(() => document.getElementById('sidebar-menu-btn').getAttribute('aria-expanded') === 'true'), 'aria-expanded not true');
            return 'drawer opened with scrim';
        });
        await step('drawer-close-scrim', async () => {
            await page.click('#sidebar-scrim', { position: { x: 380, y: 400 } });
            await sleep(400);
            const open = await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'));
            assert(!open, 'sidebar still open after scrim tap');
            await page.click('#sidebar-menu-btn');
            await sleep(400);
            await page.click('#sidebar-close-btn');
            await sleep(400);
            assert(!(await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'))), 'sidebar still open after close button');
            return 'scrim and close button both close the drawer';
        });
    }

    // ----------------------------------------------------- category/venue/map
    await step('create-category', async () => {
        await openDrawer();
        await page.click('#add-category-btn');
        await page.waitForSelector('#category-modal:not(.hidden)');
        assert(!(await isVisible('#delete-category-btn')), 'delete-category button visible in Create modal');
        await page.fill('#category-name', categoryName);
        await page.click('#category-form button[type="submit"]');
        await page.waitForSelector('#category-modal.hidden', { state: 'attached' });
        await page.waitForFunction((n) => [...document.querySelectorAll('.category-name')].some(e => e.textContent === n), categoryName, { timeout: 8000 });
        return `category "${categoryName}" in tree`;
    });

    await step('create-venue', async () => {
        await openDrawer();
        await page.click('#add-venue-btn');
        await page.waitForSelector('#venue-modal:not(.hidden)');
        await page.fill('#venue-name', venueName);
        const checked = await page.evaluate((n) => {
            const cbs = [...document.querySelectorAll('#venue-categories input[type="checkbox"]')];
            const cb = cbs.find(c => (c.parentElement?.textContent || c.nextElementSibling?.textContent || '').includes(n));
            if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); return true; }
            return false;
        }, categoryName);
        assert(checked, 'category checkbox not found in venue modal');
        await page.click('#venue-form button[type="submit"]');
        await page.waitForSelector('#venue-modal.hidden', { state: 'attached' });
        // Expand the category and check the venue appears
        await page.waitForFunction((n) => {
            const cat = [...document.querySelectorAll('.tree-category')].find(c => c.querySelector('.category-name')?.textContent === n);
            if (!cat) return false;
            if (!cat.classList.contains('expanded')) cat.querySelector('.tree-category-header').click();
            return true;
        }, categoryName);
        await page.waitForFunction((n) => [...document.querySelectorAll('.venue-name')].some(e => e.textContent === n), venueName, { timeout: 8000 });
        // No delete x in the tree; pencil only
        const xInTree = await page.evaluate(() => !!document.querySelector('#nav-tree .delete-category, #nav-tree .delete-venue, #nav-tree .delete-map'));
        assert(!xInTree, 'tree still has delete x buttons');
        return `venue "${venueName}" in tree, pencil-only affordance`;
    });

    await step('create-map-square-blank', async () => {
        await openDrawer();
        // Click venue header to select + expand
        await page.evaluate((n) => {
            const h = [...document.querySelectorAll('.tree-venue-header')].find(e => e.querySelector('.venue-name')?.textContent === n);
            h.click();
        }, venueName);
        await sleep(200);
        assert(!(await page.evaluate(() => document.getElementById('add-map-btn').disabled)), '+ Add Map still disabled after venue click');
        await page.click('#add-map-btn');
        await page.waitForSelector('#map-modal:not(.hidden)');
        assert(await isVisible('#map-canvas-group'), 'Canvas shape selector not visible in Create Map');
        const opts = await page.evaluate(() => [...document.querySelectorAll('#map-canvas-shape option')].map(o => o.value));
        assert(['16:9', '4:3', '1:1', '3:4'].every(v => opts.includes(v)), `canvas shape options: ${opts.join(',')}`);
        assert(!(await isVisible('#delete-map-btn')), 'Delete this map visible in Create modal');
        await page.fill('#map-label', mapLabel);
        await page.selectOption('#map-canvas-shape', '1:1');
        await page.click('#map-form button[type="submit"]');
        await page.waitForSelector('#map-modal.hidden', { state: 'attached' });
        await page.waitForFunction((n) => [...document.querySelectorAll('.tree-map .map-label')].some(e => e.textContent === n), mapLabel, { timeout: 8000 });
        return `map "${mapLabel}" created 1:1 without image; shape options ${opts.join(',')}`;
    });

    await step('select-map', async () => {
        await openDrawer();
        const scrollBefore = await page.evaluate(() => scrollY);
        await page.evaluate((n) => {
            const m = [...document.querySelectorAll('.tree-map')].find(e => e.querySelector('.map-label')?.textContent === n);
            m.click();
        }, mapLabel);
        await page.waitForSelector('#map-editor:not(.hidden)');
        await sleep(900);
        if (cfg.isMobile) {
            assert(!(await page.evaluate(() => document.getElementById('sidebar').classList.contains('open'))), 'drawer did not close after choosing a map');
            const top = await page.evaluate(() => document.getElementById('map-editor').getBoundingClientRect().top);
            assert(top >= -5 && top < 200, `map editor top=${top}, expected scrolled into view near top`);
        }
        const dims = await page.evaluate(() => {
            const c = document.getElementById('map-canvas').getBoundingClientRect();
            const vp = document.getElementById('map-viewport').getBoundingClientRect();
            const main = document.getElementById('editor-main').getBoundingClientRect();
            return { w: c.width, h: c.height, vpw: vp.width, mainw: main.width, img: document.getElementById('map-image').getAttribute('src') };
        });
        assert(dims.w > 100 && Math.abs(dims.w / dims.h - 1) < 0.05, `blank canvas not 1:1: ${dims.w}x${dims.h}`);
        assert(dims.w >= dims.vpw - 2, `canvas ${dims.w} does not fill viewport width ${dims.vpw}`);
        return `blank 1:1 canvas ${Math.round(dims.w)}x${Math.round(dims.h)} in viewport ${Math.round(dims.vpw)}`;
    });

    // ------------------------------------------------------- add location
    await step('arm-add-location', async () => {
        await closeDrawer();
        await page.click('#add-location-btn');
        await sleep(300);
        const st = await page.evaluate(() => ({
            placing: document.getElementById('map-canvas').classList.contains('placing'),
            cursor: getComputedStyle(document.getElementById('map-canvas')).cursor,
            hint: !document.getElementById('placing-hint').hidden,
            hintText: document.getElementById('placing-hint').textContent.trim(),
            pressed: document.getElementById('add-location-btn').getAttribute('aria-pressed')
        }));
        assert(st.placing, 'canvas missing .placing');
        assert(st.cursor === 'crosshair', `cursor=${st.cursor}`);
        assert(st.hint && /tap the map/i.test(st.hintText), `hint hidden or wrong: "${st.hintText}"`);
        assert(st.pressed === 'true', 'aria-pressed not true');
        return `placement armed; hint="${st.hintText}"`;
    });

    await step('escape-cancels-placement', async () => {
        await page.keyboard.press('Escape');
        await sleep(200);
        assert(!(await page.evaluate(() => document.getElementById('map-canvas').classList.contains('placing'))), 'Escape did not cancel placement');
        assert(await page.evaluate(() => document.getElementById('placing-hint').hidden), 'hint still shown after Escape');
        return 'Escape cancelled placement';
    });

    await step('place-location-1', async () => {
        await page.click('#add-location-btn');
        await sleep(400);
        const p = await canvasPoint(0.3, 0.3);
        await tapOrClick(p.x, p.y);
        await page.waitForFunction(() => document.querySelectorAll('#markers-container .location-marker').length >= 1, null, { timeout: 8000 });
        await sleep(500);
        const st = await page.evaluate(() => {
            const markers = [...document.querySelectorAll('#markers-container .location-marker')];
            const m = markers[markers.length - 1];
            const panel = document.getElementById('location-panel');
            const li = panel.closest('li.location-list-item');
            return {
                count: markers.length, left: m.style.left, top: m.style.top,
                placing: document.getElementById('map-canvas').classList.contains('placing'),
                panelVisible: !panel.classList.contains('hidden') && panel.getBoundingClientRect().height > 0,
                inItem: !!li, expanded: !!(li && li.classList.contains('expanded')),
                listItems: document.querySelectorAll('.location-list-item').length,
                listVisible: document.getElementById('location-list').getBoundingClientRect().height > 0,
                id: li?.dataset.locationId
            };
        });
        assert(st.count === 1, `expected 1 marker, got ${st.count}`);
        const l = parseFloat(st.left), t = parseFloat(st.top);
        assert(Math.abs(l - 30) < 4 && Math.abs(t - 30) < 4, `marker at ${st.left},${st.top}, expected ~30%,30%`);
        assert(!st.placing, 'placement still armed after placing');
        assert(st.panelVisible && st.inItem && st.expanded, `details not an expanded accordion under the item (visible=${st.panelVisible} inItem=${st.inItem} expanded=${st.expanded})`);
        assert(st.listVisible, 'location list not visible with accordion open');
        locIds.push(st.id);
        return `marker 1 at ${st.left},${st.top}; accordion expanded under item; list visible`;
    });

    await step('status-strip-after-save', async () => {
        await openDrawer();
        const txt = await waitText('#publish-status-text', /Published (just now|\d+ (s|sec|min))|Published less/i, 8000);
        const cls = await page.evaluate(() => document.getElementById('publish-status').className);
        await closeDrawer();
        return `strip="${txt.trim()}" class="${cls}"`;
    });

    await step('place-location-2', async () => {
        await page.click('#add-location-btn');
        await sleep(400);
        const p = await canvasPoint(0.65, 0.6);
        await tapOrClick(p.x, p.y);
        await page.waitForFunction(() => document.querySelectorAll('#markers-container .location-marker').length >= 2, null, { timeout: 8000 });
        await sleep(400);
        const st = await page.evaluate(() => {
            const li = document.getElementById('location-panel').closest('li.location-list-item');
            return { expandedCount: document.querySelectorAll('.location-list-item.expanded').length, id: li?.dataset.locationId, items: document.querySelectorAll('.location-list-item').length };
        });
        assert(st.expandedCount === 1, `expected exactly 1 expanded item, got ${st.expandedCount}`);
        locIds.push(st.id);
        return `2 markers, ${st.items} list items, one accordion open`;
    });

    await step('accordion-switch', async () => {
        // Click first item's row: accordion moves under it, only one open, list still visible
        await page.evaluate((id) => document.querySelector(`.location-list-item[data-location-id="${id}"] .location-list-row`).click(), locIds[0]);
        await sleep(500);
        const st = await page.evaluate((id) => {
            const li = document.getElementById('location-panel').closest('li.location-list-item');
            const rect = li.getBoundingClientRect();
            const listRect = document.getElementById('location-list').getBoundingClientRect();
            const listPanel = document.getElementById('location-list-panel');
            return { under: li?.dataset.locationId === id, expanded: document.querySelectorAll('.location-list-item.expanded').length, top: rect.top, listTop: listRect.top, vh: innerHeight, scroller: listPanel.scrollHeight > listPanel.clientHeight };
        }, locIds[0]);
        assert(st.under, 'accordion not under the first item');
        assert(st.expanded === 1, `expanded count ${st.expanded}`);
        return `accordion under item 1, rows visible above it (listTop=${Math.round(st.listTop)}, itemTop=${Math.round(st.top)})`;
    });

    await step('edit-location-enter-saves', async () => {
        await page.fill('#location-name', `${TAG} Loc One`);
        await page.fill('#location-fiber', '12 ST');
        await page.press('#location-name', 'Enter');
        await page.waitForFunction((n) => [...document.querySelectorAll('.location-list-name')].some(e => e.textContent === n), `${TAG} Loc One`, { timeout: 8000 });
        await sleep(300);
        const stillOpen = await page.evaluate(() => !document.getElementById('location-panel').classList.contains('hidden'));
        const saved = await page.evaluate((id) => Admin.currentMap.locations.find(l => l.id === id)?.name, locIds[0]);
        assert(saved === `${TAG} Loc One`, `location name not saved: ${saved}`);
        return `Enter saved name; panel open=${stillOpen}`;
    });

    await step('status-strip-dirty-then-published', async () => {
        await openDrawer();
        const seen = [];
        const t0 = Date.now();
        while (Date.now() - t0 < 6000) {
            const t = await page.evaluate(() => document.getElementById('publish-status-text').textContent.trim());
            if (!seen.includes(t)) seen.push(t);
            if (/Published just now/i.test(t) && seen.length > 1) break;
            await sleep(120);
        }
        const finalTxt = seen[seen.length - 1];
        assert(/Published/i.test(finalTxt) && !/failed/i.test(finalTxt), `strip did not reach Published: ${seen.join(' -> ')}`);
        await closeDrawer();
        return `strip sequence: ${seen.join(' -> ')}`;
    });

    // ----------------------------------------------------------- photos
    await step('badge-zero-grey', async () => {
        const st = await page.evaluate((id) => {
            const b = document.querySelector(`.location-list-item[data-location-id="${id}"] .photo-badge`);
            return { exists: !!b, none: b?.classList.contains('none'), count: b?.querySelector('.photo-badge-count')?.textContent, color: b && getComputedStyle(b).color };
        }, locIds[0]);
        assert(st.exists && st.none && st.count === '0', `zero badge wrong: ${JSON.stringify(st)}`);
        return `zero-photo badge grey "0" (color ${st.color})`;
    });

    await step('add-photos-file-input', async () => {
        await page.setInputFiles('#location-image-input', [PHOTOS[0], PHOTOS[1]]);
        await page.waitForFunction(() => document.querySelectorAll('#image-preview .photo-thumb').length === 2, null, { timeout: 30000 });
        await sleep(500);
        const st = await page.evaluate((id) => {
            const thumbs = [...document.querySelectorAll('#image-preview .photo-thumb')];
            return {
                paths: thumbs.map(t => t.dataset.path), cover: thumbs[0].querySelector('.photo-cover-label')?.textContent,
                badge: document.querySelector(`.location-list-item[data-location-id="${id}"] .photo-badge-count`)?.textContent,
                imgs: Admin.currentMap.locations.find(l => l.id === id).images, image: Admin.currentMap.locations.find(l => l.id === id).image,
                btn: document.getElementById('upload-image-btn').textContent
            };
        }, locIds[0]);
        assert(st.paths.length === 2 && st.paths.every(p => /^uploads\//.test(p)), `paths ${st.paths}`);
        assert(st.cover === 'Cover', 'first thumb missing Cover label');
        assert(st.badge === '2', `badge count ${st.badge}`);
        assert(st.image === st.imgs[0], 'image is not images[0]');
        return `2 photos uploaded: ${st.paths.join(', ')}; badge=2; button="${st.btn}"`;
    });

    await step('reorder-photos', async () => {
        const before = await page.evaluate(() => [...document.querySelectorAll('#image-preview .photo-thumb')].map(t => t.dataset.path));
        const a = await page.locator('#image-preview .photo-thumb').nth(0).boundingBox();
        const b = await page.locator('#image-preview .photo-thumb').nth(1).boundingBox();
        // Drag second thumb (from its handle) to the left of the first with pointer events
        const handle = await page.locator('#image-preview .photo-thumb').nth(1).locator('.photo-handle').boundingBox();
        const sx = handle ? handle.x + handle.width / 2 : b.x + b.width / 2;
        const sy = handle ? handle.y + handle.height / 2 : b.y + b.height / 2;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) {
            await page.mouse.move(sx + (a.x + 4 - sx) * i / 12, sy + (a.y + a.height / 2 - sy) * i / 12);
            await sleep(30);
        }
        await page.mouse.up();
        await page.waitForFunction((first) => Admin.currentMap.locations.find(l => l.id === Admin.selectedLocation?.id)?.images?.[0] === first, before[1], { timeout: 8000 });
        await sleep(400);
        const after = await page.evaluate((id) => ({ dom: [...document.querySelectorAll('#image-preview .photo-thumb')].map(t => t.dataset.path), data: Admin.currentMap.locations.find(l => l.id === id).images, image: Admin.currentMap.locations.find(l => l.id === id).image, cover: document.querySelector('#image-preview .photo-thumb .photo-cover-label')?.closest('.photo-thumb')?.dataset.path }), locIds[0]);
        assert(after.data[0] === before[1] && after.data[1] === before[0], `reorder not saved: ${before} -> ${after.data}`);
        assert(after.dom[0] === before[1], 'DOM order not updated');
        assert(after.cover === after.data[0] && after.image === after.data[0], 'Cover label / image mirror not on new first');
        return `reordered: ${before.map(p => p.split('/').pop()).join(',')} -> ${after.data.map(p => p.split('/').pop()).join(',')}`;
    });

    await step('remove-photo', async () => {
        const before = await page.evaluate(() => [...document.querySelectorAll('#image-preview .photo-thumb')].map(t => t.dataset.path));
        await page.evaluate(() => document.querySelectorAll('#image-preview .photo-thumb .photo-remove')[1].click());
        await page.waitForFunction(() => document.querySelectorAll('#image-preview .photo-thumb').length === 1, null, { timeout: 8000 });
        await sleep(400);
        const st = await page.evaluate((id) => ({ dom: [...document.querySelectorAll('#image-preview .photo-thumb')].map(t => t.dataset.path), badge: document.querySelector(`.location-list-item[data-location-id="${id}"] .photo-badge-count`)?.textContent, data: Admin.currentMap.locations.find(l => l.id === id).images }), locIds[0]);
        assert(st.dom[0] === before[0] && st.data.length === 1, `wrong photo removed: ${st.dom}`);
        assert(st.badge === '1', `badge ${st.badge}`);
        // The deleted upload should be gone from the server
        const gone = await page.evaluate(async (p) => (await fetch('/' + p, { cache: 'no-store' })).status, before[1]);
        errors = errors.filter(e => !e.includes(before[1]) && !/Failed to load resource.*404/.test(e)); // this probe's 404 is the expected result
        assert(gone === 404, `removed upload still served: HTTP ${gone}`);
        return `removed second photo; badge=1; server 404 for removed file`;
    });

    await step('needs-photos-filter', async () => {
        await page.evaluate(() => { const cb = document.getElementById('needs-photos-filter'); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
        await sleep(300);
        const st = await page.evaluate((ids) => ids.map(id => { const li = document.querySelector(`.location-list-item[data-location-id="${id}"]`); return { id, shown: li && li.getBoundingClientRect().height > 0 }; }), locIds);
        // locIds[0] has 1 photo and is the expanded one (stays visible per design); locIds[1] has 0 -> shown
        assert(st[1].shown, 'zero-photo location hidden by Needs photos filter');
        // Collapse the expanded item, then the item with a photo must hide
        await page.keyboard.press('Escape');
        await sleep(300);
        const st2 = await page.evaluate((ids) => ids.map(id => { const li = document.querySelector(`.location-list-item[data-location-id="${id}"]`); return li && li.getBoundingClientRect().height > 0; }), locIds);
        assert(!st2[0] && st2[1], `after collapse: withPhoto shown=${st2[0]} noPhoto shown=${st2[1]}`);
        await page.evaluate(() => { const cb = document.getElementById('needs-photos-filter'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); });
        await sleep(200);
        const all = await page.evaluate(() => [...document.querySelectorAll('.location-list-item')].every(li => li.getBoundingClientRect().height > 0));
        assert(all, 'items still hidden after unchecking filter');
        return 'Needs photos hides the location that has a photo; Escape collapsed accordion';
    });

    await step('search', async () => {
        await page.fill('#location-search', 'Loc One');
        await sleep(300);
        const st = await page.evaluate((ids) => ids.map(id => { const li = document.querySelector(`.location-list-item[data-location-id="${id}"]`); return li && li.getBoundingClientRect().height > 0; }), locIds);
        assert(st[0] && !st[1], `search: match shown=${st[0]}, other shown=${st[1]}`);
        await page.fill('#location-search', '');
        await sleep(200);
        return 'search filters the list';
    });

    await step('renumber', async () => {
        // Give loc 2 number 9 via the form, then renumber back to 1,2
        await page.evaluate((id) => document.querySelector(`.location-list-item[data-location-id="${id}"] .location-list-row`).click(), locIds[1]);
        await sleep(300);
        await page.fill('#location-number', '9');
        await page.fill('#location-name', `${TAG} Loc Two`);
        await page.click('#location-form button[type="submit"]');
        await page.waitForFunction((id) => Admin.currentMap.locations.find(l => l.id === id)?.number === 9, locIds[1], { timeout: 8000 });
        await page.click('#renumber-btn');
        await sleep(300);
        if (await isVisible('#confirm-modal')) await page.click('#confirm-action-btn');
        await page.waitForFunction(() => { const n = Admin.currentMap.locations.map(l => l.number).sort(); return n.join(',') === '1,2'; }, null, { timeout: 8000 });
        await sleep(300);
        const nums = await page.evaluate(() => [...document.querySelectorAll('.location-list-number')].map(e => e.textContent));
        assert(nums.join(',') === '1,2', `list numbers ${nums}`);
        return `renumbered to ${nums.join(',')}`;
    });

    // -------------------------------------------------------- pinch zoom
    await step('pinch-zoom', async () => {
        await page.keyboard.press('Escape');
        await sleep(200);
        const before = await page.evaluate(() => { const m = document.querySelector('#markers-container .location-marker'); const r = m.getBoundingClientRect(); return { w: r.width, h: r.height }; });
        await pinch(100, 220);
        await sleep(300);
        const st = await page.evaluate(() => {
            const c = document.getElementById('map-canvas');
            const m = document.querySelector('#markers-container .location-marker');
            const r = m.getBoundingClientRect();
            return { transform: c.style.transform, zoomVar: c.style.getPropertyValue('--zoom'), scale: Admin.zoom.scale, mw: r.width, mh: r.height, reset: !document.getElementById('reset-zoom-btn').hidden && document.getElementById('reset-zoom-btn').getBoundingClientRect().width > 0, mTransform: getComputedStyle(m).transform };
        });
        assert(/scale\(/.test(st.transform) && st.scale > 1.5, `no zoom transform: "${st.transform}" scale=${st.scale}`);
        assert(Math.abs(st.mw - before.w) < 2.5, `marker not counter-scaled: ${before.w} -> ${st.mw} at scale ${st.scale}`);
        assert(st.reset, 'Reset zoom control not shown while zoomed');
        return `scale=${st.scale.toFixed(2)} transform="${st.transform}" marker ${before.w.toFixed(1)}px -> ${st.mw.toFixed(1)}px; reset shown`;
    });

    await step('drag-marker-while-zoomed', async () => {
        const m = page.locator('#markers-container .location-marker').first();
        const box = await m.boundingBox();
        const id = await m.getAttribute('data-location-id');
        const beforePos = await page.evaluate((id) => { const l = Admin.currentMap.locations.find(l => l.id === id); return { ...l.position }; }, id);
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + 6 * i, cy + 4 * i); await sleep(25); }
        await page.mouse.up();
        await sleep(800);
        const st = await page.evaluate((id) => { const l = Admin.currentMap.locations.find(l => l.id === id); const mk = document.querySelector(`.location-marker[data-location-id="${id}"]`); return { pos: l.position, style: { left: mk.style.left, top: mk.style.top } }; }, id);
        assert(st.pos.left !== beforePos.left || st.pos.top !== beforePos.top, `marker did not move: ${JSON.stringify(beforePos)} -> ${JSON.stringify(st.pos)}`);
        const dl = parseFloat(st.pos.left) - parseFloat(beforePos.left);
        assert(dl > 0 && dl < 25, `moved implausibly far (${dl}%) while zoomed`);
        return `marker moved ${JSON.stringify(beforePos)} -> ${JSON.stringify(st.pos)} while zoomed`;
    });

    await step('reset-zoom', async () => {
        await page.click('#reset-zoom-btn');
        await sleep(300);
        const st = await page.evaluate(() => ({ transform: document.getElementById('map-canvas').style.transform, scale: Admin.zoom.scale, reset: document.getElementById('reset-zoom-btn').hidden }));
        assert(st.scale === 1 && !st.transform, `zoom not reset: ${JSON.stringify(st)}`);
        return 'reset zoom clears transform and hides control';
    });

    // ------------------------------------------------------ photos needed
    await step('photos-needed-view', async () => {
        await openDrawer();
        const badge = await page.evaluate(() => document.getElementById('photos-needed-badge').textContent);
        await page.click('#photos-needed-nav');
        await page.waitForSelector('#photos-needed-view:not(.hidden)');
        await sleep(400);
        const st = await page.evaluate(({ v, m, id }) => {
            const rows = [...document.querySelectorAll('#photos-needed-list tr[data-location-id]')];
            const mine = rows.find(r => r.dataset.locationId === id);
            const group = mine?.closest('.photos-needed-group');
            return { rows: rows.length, mine: !!mine, groupText: group?.querySelector('.photos-needed-group-title')?.textContent.replace(/\s+/g, ' ').trim(), addBtn: !!mine?.querySelector('.photos-needed-add'), summary: document.getElementById('photos-needed-summary').textContent, editorHidden: document.getElementById('map-editor').classList.contains('hidden'), drawerOpen: document.getElementById('sidebar').classList.contains('open') };
        }, { v: venueName, m: mapLabel, id: locIds[1] });
        assert(st.mine && st.addBtn, 'zero-photo location missing from Photos needed table');
        assert(st.groupText.includes(venueName) && st.groupText.includes(mapLabel), `group title "${st.groupText}"`);
        assert(parseInt(badge, 10) === st.rows, `badge ${badge} != rows ${st.rows}`);
        assert(st.editorHidden, 'map editor still visible under Photos needed view');
        return `badge=${badge}, rows=${st.rows}, summary="${st.summary}"`;
    });

    await step('photos-needed-add-photo', async () => {
        const rowsBefore = await page.evaluate(() => document.querySelectorAll('#photos-needed-list tr[data-location-id]').length);
        await page.evaluate((id) => document.querySelector(`#photos-needed-list tr[data-location-id="${id}"] .photos-needed-add`).click(), locIds[1]);
        await page.setInputFiles('#photos-needed-file-input', [PHOTOS[2]]);
        await page.waitForFunction((id) => !document.querySelector(`#photos-needed-list tr[data-location-id="${id}"]`), locIds[1], { timeout: 30000 });
        await sleep(400);
        const st = await page.evaluate((id) => ({ rows: document.querySelectorAll('#photos-needed-list tr[data-location-id]').length, badge: document.getElementById('photos-needed-badge').textContent, imgs: Admin.data.venues.flatMap(v => v.maps).flatMap(m => m.locations).find(l => l.id === id)?.images }), locIds[1]);
        assert(st.rows === rowsBefore - 1, `rows ${rowsBefore} -> ${st.rows}`);
        assert(st.imgs && st.imgs.length === 1, `location images after upload: ${st.imgs}`);
        assert(parseInt(st.badge, 10) === st.rows, `badge ${st.badge} != rows ${st.rows}`);
        return `Add Photos uploaded to the row; rows ${rowsBefore} -> ${st.rows}; badge ${st.badge}`;
    });

    // ------------------------------------------------------ landing cards
    await step('landing-card-add-hide-reorder', async () => {
        await openDrawer();
        const expanded = await page.evaluate(() => document.querySelector('.landing-page-section').classList.contains('expanded'));
        if (!expanded) await page.click('#landing-page-toggle');
        await sleep(300);
        assert(await isVisible('#add-card-btn'), '+ Add Card not visible after expanding Landing Page');
        const remembered = await page.evaluate(() => localStorage.getItem(Admin.LANDING_KEY));
        await page.click('#add-card-btn');
        await page.waitForSelector('#card-modal:not(.hidden)');
        await page.fill('#card-title', cardTitle);
        await page.fill('#card-description', 'verification card');
        await page.click('#card-form button[type="submit"]');
        await page.waitForSelector('#card-modal.hidden', { state: 'attached' });
        await page.waitForFunction((t) => [...document.querySelectorAll('.landing-card-title')].some(e => e.textContent === t), cardTitle, { timeout: 8000 });
        // Hide it
        await page.evaluate((t) => { const it = [...document.querySelectorAll('.landing-card-item')].find(i => i.querySelector('.landing-card-title').textContent === t); it.querySelector('.visibility-toggle').click(); }, cardTitle);
        await page.waitForFunction((t) => { const it = [...document.querySelectorAll('.landing-card-item')].find(i => i.querySelector('.landing-card-title').textContent === t); return it && it.classList.contains('hidden-card'); }, cardTitle, { timeout: 8000 });
        const server = await page.evaluate(async (t) => { const d = await Admin.api('/api/data'); const lp = d.landingPage || {}; return { keys: Object.keys(lp), hidden: (lp.cards || []).find(c => c.title === t)?.visible === false }; }, cardTitle);
        assert(Array.isArray(await page.evaluate(async () => (await Admin.api('/api/data')).landingPage?.cards)), `server landingPage has no cards array after PUT /api/landing-page (keys: ${server.keys.join(',')}) - admin wraps the body as {landingPage: ...} but the server stores the body verbatim`);
        assert(server.hidden, 'card visible flag not saved');
        // Reorder: HTML5 drag the new (last) card above the first
        let reorderNote = '';
        const items = page.locator('.landing-card-item');
        const n = await items.count();
        if (n >= 2 && !cfg.isMobile) {
            const orderBefore = await page.evaluate(() => [...document.querySelectorAll('.landing-card-item')].map(i => i.dataset.cardId));
            await items.nth(n - 1).dragTo(items.nth(0), { targetPosition: { x: 20, y: 5 } });
            await sleep(800);
            const orderAfter = await page.evaluate(async () => { const d = await Admin.api('/api/data'); return [...(d.landingPage.cards || [])].sort((a, b) => a.order - b.order).map(c => c.id); });
            assert(orderAfter[0] === orderBefore[n - 1], `reorder not saved: ${orderBefore} -> ${orderAfter}`);
            reorderNote = '; reorder saved';
        } else if (cfg.isMobile) {
            reorderNote = '; reorder skipped on touch (HTML5 dnd)';
        }
        return `card added, hidden (saved)${reorderNote}; landing state remembered=${remembered}`;
    });

    await step('landing-card-edit-delete', async () => {
        await openDrawer();
        await page.evaluate((t) => { const it = [...document.querySelectorAll('.landing-card-item')].find(i => i.querySelector('.landing-card-title').textContent === t); it.querySelector('.edit-card').click(); }, cardTitle);
        await page.waitForSelector('#card-modal:not(.hidden)');
        await page.fill('#card-title', cardTitle + ' edited');
        await page.click('#card-form button[type="submit"]');
        await page.waitForSelector('#card-modal.hidden', { state: 'attached' });
        await page.waitForFunction((t) => [...document.querySelectorAll('.landing-card-title')].some(e => e.textContent === t), cardTitle + ' edited', { timeout: 8000 });
        await page.evaluate((t) => { const it = [...document.querySelectorAll('.landing-card-item')].find(i => i.querySelector('.landing-card-title').textContent === t); it.querySelector('.delete-card').click(); }, cardTitle + ' edited');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        await page.click('#confirm-action-btn');
        await page.waitForFunction((t) => ![...document.querySelectorAll('.landing-card-title')].some(e => e.textContent.startsWith(t)), cardTitle, { timeout: 8000 });
        return 'card edited then deleted';
    });

    // ------------------------------------------------------ notifications
    await step('notifications-open', async () => {
        await closeDrawer();
        await page.click('#notification-bell');
        await sleep(300);
        const st = await page.evaluate(() => { const d = document.getElementById('notification-dropdown'); const r = d.getBoundingClientRect(); return { hidden: d.classList.contains('hidden'), w: r.width, right: r.right, vw: innerWidth, items: d.querySelectorAll('.notification-item').length, empty: !document.getElementById('notification-empty').classList.contains('hidden') }; });
        assert(!st.hidden && st.w > 0, 'notification dropdown did not open');
        assert(st.right <= st.vw + 1, `dropdown overflows viewport: right=${st.right} vw=${st.vw}`);
        await page.click('#notification-bell');
        await sleep(200);
        assert(await page.evaluate(() => document.getElementById('notification-dropdown').classList.contains('hidden')), 'dropdown did not close');
        return `dropdown opened (${st.items} requests, empty=${st.empty}) and closed; nothing approved`;
    });

    // ------------------------------------------------------------- tour
    await step('tour-start', async () => {
        await closeDrawer();
        await page.click('#tutorial-help-btn');
        await page.waitForSelector('#tutorial-container:not(.hidden)');
        await sleep(300);
        const st = await tourState();
        assert(st.id === 'welcome', `first step ${st.id}`);
        return `tour started: "${st.title}"`;
    });

    const tourCheck = async (expectId) => {
        await page.waitForFunction((id) => Tutorial.active && Tutorial.steps[Tutorial.currentStep].id === id, expectId, { timeout: 10000 });
        await sleep(450);
        const st = await tourState();
        if (st.type === 'highlight') {
            assert(st.targetExists, `tour step "${st.id}" target missing (${await page.evaluate(() => Tutorial.steps[Tutorial.currentStep].target)})`);
            assert(!st.fallback, `tour step "${st.id}" fell back to floating popover (target not visible)`);
        }
        return st;
    };

    await step('tour-step1-category', async () => {
        await page.click('.tutorial-popover .tutorial-next');
        let st = await tourCheck('create-category');
        assert(/Step 1/.test(st.title), st.title);
        await page.click('#add-category-btn');
        st = await tourCheck('save-category');
        await sleep(400);
        const name = await page.inputValue('#category-name');
        assert(name === 'Tutorial Example', `prefill missing: "${name}"`);
        await page.click('#category-form button[type="submit"]');
        st = await tourCheck('create-venue');
        return `Step 1 done, prefill ok, now "${st.title}"`;
    });

    await step('tour-step2-venue', async () => {
        await page.click('#add-venue-btn');
        let st = await tourCheck('save-venue');
        await sleep(400);
        const checked = await page.evaluate(() => [...document.querySelectorAll('input[name="venue-category"]')].some(cb => cb.checked && cb.nextElementSibling?.textContent?.includes('Tutorial Example')));
        assert(checked, 'Tutorial Example category not auto-checked');
        await page.click('#venue-form button[type="submit"]');
        st = await tourCheck('expand-venue');
        await sleep(300);
        st = await tourCheck('expand-venue');
        await page.evaluate(() => { const v = [...document.querySelectorAll('.tree-venue-header')].find(e => e.textContent.includes('Example Venue')); v.click(); });
        st = await tourCheck('create-map');
        return `Step 2 done, venue expanded, now "${st.title}"`;
    });

    await step('tour-step3-map', async () => {
        await page.click('#add-map-btn');
        let st = await tourCheck('save-map');
        await sleep(400);
        assert((await page.inputValue('#map-label')) === 'Main Floor', 'map prefill missing');
        await page.click('#map-form button[type="submit"]');
        st = await tourCheck('select-map');
        await page.evaluate(() => { const m = [...document.querySelectorAll('.tree-map')].reverse().find(e => e.textContent.includes('Main Floor')); m.click(); });
        st = await tourCheck('add-location');
        assert(/Step 4/.test(st.title), st.title);
        assert(!st.nextVisible, 'Next button visible on an action-gated step');
        return `Step 3 done, now "${st.title}"`;
    });

    await step('tour-step4-location', async () => {
        await page.click('#add-location-btn');
        let st = await tourCheck('place-location');
        const p = await canvasPoint(0.5, 0.5);
        await tapOrClick(p.x, p.y);
        st = await tourCheck('edit-location');
        await sleep(300);
        await page.fill('#location-name', 'Tour Location');
        await page.click('#location-form button[type="submit"]');
        st = await tourCheck('photo-requests');
        await page.click('.tutorial-popover .tutorial-next');
        st = await tourCheck('drag-marker');
        await page.click('.tutorial-popover .tutorial-next');
        st = await tourCheck('map-info');
        await page.click('.tutorial-popover .tutorial-next');
        st = await tourCheck('publish');
        assert(/Step 5/.test(st.title), st.title);
        return `reached "${st.title}" with every target present`;
    });

    await step('tour-finish-delete-example', async () => {
        await page.click('.tutorial-popover .tutorial-next');
        const st = await tourCheck('complete');
        await page.click('.tutorial-popover .tutorial-skip');
        await sleep(500);
        if (await isVisible('#confirm-modal')) await page.click('#confirm-action-btn');
        await page.waitForFunction(() => !Tutorial.active, null, { timeout: 10000 });
        await page.waitForFunction(() => !Admin.data.categories.some(c => c.name === 'Tutorial Example') && !Admin.data.venues.some(v => v.name === 'Example Venue'), null, { timeout: 10000 });
        await sleep(500);
        return 'tour completed; example data deleted';
    });

    // ----------------------------------------------------------- deletes
    await step('delete-location', async () => {
        await openDrawer();
        await page.evaluate((n) => { const m = [...document.querySelectorAll('.tree-map')].find(e => e.querySelector('.map-label')?.textContent === n); m.click(); }, mapLabel);
        await page.waitForSelector('#map-editor:not(.hidden)');
        await sleep(600);
        await closeDrawer();
        await page.evaluate((id) => document.querySelector(`.location-list-item[data-location-id="${id}"] .location-list-row`).click(), locIds[1]);
        await sleep(300);
        await page.click('#delete-location-btn');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        const msg = await page.textContent('#confirm-message');
        assert(msg.includes(`${TAG} Loc Two`), `confirm text "${msg}"`);
        await page.click('#confirm-action-btn');
        await page.waitForFunction((id) => !document.querySelector(`.location-list-item[data-location-id="${id}"]`) && !document.querySelector(`.location-marker[data-location-id="${id}"]`), locIds[1], { timeout: 8000 });
        await sleep(600);
        const left = await page.evaluate(() => Admin.currentMap.locations.length);
        assert(left === 1, `locations left ${left}`);
        return `deleted; confirm said "${msg}"`;
    });

    await step('delete-map-from-modal', async () => {
        await page.click('#edit-map-btn');
        await page.waitForSelector('#map-modal:not(.hidden)');
        assert(await isVisible('#delete-map-btn'), 'Delete this map not visible in Edit Map Info');
        assert(await isVisible('#map-canvas-group'), 'Canvas shape selector hidden in Edit Map Info for imageless map');
        const shape = await page.inputValue('#map-canvas-shape');
        assert(shape === '1:1', `shape ${shape}`);
        await page.click('#delete-map-btn');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        const msg = await page.textContent('#confirm-message');
        assert(msg.includes(mapLabel) && /1 location/.test(msg), `confirm text "${msg}"`);
        await page.click('#confirm-action-btn');
        await page.waitForFunction((n) => ![...document.querySelectorAll('.tree-map .map-label')].some(e => e.textContent === n), mapLabel, { timeout: 8000 });
        await sleep(300);
        assert(await page.evaluate(() => document.getElementById('map-editor').classList.contains('hidden')), 'map editor still shown after delete');
        return `deleted from modal; confirm said "${msg}"`;
    });

    await step('delete-venue-from-modal', async () => {
        await openDrawer();
        await page.evaluate((n) => { const h = [...document.querySelectorAll('.tree-venue-header')].find(e => e.querySelector('.venue-name')?.textContent === n); h.querySelector('.edit-venue').click(); }, venueName);
        await page.waitForSelector('#venue-modal:not(.hidden)');
        assert(await isVisible('#delete-venue-btn'), 'Delete this venue not visible in edit modal');
        await page.click('#delete-venue-btn');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        const msg = await page.textContent('#confirm-message');
        assert(msg.includes(venueName) && /location/.test(msg), `confirm text "${msg}"`);
        await page.click('#confirm-action-btn');
        await page.waitForFunction((n) => ![...document.querySelectorAll('.venue-name')].some(e => e.textContent === n), venueName, { timeout: 8000 });
        return `deleted; confirm said "${msg}"`;
    });

    await step('delete-category-from-modal', async () => {
        await openDrawer();
        await page.evaluate((n) => { const h = [...document.querySelectorAll('.tree-category-header')].find(e => e.querySelector('.category-name')?.textContent === n); h.querySelector('.edit-category').click(); }, categoryName);
        await page.waitForSelector('#category-modal:not(.hidden)');
        assert(await isVisible('#delete-category-btn'), 'Delete this category not visible in edit modal');
        await page.click('#delete-category-btn');
        await page.waitForSelector('#confirm-modal:not(.hidden)');
        const msg = await page.textContent('#confirm-message');
        assert(msg.includes(categoryName), `confirm text "${msg}"`);
        await page.click('#confirm-action-btn');
        await page.waitForFunction((n) => ![...document.querySelectorAll('.category-name')].some(e => e.textContent === n), categoryName, { timeout: 8000 });
        await sleep(2500); // let the debounced publish run
        const strip = await page.evaluate(() => document.getElementById('publish-status-text').textContent.trim());
        return `deleted; strip="${strip}"`;
    });

    await step('view-site-and-logout', async () => {
        await closeDrawer();
        const viewHref = await page.evaluate(() => { const a = [...document.querySelectorAll('a, button')].find(e => /view site/i.test(e.textContent)); return a ? (a.getAttribute('href') || a.tagName) : null; });
        assert(viewHref, 'View Site link missing');
        await page.click('#logout-btn');
        await sleep(400);
        assert(await isVisible('#login-screen'), 'login screen not shown after logout');
        return `View Site -> ${viewHref}; logged out`;
    });

    await step('session-expiry', async () => {
        // Log back in, corrupt the token, trigger a request: expect the login screen with the expiry message
        await page.fill('#password', 'preview123');
        await page.click('#login-form button[type="submit"]');
        await page.waitForSelector('#admin-dashboard:not(.hidden)', { timeout: 8000 });
        await sleep(400);
        await page.evaluate(() => { Admin.token = 'bogus'; try { sessionStorage.setItem('adminToken', 'bogus'); } catch (e) {} });
        errors = []; // the 401 below is expected
        await page.evaluate(() => Admin.api('/api/publish-status').catch(() => {}));
        await sleep(600);
        errors = errors.filter(e => !/401/.test(e));
        assert(await isVisible('#login-screen'), 'login screen not shown after 401');
        const msg = await page.textContent('#login-error');
        assert(/expired/i.test(msg), `login error text "${msg}"`);
        return `401 -> login screen with "${msg.trim()}"`;
    });

    fs.writeFileSync(path.join(DIR, `av-results-${size}.json`), JSON.stringify(results, null, 2));
    await browser.close();
    return results;
}

(async () => {
    let failed = 0;
    for (const size of which) {
        const res = await run(size);
        failed += res.filter(r => !r.passed).length;
    }
    console.log(failed ? `${failed} step(s) failed` : 'all steps passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
