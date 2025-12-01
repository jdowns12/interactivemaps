/**
 * WEP Maps Admin Editor
 * Drag-and-drop map editor with CRUD operations
 */

const Admin = {
    // State
    token: null,
    data: { categories: [], venues: [] },
    currentVenue: null,
    currentMap: null,
    selectedLocation: null,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },

    // API Base URL
    apiBase: '',

    // Initialize
    init() {
        this.token = sessionStorage.getItem('adminToken');
        this.bindEvents();

        if (this.token) {
            this.verifyAuth();
        }
    },

    // Event Bindings
    bindEvents() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Sidebar buttons
        document.getElementById('add-category-btn').addEventListener('click', () => this.showCategoryModal());
        document.getElementById('add-venue-btn').addEventListener('click', () => this.showVenueModal());
        document.getElementById('add-map-btn').addEventListener('click', () => this.showMapModal());
        document.getElementById('generate-html-btn').addEventListener('click', () => this.generateHTML());

        // Map editor buttons
        document.getElementById('edit-map-btn').addEventListener('click', () => this.showMapModal(true));
        document.getElementById('delete-map-btn').addEventListener('click', () => this.confirmDeleteMap());

        // Location panel
        document.getElementById('close-panel-btn').addEventListener('click', () => this.closeLocationPanel());
        document.getElementById('location-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveLocation();
        });
        document.getElementById('delete-location-btn').addEventListener('click', () => this.confirmDeleteLocation());

        // Image uploads
        document.getElementById('upload-image-btn').addEventListener('click', () => {
            document.getElementById('location-image-input').click();
        });
        document.getElementById('location-image-input').addEventListener('change', (e) => this.handleImageUpload(e));

        document.getElementById('upload-map-image-btn').addEventListener('click', () => {
            document.getElementById('map-image-input').click();
        });
        document.getElementById('map-image-input').addEventListener('change', (e) => this.handleMapImageUpload(e));

        // Modal forms
        document.getElementById('category-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCategory();
        });
        document.getElementById('venue-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveVenue();
        });
        document.getElementById('map-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveMap();
        });

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModals();
            });
        });

        // Category name auto-slug
        document.getElementById('category-name').addEventListener('input', (e) => {
            const slug = document.getElementById('category-slug');
            if (!slug.dataset.manual) {
                slug.value = this.generateSlug(e.target.value);
            }
        });
        document.getElementById('category-slug').addEventListener('input', (e) => {
            e.target.dataset.manual = true;
        });

        // Map canvas double-click to add location
        document.getElementById('map-canvas').addEventListener('dblclick', (e) => this.addLocationAtPosition(e));
    },

    // Authentication
    async login() {
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const response = await this.api('/api/auth/login', 'POST', { password });
            if (response.success) {
                this.token = response.token;
                sessionStorage.setItem('adminToken', this.token);
                this.showDashboard();
                this.loadData();
            } else {
                errorEl.textContent = response.error || 'Invalid password';
            }
        } catch (error) {
            errorEl.textContent = 'Login failed. Please try again.';
        }
    },

    async verifyAuth() {
        try {
            const response = await this.api('/api/auth/verify', 'GET');
            if (response.valid) {
                this.showDashboard();
                this.loadData();
            } else {
                this.showLogin();
            }
        } catch {
            this.showLogin();
        }
    },

    logout() {
        this.api('/api/auth/logout', 'POST').catch(() => {});
        sessionStorage.removeItem('adminToken');
        this.token = null;
        this.showLogin();
    },

    showLogin() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('admin-dashboard').classList.add('hidden');
    },

    showDashboard() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
    },

    // API Helper
    async api(endpoint, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(this.apiBase + endpoint, options);
        return response.json();
    },

    async apiUpload(endpoint, file) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(this.apiBase + endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        });

        return response.json();
    },

    // Data Loading
    async loadData() {
        try {
            const response = await this.api('/api/data');
            this.data = response;

            // Ensure categories array exists
            if (!this.data.categories) {
                this.data.categories = [];
            }

            this.renderNavTree();
            this.updateVenueCategoryDropdown();
        } catch (error) {
            this.toast('Failed to load data', 'error');
        }
    },

    // Navigation Tree
    renderNavTree() {
        const tree = document.getElementById('nav-tree');
        tree.innerHTML = '';

        // Group venues by category
        const categorizedVenues = {};
        const uncategorizedVenues = [];

        this.data.venues.forEach(venue => {
            if (venue.category) {
                if (!categorizedVenues[venue.category]) {
                    categorizedVenues[venue.category] = [];
                }
                categorizedVenues[venue.category].push(venue);
            } else {
                uncategorizedVenues.push(venue);
            }
        });

        // Render categories
        this.data.categories.forEach(category => {
            const categoryEl = document.createElement('div');
            categoryEl.className = 'tree-category';
            categoryEl.innerHTML = `
                <div class="tree-category-header" data-category-id="${category.id}">
                    <span class="arrow">&#9654;</span>
                    <span class="category-name">${category.name}</span>
                    <div class="category-actions">
                        <button class="edit-category" title="Edit">&#9998;</button>
                        <button class="delete-category" title="Delete">&times;</button>
                    </div>
                </div>
                <div class="tree-venues"></div>
            `;

            // Category header click
            const header = categoryEl.querySelector('.tree-category-header');
            header.addEventListener('click', (e) => {
                if (e.target.closest('.category-actions')) return;
                categoryEl.classList.toggle('expanded');
                header.classList.toggle('expanded');
            });

            // Category edit/delete
            categoryEl.querySelector('.edit-category').addEventListener('click', () => {
                this.showCategoryModal(category);
            });
            categoryEl.querySelector('.delete-category').addEventListener('click', () => {
                this.confirmDeleteCategory(category.id);
            });

            // Add venues
            const venuesContainer = categoryEl.querySelector('.tree-venues');
            const venues = categorizedVenues[category.id] || [];
            venues.forEach(venue => {
                venuesContainer.appendChild(this.createVenueTreeItem(venue));
            });

            tree.appendChild(categoryEl);
        });

        // Render uncategorized venues
        if (uncategorizedVenues.length > 0) {
            const uncatEl = document.createElement('div');
            uncatEl.className = 'tree-category expanded';
            uncatEl.innerHTML = `
                <div class="tree-category-header expanded">
                    <span class="arrow">&#9654;</span>
                    <span class="category-name">Uncategorized</span>
                </div>
                <div class="tree-venues"></div>
            `;

            uncatEl.querySelector('.tree-category-header').addEventListener('click', () => {
                uncatEl.classList.toggle('expanded');
            });

            const venuesContainer = uncatEl.querySelector('.tree-venues');
            uncategorizedVenues.forEach(venue => {
                venuesContainer.appendChild(this.createVenueTreeItem(venue));
            });

            tree.appendChild(uncatEl);
        }
    },

    createVenueTreeItem(venue) {
        const venueEl = document.createElement('div');
        venueEl.className = 'tree-venue';
        venueEl.innerHTML = `
            <div class="tree-venue-header" data-venue-id="${venue.id}">
                <span class="arrow">&#9654;</span>
                <span class="venue-name">${venue.name}</span>
            </div>
            <div class="tree-maps"></div>
        `;

        const header = venueEl.querySelector('.tree-venue-header');
        header.addEventListener('click', () => {
            venueEl.classList.toggle('expanded');
        });

        const mapsContainer = venueEl.querySelector('.tree-maps');
        (venue.maps || []).forEach(map => {
            const mapEl = document.createElement('div');
            mapEl.className = 'tree-map';
            mapEl.textContent = map.label;
            mapEl.dataset.venueId = venue.id;
            mapEl.dataset.mapId = map.id;

            mapEl.addEventListener('click', () => {
                this.selectMap(venue.id, map.id);
                document.querySelectorAll('.tree-map').forEach(el => el.classList.remove('active'));
                mapEl.classList.add('active');
            });

            mapsContainer.appendChild(mapEl);
        });

        return venueEl;
    },

    // Map Selection
    selectMap(venueId, mapId) {
        this.currentVenue = this.data.venues.find(v => v.id === venueId);
        this.currentMap = this.currentVenue?.maps.find(m => m.id === mapId);

        if (!this.currentVenue || !this.currentMap) return;

        // Update UI
        document.getElementById('empty-state').classList.add('hidden');
        document.getElementById('map-editor').classList.remove('hidden');
        document.getElementById('add-map-btn').disabled = false;

        document.getElementById('current-venue-name').textContent = this.currentVenue.name;
        document.getElementById('current-map-label').textContent = this.currentMap.label;

        // Load map image
        const mapImage = document.getElementById('map-image');
        mapImage.src = this.currentMap.image;

        // Render markers
        this.renderMarkers();
        this.closeLocationPanel();
    },

    // Marker Rendering
    renderMarkers() {
        const container = document.getElementById('markers-container');
        container.innerHTML = '';

        if (!this.currentMap) return;

        this.currentMap.locations.forEach(location => {
            const marker = this.createMarker(location);
            container.appendChild(marker);
        });
    },

    createMarker(location) {
        const marker = document.createElement('div');
        marker.className = 'location-marker';
        marker.dataset.locationId = location.id;

        // Parse position
        let top = location.position?.top || '50%';
        let left = location.position?.left || '50%';
        if (typeof top === 'number') top = top + '%';
        if (typeof left === 'number') left = left + '%';

        marker.style.top = top;
        marker.style.left = left;

        marker.innerHTML = `<span class="marker-number">${location.number || ''}</span>`;

        // Click to select
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.isDragging) {
                this.selectLocation(location.id);
            }
        });

        // Drag handling
        marker.addEventListener('mousedown', (e) => this.startDrag(e, marker, location));
        marker.addEventListener('touchstart', (e) => this.startDrag(e, marker, location), { passive: false });

        return marker;
    },

    // Drag and Drop
    startDrag(e, marker, location) {
        if (e.type === 'touchstart') {
            e.preventDefault();
        }

        this.isDragging = false;
        this.dragStartTime = Date.now();

        const rect = marker.getBoundingClientRect();
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        this.dragOffset = {
            x: clientX - rect.left - rect.width / 2,
            y: clientY - rect.top - rect.height / 2
        };

        const onMove = (moveEvent) => {
            this.isDragging = true;
            marker.classList.add('dragging');

            const moveClientX = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const moveClientY = moveEvent.type === 'touchmove' ? moveEvent.touches[0].clientY : moveEvent.clientY;

            const canvas = document.getElementById('map-canvas');
            const canvasRect = canvas.getBoundingClientRect();

            let left = ((moveClientX - this.dragOffset.x - canvasRect.left) / canvasRect.width) * 100;
            let top = ((moveClientY - this.dragOffset.y - canvasRect.top) / canvasRect.height) * 100;

            // Clamp to bounds
            left = Math.max(0, Math.min(100, left));
            top = Math.max(0, Math.min(100, top));

            marker.style.left = left + '%';
            marker.style.top = top + '%';
        };

        const onEnd = async () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);

            marker.classList.remove('dragging');

            if (this.isDragging) {
                // Save new position
                const newPosition = {
                    top: marker.style.top,
                    left: marker.style.left
                };

                location.position = newPosition;
                await this.updateLocationPosition(location.id, newPosition);

                // Update panel if this location is selected
                if (this.selectedLocation?.id === location.id) {
                    document.getElementById('coord-top').textContent = newPosition.top;
                    document.getElementById('coord-left').textContent = newPosition.left;
                }
            }

            // Reset drag state after short delay (for click detection)
            setTimeout(() => {
                this.isDragging = false;
            }, 100);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
    },

    async updateLocationPosition(locationId, position) {
        try {
            await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${locationId}`,
                'PUT',
                { position }
            );
        } catch (error) {
            this.toast('Failed to save position', 'error');
        }
    },

    // Location Selection
    selectLocation(locationId) {
        this.selectedLocation = this.currentMap.locations.find(l => l.id === locationId);
        if (!this.selectedLocation) return;

        // Update marker styles
        document.querySelectorAll('.location-marker').forEach(m => {
            m.classList.toggle('selected', m.dataset.locationId === locationId);
        });

        // Show panel with location data
        this.showLocationPanel();
    },

    showLocationPanel() {
        const panel = document.getElementById('location-panel');
        panel.classList.remove('hidden');

        const loc = this.selectedLocation;
        document.getElementById('location-id').value = loc.id;
        document.getElementById('location-number').value = loc.number || '';
        document.getElementById('location-name').value = loc.name || '';
        document.getElementById('location-description').value = loc.description || '';
        document.getElementById('location-fiber').value = loc.fiber || '';

        // Position display
        let top = loc.position?.top || '0%';
        let left = loc.position?.left || '0%';
        document.getElementById('coord-top').textContent = top;
        document.getElementById('coord-left').textContent = left;

        // Image preview
        const preview = document.getElementById('image-preview');
        if (loc.image) {
            preview.innerHTML = `<img src="${loc.image}" alt="Location image">`;
            document.getElementById('image-filename').textContent = loc.image;
        } else {
            preview.innerHTML = '';
            document.getElementById('image-filename').textContent = '';
        }
    },

    closeLocationPanel() {
        document.getElementById('location-panel').classList.add('hidden');
        document.querySelectorAll('.location-marker').forEach(m => m.classList.remove('selected'));
        this.selectedLocation = null;
    },

    // Add Location
    addLocationAtPosition(e) {
        if (!this.currentMap) return;

        const canvas = document.getElementById('map-canvas');
        const rect = canvas.getBoundingClientRect();

        const left = ((e.clientX - rect.left) / rect.width * 100).toFixed(2) + '%';
        const top = ((e.clientY - rect.top) / rect.height * 100).toFixed(2) + '%';

        // Find next available number
        const existingNumbers = this.currentMap.locations.map(l => l.number || 0);
        const nextNumber = Math.max(0, ...existingNumbers) + 1;

        this.createNewLocation({
            number: nextNumber,
            name: '',
            description: '',
            fiber: '',
            image: '',
            position: { top, left }
        });
    },

    async createNewLocation(locationData) {
        try {
            const response = await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations`,
                'POST',
                locationData
            );

            // Add to local data
            this.currentMap.locations.push(response);

            // Render new marker
            const container = document.getElementById('markers-container');
            container.appendChild(this.createMarker(response));

            // Select it
            this.selectLocation(response.id);

            this.toast('Location added', 'success');
        } catch (error) {
            this.toast('Failed to add location', 'error');
        }
    },

    // Save Location
    async saveLocation() {
        if (!this.selectedLocation) return;

        const updates = {
            number: parseInt(document.getElementById('location-number').value) || 0,
            name: document.getElementById('location-name').value,
            description: document.getElementById('location-description').value,
            fiber: document.getElementById('location-fiber').value
        };

        try {
            const response = await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${this.selectedLocation.id}`,
                'PUT',
                updates
            );

            // Update local data
            Object.assign(this.selectedLocation, response);

            // Update marker number
            const marker = document.querySelector(`[data-location-id="${this.selectedLocation.id}"]`);
            if (marker) {
                marker.querySelector('.marker-number').textContent = response.number || '';
            }

            this.toast('Location saved', 'success');
        } catch (error) {
            this.toast('Failed to save location', 'error');
        }
    },

    // Delete Location
    confirmDeleteLocation() {
        if (!this.selectedLocation) return;

        this.showConfirmModal(
            `Are you sure you want to delete "${this.selectedLocation.name || 'this location'}"?`,
            () => this.deleteLocation()
        );
    },

    async deleteLocation() {
        try {
            await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${this.selectedLocation.id}`,
                'DELETE'
            );

            // Remove from local data
            this.currentMap.locations = this.currentMap.locations.filter(l => l.id !== this.selectedLocation.id);

            // Remove marker
            const marker = document.querySelector(`[data-location-id="${this.selectedLocation.id}"]`);
            if (marker) marker.remove();

            this.closeLocationPanel();
            this.toast('Location deleted', 'success');
        } catch (error) {
            this.toast('Failed to delete location', 'error');
        }
    },

    // Image Upload
    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const response = await this.apiUpload('/api/upload', file);
            if (response.success) {
                this.selectedLocation.image = response.filename;

                // Update preview
                document.getElementById('image-preview').innerHTML = `<img src="${response.filename}" alt="Location image">`;
                document.getElementById('image-filename').textContent = response.filename;

                // Save to server
                await this.api(
                    `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${this.selectedLocation.id}`,
                    'PUT',
                    { image: response.filename }
                );

                this.toast('Image uploaded', 'success');
            } else {
                this.toast(response.error || 'Upload failed', 'error');
            }
        } catch (error) {
            this.toast('Failed to upload image', 'error');
        }

        e.target.value = '';
    },

    async handleMapImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const response = await this.apiUpload('/api/upload/map', file);
            if (response.success) {
                document.getElementById('map-image-preview').innerHTML = `<img src="${response.filename}" alt="Map image">`;
                document.getElementById('map-image-filename').textContent = response.filename;
                document.getElementById('map-form').dataset.newImage = response.filename;
                this.toast('Map image uploaded', 'success');
            } else {
                this.toast(response.error || 'Upload failed', 'error');
            }
        } catch (error) {
            this.toast('Failed to upload image', 'error');
        }

        e.target.value = '';
    },

    // Category CRUD
    showCategoryModal(category = null) {
        const modal = document.getElementById('category-modal');
        const title = document.getElementById('category-modal-title');
        const form = document.getElementById('category-form');

        if (category) {
            title.textContent = 'Edit Category';
            document.getElementById('category-id').value = category.id;
            document.getElementById('category-name').value = category.name;
            document.getElementById('category-slug').value = category.slug || '';
            document.getElementById('category-slug').dataset.manual = true;
        } else {
            title.textContent = 'Create New Category';
            form.reset();
            document.getElementById('category-id').value = '';
            delete document.getElementById('category-slug').dataset.manual;
        }

        modal.classList.remove('hidden');
    },

    async saveCategory() {
        const id = document.getElementById('category-id').value;
        const data = {
            name: document.getElementById('category-name').value,
            slug: document.getElementById('category-slug').value || this.generateSlug(document.getElementById('category-name').value)
        };

        try {
            if (id) {
                await this.api(`/api/categories/${id}`, 'PUT', data);
            } else {
                await this.api('/api/categories', 'POST', data);
            }

            this.closeModals();
            await this.loadData();
            this.toast(id ? 'Category updated' : 'Category created', 'success');
        } catch (error) {
            this.toast('Failed to save category', 'error');
        }
    },

    confirmDeleteCategory(categoryId) {
        this.showConfirmModal(
            'Are you sure you want to delete this category? Venues will become uncategorized.',
            () => this.deleteCategory(categoryId)
        );
    },

    async deleteCategory(categoryId) {
        try {
            await this.api(`/api/categories/${categoryId}`, 'DELETE');
            await this.loadData();
            this.toast('Category deleted', 'success');
        } catch (error) {
            this.toast('Failed to delete category', 'error');
        }
    },

    // Venue CRUD
    showVenueModal(venue = null) {
        const modal = document.getElementById('venue-modal');
        const title = document.getElementById('venue-modal-title');
        const form = document.getElementById('venue-form');

        this.updateVenueCategoryDropdown();

        if (venue) {
            title.textContent = 'Edit Venue';
            document.getElementById('venue-id').value = venue.id;
            document.getElementById('venue-name').value = venue.name;
            document.getElementById('venue-type').value = venue.type || 'arena';
            document.getElementById('venue-category').value = venue.category || '';
        } else {
            title.textContent = 'Create New Venue';
            form.reset();
            document.getElementById('venue-id').value = '';
        }

        modal.classList.remove('hidden');
    },

    updateVenueCategoryDropdown() {
        const select = document.getElementById('venue-category');
        select.innerHTML = '<option value="">-- Select Category --</option>';

        this.data.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            select.appendChild(option);
        });
    },

    async saveVenue() {
        const id = document.getElementById('venue-id').value;
        const data = {
            name: document.getElementById('venue-name').value,
            type: document.getElementById('venue-type').value,
            category: document.getElementById('venue-category').value || null
        };

        try {
            if (id) {
                await this.api(`/api/venues/${id}`, 'PUT', data);
            } else {
                await this.api('/api/venues', 'POST', data);
            }

            this.closeModals();
            await this.loadData();
            this.toast(id ? 'Venue updated' : 'Venue created', 'success');
        } catch (error) {
            this.toast('Failed to save venue', 'error');
        }
    },

    // Map CRUD
    showMapModal(edit = false) {
        const modal = document.getElementById('map-modal');
        const title = document.getElementById('map-modal-title');
        const form = document.getElementById('map-form');

        document.getElementById('map-image-preview').innerHTML = '';
        document.getElementById('map-image-filename').textContent = '';
        delete form.dataset.newImage;

        if (edit && this.currentMap) {
            title.textContent = 'Edit Map';
            document.getElementById('map-id').value = this.currentMap.id;
            document.getElementById('map-venue-id').value = this.currentVenue.id;
            document.getElementById('map-label').value = this.currentMap.label;
            document.getElementById('map-subtitle').value = this.currentMap.subtitle || '';

            if (this.currentMap.image) {
                document.getElementById('map-image-preview').innerHTML = `<img src="${this.currentMap.image}" alt="Map image">`;
                document.getElementById('map-image-filename').textContent = this.currentMap.image;
            }
        } else {
            title.textContent = 'Create New Map';
            form.reset();
            document.getElementById('map-id').value = '';
            document.getElementById('map-venue-id').value = this.currentVenue?.id || '';
        }

        modal.classList.remove('hidden');
    },

    async saveMap() {
        const id = document.getElementById('map-id').value;
        const venueId = document.getElementById('map-venue-id').value || this.currentVenue?.id;
        const form = document.getElementById('map-form');

        const data = {
            label: document.getElementById('map-label').value,
            subtitle: document.getElementById('map-subtitle').value
        };

        if (form.dataset.newImage) {
            data.image = form.dataset.newImage;
        }

        try {
            if (id) {
                await this.api(`/api/venues/${venueId}/maps/${id}`, 'PUT', data);
            } else {
                await this.api(`/api/venues/${venueId}/maps`, 'POST', data);
            }

            this.closeModals();
            await this.loadData();

            // Re-select current map if editing
            if (this.currentVenue && this.currentMap) {
                this.selectMap(this.currentVenue.id, this.currentMap.id);
            }

            this.toast(id ? 'Map updated' : 'Map created', 'success');
        } catch (error) {
            this.toast('Failed to save map', 'error');
        }
    },

    confirmDeleteMap() {
        if (!this.currentMap) return;

        this.showConfirmModal(
            `Are you sure you want to delete "${this.currentMap.label}"? All locations will be lost.`,
            () => this.deleteMap()
        );
    },

    async deleteMap() {
        try {
            await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}`,
                'DELETE'
            );

            this.currentMap = null;
            document.getElementById('empty-state').classList.remove('hidden');
            document.getElementById('map-editor').classList.add('hidden');

            await this.loadData();
            this.toast('Map deleted', 'success');
        } catch (error) {
            this.toast('Failed to delete map', 'error');
        }
    },

    // HTML Generation
    async generateHTML() {
        try {
            const response = await this.api('/api/generate-html', 'POST');
            if (response.success) {
                this.toast(`Generated: ${response.files.join(', ')}`, 'success');
            } else {
                this.toast(response.error || 'Generation failed', 'error');
            }
        } catch (error) {
            this.toast('Failed to generate HTML', 'error');
        }
    },

    // Utility Functions
    generateSlug(text) {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    // Modals
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    },

    showConfirmModal(message, onConfirm) {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-message').textContent = message;

        const confirmBtn = document.getElementById('confirm-action-btn');
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

        newBtn.addEventListener('click', () => {
            this.closeModals();
            onConfirm();
        });

        modal.classList.remove('hidden');
    },

    // Toast Notifications
    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => Admin.init());
