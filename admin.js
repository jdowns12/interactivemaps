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
    hasDraft: false,
    DRAFT_KEY: 'mapsDraft',

    // API Base URL
    apiBase: '',

    // Photo requests
    photoRequests: [],

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

        // Discard draft
        document.getElementById('discard-draft-btn').addEventListener('click', () => this.discardDraft());

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
        document.getElementById('delete-image-btn').addEventListener('click', () => this.deleteLocationImage());

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

        // Location list panel events
        document.getElementById('renumber-btn').addEventListener('click', () => this.renumberLocations());
        document.getElementById('location-search').addEventListener('input', (e) => this.filterLocationList(e.target.value));

        // Landing page section
        document.getElementById('landing-page-toggle').addEventListener('click', () => {
            const section = document.querySelector('.landing-page-section');
            const toggle = document.getElementById('landing-page-toggle');
            section.classList.toggle('expanded');
            toggle.classList.toggle('expanded');
        });

        document.getElementById('add-card-btn').addEventListener('click', () => this.showCardModal());
        document.getElementById('card-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCard();
        });

        document.getElementById('card-type').addEventListener('change', (e) => {
            const isCategory = e.target.value === 'category';
            document.getElementById('card-category-group').classList.toggle('hidden', !isCategory);
            document.getElementById('card-url-group').classList.toggle('hidden', isCategory);
        });

        // Notification bell
        document.getElementById('notification-bell').addEventListener('click', () => {
            this.toggleNotificationDropdown();
        });

        // Close notification dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const wrapper = document.querySelector('.notification-wrapper');
            const dropdown = document.getElementById('notification-dropdown');
            if (wrapper && !wrapper.contains(e.target) && !dropdown.classList.contains('hidden')) {
                dropdown.classList.add('hidden');
            }
        });
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

            // Ensure landingPage config exists
            if (!this.data.landingPage) {
                this.data.landingPage = { title: 'Athletics Information Hub', cards: [] };
            }

            this.renderNavTree();
            this.renderLandingPageCards();
            this.updateVenueCategoryCheckboxes();

            // Load photo requests
            await this.loadPhotoRequests();

            // Check for draft
            this.checkForDraft();
        } catch (error) {
            this.toast('Failed to load data', 'error');
        }
    },

    // Draft Mode Functions
    checkForDraft() {
        const draft = localStorage.getItem(this.DRAFT_KEY);
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                // Check if draft is recent (within 24 hours)
                if (parsed.timestamp && (Date.now() - parsed.timestamp) < 24 * 60 * 60 * 1000) {
                    this.showDraftIndicator(true);
                    this.hasDraft = true;

                    // Ask user if they want to load draft
                    if (confirm('You have unsaved changes from a previous session. Load draft?')) {
                        this.loadDraft();
                    }
                } else {
                    // Draft too old, remove it
                    localStorage.removeItem(this.DRAFT_KEY);
                }
            } catch (e) {
                localStorage.removeItem(this.DRAFT_KEY);
            }
        }
    },

    saveDraft() {
        const draft = {
            timestamp: Date.now(),
            data: this.data
        };
        localStorage.setItem(this.DRAFT_KEY, JSON.stringify(draft));
        this.hasDraft = true;
        this.showDraftIndicator(true);
    },

    loadDraft() {
        const draft = localStorage.getItem(this.DRAFT_KEY);
        if (draft) {
            try {
                const parsed = JSON.parse(draft);
                this.data = parsed.data;
                this.renderNavTree();
                this.renderLandingPageCards();
                this.updateVenueCategoryCheckboxes();
                this.toast('Draft loaded', 'info');
            } catch (e) {
                this.toast('Failed to load draft', 'error');
            }
        }
    },

    discardDraft() {
        if (confirm('Discard all unsaved changes and reload from server?')) {
            localStorage.removeItem(this.DRAFT_KEY);
            this.hasDraft = false;
            this.showDraftIndicator(false);
            this.loadData();
            this.toast('Draft discarded', 'info');
        }
    },

    clearDraft() {
        localStorage.removeItem(this.DRAFT_KEY);
        this.hasDraft = false;
        this.showDraftIndicator(false);
    },

    showDraftIndicator(show) {
        const indicator = document.getElementById('draft-indicator');
        const discardBtn = document.getElementById('discard-draft-btn');
        if (show) {
            indicator.classList.remove('hidden');
            discardBtn.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
            discardBtn.classList.add('hidden');
        }
    },

    // Landing Page Cards
    renderLandingPageCards() {
        const container = document.getElementById('landing-page-cards');
        container.innerHTML = '';

        const cards = this.data.landingPage?.cards || [];
        if (cards.length === 0) {
            container.innerHTML = '<div class="location-list-empty">No cards yet</div>';
            return;
        }

        // Sort by order
        const sortedCards = [...cards].sort((a, b) => (a.order || 0) - (b.order || 0));

        sortedCards.forEach(card => {
            const item = document.createElement('div');
            item.className = 'landing-card-item' + (card.visible === false ? ' hidden-card' : '');
            item.dataset.cardId = card.id;
            item.draggable = true;

            const typeLabel = card.type === 'custom' ? 'Custom URL' :
                (this.data.categories.find(c => c.id === card.categoryId)?.name || 'Category');

            item.innerHTML = `
                <span class="landing-card-drag">&#9776;</span>
                <div class="landing-card-info">
                    <div class="landing-card-title">${card.title}</div>
                    <div class="landing-card-type">${typeLabel}</div>
                </div>
                <div class="landing-card-actions">
                    <button class="visibility-toggle ${card.visible === false ? 'hidden-icon' : ''}" title="Toggle visibility">
                        ${card.visible === false ? '&#128065;&#8208;' : '&#128065;'}
                    </button>
                    <button class="edit-card" title="Edit">&#9998;</button>
                    <button class="delete-card" title="Delete">&times;</button>
                </div>
            `;

            // Click to edit
            item.querySelector('.edit-card').addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCardModal(card);
            });

            // Toggle visibility
            item.querySelector('.visibility-toggle').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCardVisibility(card.id);
            });

            // Delete
            item.querySelector('.delete-card').addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDeleteCard(card.id);
            });

            // Drag events
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('text/plain', card.id);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.reorderCards();
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = container.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        container.insertBefore(dragging, item);
                    } else {
                        container.insertBefore(dragging, item.nextSibling);
                    }
                }
            });

            container.appendChild(item);
        });
    },

    showCardModal(card = null) {
        const modal = document.getElementById('card-modal');
        const title = document.getElementById('card-modal-title');
        const form = document.getElementById('card-form');

        // Populate category dropdown
        const categorySelect = document.getElementById('card-category');
        categorySelect.innerHTML = '';
        this.data.categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });

        if (card) {
            title.textContent = 'Edit Card';
            document.getElementById('card-id').value = card.id;
            document.getElementById('card-title').value = card.title || '';
            document.getElementById('card-description').value = card.description || '';
            document.getElementById('card-button-text').value = card.buttonText || '';
            document.getElementById('card-type').value = card.type || 'category';
            document.getElementById('card-category').value = card.categoryId || '';
            document.getElementById('card-url').value = card.url || '';
            document.getElementById('card-visible').checked = card.visible !== false;

            const isCategory = card.type !== 'custom';
            document.getElementById('card-category-group').classList.toggle('hidden', !isCategory);
            document.getElementById('card-url-group').classList.toggle('hidden', isCategory);
        } else {
            title.textContent = 'Add Card';
            form.reset();
            document.getElementById('card-id').value = '';
            document.getElementById('card-visible').checked = true;
            document.getElementById('card-category-group').classList.remove('hidden');
            document.getElementById('card-url-group').classList.add('hidden');
        }

        modal.classList.remove('hidden');
    },

    async saveCard() {
        const id = document.getElementById('card-id').value;
        const cardData = {
            title: document.getElementById('card-title').value,
            description: document.getElementById('card-description').value,
            buttonText: document.getElementById('card-button-text').value,
            type: document.getElementById('card-type').value,
            visible: document.getElementById('card-visible').checked
        };

        if (cardData.type === 'category') {
            cardData.categoryId = document.getElementById('card-category').value;
        } else {
            cardData.url = document.getElementById('card-url').value;
        }

        if (!this.data.landingPage) {
            this.data.landingPage = { title: 'Athletics Information Hub', cards: [] };
        }

        if (id) {
            // Update existing
            const index = this.data.landingPage.cards.findIndex(c => c.id === id);
            if (index !== -1) {
                this.data.landingPage.cards[index] = { ...this.data.landingPage.cards[index], ...cardData };
            }
        } else {
            // Create new
            cardData.id = 'card-' + Date.now();
            cardData.order = this.data.landingPage.cards.length + 1;
            this.data.landingPage.cards.push(cardData);
        }

        try {
            await this.api('/api/data', 'POST', this.data);
            this.saveDraft(); // Save draft after changes
            this.closeModals();
            this.renderLandingPageCards();
            this.toast(id ? 'Card updated' : 'Card created', 'success');
        } catch (error) {
            this.toast('Failed to save card', 'error');
        }
    },

    async toggleCardVisibility(cardId) {
        const card = this.data.landingPage.cards.find(c => c.id === cardId);
        if (card) {
            card.visible = card.visible === false ? true : false;
            try {
                await this.api('/api/data', 'POST', this.data);
                this.saveDraft();
                this.renderLandingPageCards();
            } catch (error) {
                this.toast('Failed to update visibility', 'error');
            }
        }
    },

    confirmDeleteCard(cardId) {
        this.showConfirmModal(
            'Are you sure you want to delete this card?',
            () => this.deleteCard(cardId)
        );
    },

    async deleteCard(cardId) {
        this.data.landingPage.cards = this.data.landingPage.cards.filter(c => c.id !== cardId);
        try {
            await this.api('/api/data', 'POST', this.data);
            this.saveDraft();
            this.renderLandingPageCards();
            this.toast('Card deleted', 'success');
        } catch (error) {
            this.toast('Failed to delete card', 'error');
        }
    },

    async reorderCards() {
        const container = document.getElementById('landing-page-cards');
        const items = container.querySelectorAll('.landing-card-item');

        items.forEach((item, index) => {
            const cardId = item.dataset.cardId;
            const card = this.data.landingPage.cards.find(c => c.id === cardId);
            if (card) {
                card.order = index + 1;
            }
        });

        try {
            await this.api('/api/data', 'POST', this.data);
            this.saveDraft();
            this.toast('Cards reordered', 'success');
        } catch (error) {
            this.toast('Failed to save order', 'error');
        }
    },

    // Navigation Tree
    renderNavTree() {
        const tree = document.getElementById('nav-tree');
        tree.innerHTML = '';

        // Group venues by category (venue can appear in multiple categories)
        const categorizedVenues = {};
        const uncategorizedVenues = [];

        this.data.venues.forEach(venue => {
            // Support both old 'category' (string) and new 'categories' (array) format
            const categories = venue.categories || (venue.category ? [venue.category] : []);

            if (categories.length > 0) {
                categories.forEach(catId => {
                    if (!categorizedVenues[catId]) {
                        categorizedVenues[catId] = [];
                    }
                    categorizedVenues[catId].push(venue);
                });
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
                <div class="venue-actions">
                    <button class="edit-venue" title="Edit">&#9998;</button>
                    <button class="delete-venue" title="Delete">&times;</button>
                </div>
            </div>
            <div class="tree-maps"></div>
        `;

        const header = venueEl.querySelector('.tree-venue-header');
        header.addEventListener('click', (e) => {
            if (e.target.closest('.venue-actions')) return;
            venueEl.classList.toggle('expanded');
            // Select this venue so "+ Add Map" works
            this.currentVenue = venue;
            document.getElementById('add-map-btn').disabled = false;
        });

        // Edit venue
        venueEl.querySelector('.edit-venue').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showVenueModal(venue);
        });

        // Delete venue
        venueEl.querySelector('.delete-venue').addEventListener('click', (e) => {
            e.stopPropagation();
            this.confirmDeleteVenue(venue.id, venue.name);
        });

        const mapsContainer = venueEl.querySelector('.tree-maps');
        (venue.maps || []).forEach(map => {
            const mapEl = document.createElement('div');
            mapEl.className = 'tree-map';
            mapEl.dataset.venueId = venue.id;
            mapEl.dataset.mapId = map.id;
            mapEl.innerHTML = `
                <span class="map-label">${map.label}</span>
                <div class="map-actions">
                    <button class="edit-map-btn" title="Edit">&#9998;</button>
                    <button class="delete-map-btn" title="Delete">&times;</button>
                </div>
            `;

            mapEl.addEventListener('click', (e) => {
                if (e.target.closest('.map-actions')) return;
                this.selectMap(venue.id, map.id);
                document.querySelectorAll('.tree-map').forEach(el => el.classList.remove('active'));
                mapEl.classList.add('active');
            });

            // Edit map from sidebar
            mapEl.querySelector('.edit-map-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMap(venue.id, map.id);
                this.showMapModal(true);
            });

            // Delete map from sidebar
            mapEl.querySelector('.delete-map-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.currentVenue = venue;
                this.currentMap = map;
                this.confirmDeleteMap();
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

        // Also render location list
        this.renderLocationList();
    },

    // Location List Panel
    renderLocationList() {
        const list = document.getElementById('location-list');
        list.innerHTML = '';

        if (!this.currentMap || !this.currentMap.locations.length) {
            list.innerHTML = '<li class="location-list-empty">No locations yet. Double-click on map to add.</li>';
            return;
        }

        // Sort by number
        const sortedLocations = [...this.currentMap.locations].sort((a, b) => (a.number || 0) - (b.number || 0));

        sortedLocations.forEach(location => {
            const item = document.createElement('li');
            item.className = 'location-list-item';
            item.dataset.locationId = location.id;
            item.draggable = true;
            item.innerHTML = `
                <span class="location-list-drag">&#9776;</span>
                <span class="location-list-number">${location.number || ''}</span>
                <span class="location-list-name">${location.name || 'Unnamed'}</span>
            `;

            // Click to select
            item.addEventListener('click', () => {
                this.selectLocation(location.id);
                this.highlightMarkerOnMap(location.id);
            });

            // Drag events for reordering
            item.addEventListener('dragstart', (e) => {
                item.classList.add('dragging');
                e.dataTransfer.setData('text/plain', location.id);
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = list.querySelector('.dragging');
                if (dragging && dragging !== item) {
                    const rect = item.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    if (e.clientY < midY) {
                        list.insertBefore(dragging, item);
                    } else {
                        list.insertBefore(dragging, item.nextSibling);
                    }
                }
            });

            // Hover to highlight marker
            item.addEventListener('mouseenter', () => {
                const marker = document.querySelector(`[data-location-id="${location.id}"]`);
                if (marker) marker.style.transform = 'translate(-50%, -50%) scale(1.2)';
            });

            item.addEventListener('mouseleave', () => {
                const marker = document.querySelector(`[data-location-id="${location.id}"]`);
                if (marker && !marker.classList.contains('selected')) {
                    marker.style.transform = '';
                }
            });

            list.appendChild(item);
        });
    },

    highlightMarkerOnMap(locationId) {
        const marker = document.querySelector(`[data-location-id="${locationId}"]`);
        if (marker) {
            marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    filterLocationList(searchText) {
        const items = document.querySelectorAll('.location-list-item');
        const search = searchText.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('.location-list-name')?.textContent.toLowerCase() || '';
            const number = item.querySelector('.location-list-number')?.textContent || '';
            const matches = name.includes(search) || number.includes(search);
            item.style.display = matches ? '' : 'none';
        });
    },

    async renumberLocations() {
        if (!this.currentMap || !this.currentMap.locations.length) return;

        // Get current order from the list
        const listItems = document.querySelectorAll('.location-list-item');
        const updates = [];

        listItems.forEach((item, index) => {
            const locationId = item.dataset.locationId;
            const location = this.currentMap.locations.find(l => l.id === locationId);
            if (location) {
                const newNumber = index + 1;
                if (location.number !== newNumber) {
                    location.number = newNumber;
                    updates.push({ id: locationId, number: newNumber });
                }
            }
        });

        if (updates.length === 0) {
            this.toast('Locations already numbered correctly', 'info');
            return;
        }

        // Save all updates
        try {
            for (const update of updates) {
                await this.api(
                    `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${update.id}`,
                    'PUT',
                    { number: update.number }
                );
            }
            this.renderMarkers();
            this.toast(`Renumbered ${updates.length} locations`, 'success');
        } catch (error) {
            this.toast('Failed to renumber locations', 'error');
        }
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

        // Update location list selection
        document.querySelectorAll('.location-list-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.locationId === locationId);
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
        const deleteBtn = document.getElementById('delete-image-btn');
        if (loc.image) {
            preview.innerHTML = `<img src="${loc.image}" alt="Location image">`;
            document.getElementById('image-filename').textContent = loc.image;
            deleteBtn.classList.remove('hidden');
        } else {
            preview.innerHTML = '';
            document.getElementById('image-filename').textContent = '';
            deleteBtn.classList.add('hidden');
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
            this.renderLocationList();
            this.toast('Location deleted', 'success');
            // Auto-regenerate HTML pages
            await this.generateHTML();
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
                document.getElementById('delete-image-btn').classList.remove('hidden');

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

    async deleteLocationImage() {
        if (!this.selectedLocation || !this.selectedLocation.image) return;

        if (!confirm('Are you sure you want to delete this image?')) return;

        try {
            // Clear the image from the location
            await this.api(
                `/api/venues/${this.currentVenue.id}/maps/${this.currentMap.id}/locations/${this.selectedLocation.id}`,
                'PUT',
                { image: '' }
            );

            this.selectedLocation.image = '';

            // Update UI
            document.getElementById('image-preview').innerHTML = '';
            document.getElementById('image-filename').textContent = '';
            document.getElementById('delete-image-btn').classList.add('hidden');

            // Regenerate HTML
            await this.generateHTML();

            this.toast('Image deleted', 'success');
        } catch (error) {
            this.toast('Failed to delete image', 'error');
        }
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
            // Auto-regenerate HTML pages
            await this.generateHTML();
        } catch (error) {
            this.toast('Failed to delete category', 'error');
        }
    },

    // Venue CRUD
    showVenueModal(venue = null) {
        const modal = document.getElementById('venue-modal');
        const title = document.getElementById('venue-modal-title');
        const form = document.getElementById('venue-form');

        this.updateVenueCategoryCheckboxes();

        if (venue) {
            title.textContent = 'Edit Venue';
            document.getElementById('venue-id').value = venue.id;
            document.getElementById('venue-name').value = venue.name;
            document.getElementById('venue-type').value = venue.type || 'arena';

            // Check the appropriate category checkboxes
            const categories = venue.categories || (venue.category ? [venue.category] : []);
            document.querySelectorAll('input[name="venue-category"]').forEach(cb => {
                cb.checked = categories.includes(cb.value);
            });
        } else {
            title.textContent = 'Create New Venue';
            form.reset();
            document.getElementById('venue-id').value = '';
            // Uncheck all category checkboxes
            document.querySelectorAll('input[name="venue-category"]').forEach(cb => {
                cb.checked = false;
            });
        }

        modal.classList.remove('hidden');
    },

    updateVenueCategoryCheckboxes() {
        const container = document.getElementById('venue-categories');
        container.innerHTML = '';

        this.data.categories.forEach(cat => {
            const label = document.createElement('label');
            label.className = 'checkbox-label';
            label.innerHTML = `
                <input type="checkbox" name="venue-category" value="${cat.id}">
                <span>${cat.name}</span>
            `;
            container.appendChild(label);
        });
    },

    async saveVenue() {
        const id = document.getElementById('venue-id').value;

        // Get selected categories from checkboxes
        const selectedCategories = [];
        document.querySelectorAll('input[name="venue-category"]:checked').forEach(cb => {
            selectedCategories.push(cb.value);
        });

        const data = {
            name: document.getElementById('venue-name').value,
            type: document.getElementById('venue-type').value,
            categories: selectedCategories
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

    confirmDeleteVenue(venueId, venueName) {
        this.showConfirmModal(
            `Are you sure you want to delete "${venueName}"? All maps and locations will be lost.`,
            () => this.deleteVenue(venueId)
        );
    },

    async deleteVenue(venueId) {
        try {
            await this.api(`/api/venues/${venueId}`, 'DELETE');

            // Clear current selection if deleted venue was selected
            if (this.currentVenue?.id === venueId) {
                this.currentVenue = null;
                this.currentMap = null;
                document.getElementById('empty-state').classList.remove('hidden');
                document.getElementById('map-editor').classList.add('hidden');
            }

            await this.loadData();
            this.toast('Venue deleted', 'success');
            // Auto-regenerate HTML pages
            await this.generateHTML();
        } catch (error) {
            this.toast('Failed to delete venue', 'error');
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
            // Auto-regenerate HTML pages
            await this.generateHTML();
        } catch (error) {
            this.toast('Failed to delete map', 'error');
        }
    },

    // HTML Generation (Publish)
    async generateHTML() {
        try {
            const response = await this.api('/api/generate-html', 'POST');
            if (response.success) {
                // Clear draft after successful publish
                this.clearDraft();
                this.toast(`Published: ${response.files.join(', ')}`, 'success');
            } else {
                this.toast(response.error || 'Generation failed', 'error');
            }
        } catch (error) {
            this.toast('Failed to publish', 'error');
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

    // Photo Request Functions
    async loadPhotoRequests() {
        try {
            const response = await this.api('/api/photo-requests');
            this.photoRequests = response || [];
            this.updateNotificationBadge();
            this.renderNotificationList();
        } catch (error) {
            console.error('Failed to load photo requests:', error);
        }
    },

    updateNotificationBadge() {
        const badge = document.getElementById('notification-badge');
        const bell = document.getElementById('notification-bell');
        const count = this.photoRequests.length;

        if (count > 0) {
            badge.textContent = count > 9 ? '9+' : count;
            badge.classList.remove('hidden');
            bell.classList.add('has-notifications');
        } else {
            badge.classList.add('hidden');
            bell.classList.remove('has-notifications');
        }
    },

    toggleNotificationDropdown() {
        const dropdown = document.getElementById('notification-dropdown');
        dropdown.classList.toggle('hidden');
    },

    renderNotificationList() {
        const list = document.getElementById('notification-list');
        const empty = document.getElementById('notification-empty');

        list.innerHTML = '';

        if (this.photoRequests.length === 0) {
            list.classList.add('hidden');
            empty.classList.remove('hidden');
            return;
        }

        list.classList.remove('hidden');
        empty.classList.add('hidden');

        this.photoRequests.forEach(request => {
            const item = document.createElement('div');
            item.className = 'notification-item';

            // Format time ago
            const timeAgo = this.formatTimeAgo(request.requestedAt);

            item.innerHTML = `
                <div class="notification-item-header">
                    <span class="notification-icon">📷</span>
                    <div class="notification-info">
                        <div class="notification-location">${this.escapeHtml(request.locationName)}</div>
                        <div class="notification-path">${this.escapeHtml(request.venueName)} > ${this.escapeHtml(request.mapLabel)}</div>
                        <div class="notification-time">${timeAgo}</div>
                    </div>
                </div>
                ${request.uploadedPhoto ? `
                    <div class="notification-photo-preview">
                        <img src="${request.uploadedPhoto}" alt="Uploaded photo">
                    </div>
                ` : ''}
                <div class="notification-actions">
                    ${request.uploadedPhoto ? `
                        <button class="btn btn-primary approve-btn" data-id="${request.id}">Add Photo</button>
                    ` : ''}
                    <button class="btn btn-secondary go-btn" data-id="${request.id}" data-venue="${request.venueId}" data-map="${request.mapId}" data-location="${request.locationId}">Go to Location</button>
                    <button class="btn btn-outline dismiss-btn" data-id="${request.id}">Dismiss</button>
                </div>
            `;

            // Approve button
            const approveBtn = item.querySelector('.approve-btn');
            if (approveBtn) {
                approveBtn.addEventListener('click', () => this.approvePhotoRequest(request.id));
            }

            // Go to location button
            const goBtn = item.querySelector('.go-btn');
            goBtn.addEventListener('click', () => {
                this.goToRequestedLocation(request.venueId, request.mapId, request.locationId);
                document.getElementById('notification-dropdown').classList.add('hidden');
            });

            // Dismiss button
            const dismissBtn = item.querySelector('.dismiss-btn');
            dismissBtn.addEventListener('click', () => this.dismissPhotoRequest(request.id));

            list.appendChild(item);
        });
    },

    async approvePhotoRequest(requestId) {
        try {
            const response = await this.api(`/api/photo-requests/${requestId}/approve`, 'POST');
            if (response.success) {
                this.toast('Photo added to location!', 'success');
                await this.loadPhotoRequests();
                await this.loadData(); // Reload to get updated location image
                // Regenerate HTML
                await this.generateHTML();
            } else {
                this.toast(response.error || 'Failed to approve', 'error');
            }
        } catch (error) {
            this.toast('Failed to approve photo request', 'error');
        }
    },

    async dismissPhotoRequest(requestId) {
        try {
            const response = await this.api(`/api/photo-requests/${requestId}`, 'DELETE');
            if (response.success) {
                this.toast('Request dismissed', 'info');
                await this.loadPhotoRequests();
            } else {
                this.toast(response.error || 'Failed to dismiss', 'error');
            }
        } catch (error) {
            this.toast('Failed to dismiss request', 'error');
        }
    },

    goToRequestedLocation(venueId, mapId, locationId) {
        // Find and expand the venue in the tree
        const venueHeaders = document.querySelectorAll('.tree-venue-header');
        venueHeaders.forEach(header => {
            if (header.dataset.venueId === venueId) {
                const venue = header.closest('.tree-venue');
                if (venue) {
                    venue.classList.add('expanded');
                    // Also expand the parent category
                    const category = venue.closest('.tree-category');
                    if (category) {
                        category.classList.add('expanded');
                        category.querySelector('.tree-category-header')?.classList.add('expanded');
                    }
                }
            }
        });

        // Select the map
        this.selectMap(venueId, mapId);

        // After a short delay, select the location
        setTimeout(() => {
            if (locationId) {
                this.selectLocation(locationId);
            }
        }, 300);
    },

    formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return date.toLocaleDateString();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

/**
 * Tutorial System - Interactive Walkthrough with Example Data
 */
const Tutorial = {
    // State
    active: false,
    currentStep: 0,
    tutorialData: {
        categoryId: null,
        venueId: null,
        mapId: null,
        locationIds: []
    },
    highlightedElement: null,

    // DOM Elements
    container: null,
    backdrop: null,
    popover: null,
    titleEl: null,
    contentEl: null,
    counterEl: null,
    backBtn: null,
    nextBtn: null,
    skipBtn: null,

    // Step Definitions
    steps: [
        {
            id: 'welcome',
            type: 'fullscreen',
            title: 'Welcome to the WEP Maps Admin Tour!',
            content: "Let's create an example page together. You'll learn how to add categories, venues, maps, and locations. Don't worry - you can delete the example data at the end!",
            buttons: { next: 'Start Tour', skip: 'Skip' },
            hideBack: true
        },
        {
            id: 'create-category',
            type: 'highlight',
            target: '#add-category-btn',
            title: 'Step 1: Create a Category',
            content: 'Categories become pages on your site (like Fiber.html or ESPN.html). Click the "+ Add Category" button to create one.',
            position: 'right',
            waitFor: 'modal-open',
            prefill: { 'category-name': 'Tutorial Example', 'category-slug': 'tutorial-example' }
        },
        {
            id: 'save-category',
            type: 'highlight',
            target: '#category-form button[type="submit"]',
            title: 'Save the Category',
            content: 'The form has been pre-filled with example data. Click "Save" to create your category. This will generate a "Tutorial-Example.html" page.',
            position: 'top',
            waitFor: 'modal-close',
            trackCreate: 'category'
        },
        {
            id: 'create-venue',
            type: 'highlight',
            target: '#add-venue-btn',
            title: 'Step 2: Create a Venue',
            content: 'Venues are physical locations like Jordan-Hare Stadium or Neville Arena. Click "+ Add Venue" to add one.',
            position: 'right',
            waitFor: 'modal-open',
            prefill: { 'venue-name': 'Example Venue' }
        },
        {
            id: 'save-venue',
            type: 'highlight',
            target: '#venue-form button[type="submit"]',
            title: 'Save the Venue',
            content: 'Make sure to check the "Tutorial Example" category so this venue appears on that page. Click "Save" to create it.',
            position: 'top',
            waitFor: 'modal-close',
            trackCreate: 'venue',
            onEnter: () => {
                // Check the tutorial category checkbox
                setTimeout(() => {
                    const checkboxes = document.querySelectorAll('input[name="venue-category"]');
                    checkboxes.forEach(cb => {
                        if (cb.nextElementSibling?.textContent?.includes('Tutorial Example')) {
                            cb.checked = true;
                        }
                    });
                }, 100);
            }
        },
        {
            id: 'expand-venue',
            type: 'highlight',
            target: '.tree-venue-header',
            targetFn: () => {
                // Find the Example Venue in the tree
                const venues = document.querySelectorAll('.tree-venue-header');
                for (const v of venues) {
                    if (v.textContent.includes('Example Venue')) return v;
                }
                return venues[0];
            },
            title: 'Expand the Venue',
            content: 'Click on your venue to expand it. This reveals the maps inside.',
            position: 'right',
            waitFor: 'click'
        },
        {
            id: 'create-map',
            type: 'highlight',
            target: '#add-map-btn',
            title: 'Step 3: Add a Map',
            content: 'Maps are different views or floors of a venue. Click "+ Add Map" to create one.',
            position: 'right',
            waitFor: 'modal-open',
            prefill: { 'map-label': 'Main Floor', 'map-subtitle': 'Example Level' }
        },
        {
            id: 'save-map',
            type: 'highlight',
            target: '#map-form button[type="submit"]',
            title: 'Save the Map',
            content: 'You can upload a map image later. For now, click "Save" to create the map with the example data.',
            position: 'top',
            waitFor: 'modal-close',
            trackCreate: 'map'
        },
        {
            id: 'select-map',
            type: 'highlight',
            target: '.tree-map',
            targetFn: () => {
                // Find the Main Floor map
                const maps = document.querySelectorAll('.tree-map');
                for (const m of maps) {
                    if (m.textContent.includes('Main Floor')) return m;
                }
                return maps[maps.length - 1];
            },
            title: 'Select the Map',
            content: 'Click on the map to open the editor. This is where you position markers.',
            position: 'right',
            waitFor: 'click'
        },
        {
            id: 'add-location',
            type: 'highlight',
            target: '#map-canvas',
            title: 'Step 4: Add a Location',
            content: 'Double-click anywhere on the map to add a location marker. Try it now!',
            position: 'left',
            waitFor: 'dblclick',
            trackCreate: 'location'
        },
        {
            id: 'edit-location',
            type: 'highlight',
            target: '#location-panel',
            targetFn: () => document.getElementById('location-panel'),
            title: 'Edit Location Details',
            content: 'The location panel opens automatically. Here you can set the name, description, fiber info, and upload an image. Try editing the fields, then click "Save Location".',
            position: 'left',
            waitFor: 'click',
            waitForTarget: '#location-form button[type="submit"]'
        },
        {
            id: 'photo-requests',
            type: 'highlight',
            target: '.notification-bell',
            title: 'Photo Request Notifications',
            content: 'When users view a location without a photo, they can request one and optionally upload a suggested photo. You\'ll see a notification badge here showing how many photos have been requested. Click the bell to view requests, approve photos, or navigate directly to those locations.',
            position: 'bottom',
            buttons: { next: 'Got it!', skip: 'Skip' }
        },
        {
            id: 'drag-marker',
            type: 'highlight',
            target: '.location-marker',
            title: 'Drag to Reposition',
            content: 'You can drag any marker to move it. The position is saved automatically. Try dragging the marker!',
            position: 'bottom',
            buttons: { next: 'Continue', skip: 'Skip' }
        },
        {
            id: 'publish',
            type: 'highlight',
            target: '#generate-html-btn',
            title: 'Step 5: Publish Changes',
            content: 'When you\'re ready, click "Publish Changes" to regenerate the HTML pages. This updates the live site.',
            position: 'top',
            waitFor: 'click'
        },
        {
            id: 'complete',
            type: 'fullscreen',
            completion: true,
            title: 'Tutorial Complete!',
            content: 'Congratulations! You\'ve created a complete page with a venue, map, and location. You can view it at Tutorial-Example.html.\n\nWould you like to keep the example data or delete it?',
            buttons: { next: 'Keep Example Data', skip: 'Delete Example & Finish' },
            hideBack: true
        }
    ],

    // Initialize
    init() {
        this.container = document.getElementById('tutorial-container');
        this.backdrop = this.container.querySelector('.tutorial-backdrop');
        this.popover = this.container.querySelector('.tutorial-popover');
        this.titleEl = this.popover.querySelector('.tutorial-title');
        this.contentEl = this.popover.querySelector('.tutorial-content');
        this.counterEl = this.popover.querySelector('.tutorial-step-counter');
        this.backBtn = this.popover.querySelector('.tutorial-back');
        this.nextBtn = this.popover.querySelector('.tutorial-next');
        this.skipBtn = this.popover.querySelector('.tutorial-skip');

        this.bindEvents();
    },

    bindEvents() {
        // Entry points
        document.getElementById('tutorial-start-btn')?.addEventListener('click', () => this.start());
        document.getElementById('tutorial-help-btn')?.addEventListener('click', () => this.start());

        // Navigation
        this.backBtn.addEventListener('click', () => this.prev());
        this.nextBtn.addEventListener('click', () => this.next());
        this.skipBtn.addEventListener('click', () => this.skip());
        this.popover.querySelector('.tutorial-close').addEventListener('click', () => this.skip());

        // Backdrop click (don't close, just indicate)
        this.backdrop.addEventListener('click', (e) => {
            if (e.target === this.backdrop) {
                this.popover.style.animation = 'none';
                this.popover.offsetHeight; // Trigger reflow
                this.popover.style.animation = 'tutorial-popover-in 0.3s ease';
            }
        });
    },

    // Start tutorial
    start() {
        this.active = true;
        this.currentStep = 0;
        this.tutorialData = { categoryId: null, venueId: null, mapId: null, locationIds: [] };
        this.container.classList.remove('hidden');
        this.showStep(0);
        localStorage.setItem('tutorialStarted', 'true');
    },

    // Show a specific step
    showStep(index) {
        if (index < 0 || index >= this.steps.length) return;

        this.currentStep = index;
        const step = this.steps[index];

        // Clear previous highlight
        this.clearHighlight();

        // Update counter
        this.counterEl.textContent = `Step ${index + 1} of ${this.steps.length}`;

        // Update content
        this.titleEl.textContent = step.title;
        this.contentEl.textContent = step.content;

        // Update buttons
        this.backBtn.style.display = step.hideBack ? 'none' : '';
        this.backBtn.disabled = index === 0;
        this.nextBtn.textContent = step.buttons?.next || 'Next';
        this.skipBtn.textContent = step.buttons?.skip || 'Skip Tutorial';

        // Handle step type
        if (step.type === 'fullscreen') {
            this.showFullscreen(step);
        } else if (step.type === 'highlight') {
            this.showHighlight(step);
        }

        // Call onEnter if defined
        if (step.onEnter) {
            step.onEnter();
        }

        // Pre-fill form if specified
        if (step.prefill) {
            setTimeout(() => this.prefillForm(step.prefill), 200);
        }

        // Set up waitFor listener
        if (step.waitFor) {
            this.setupWaitFor(step);
        }
    },

    showFullscreen(step) {
        this.popover.className = 'tutorial-popover fullscreen-mode';
        if (step.completion) {
            this.popover.classList.add('completion-mode');
        }
        this.popover.style.top = '';
        this.popover.style.left = '';
        this.backdrop.classList.remove('has-spotlight');
    },

    showHighlight(step) {
        this.popover.className = 'tutorial-popover';

        // Find target element
        let target = step.targetFn ? step.targetFn() : document.querySelector(step.target);

        if (!target) {
            // Target not found, show as fullscreen
            this.showFullscreen(step);
            return;
        }

        // Highlight the target
        this.highlightElement(target);

        // Position popover near target
        this.positionPopover(target, step.position || 'right');
    },

    highlightElement(element) {
        this.highlightedElement = element;
        element.classList.add('tutorial-highlight');

        // Create spotlight effect using backdrop
        this.backdrop.classList.add('has-spotlight');
        const rect = element.getBoundingClientRect();
        const padding = 8;

        // Use a large box-shadow to create the spotlight cutout effect
        this.backdrop.style.boxShadow = `
            0 0 0 9999px rgba(0, 0, 0, 0.7),
            0 0 0 ${padding}px rgba(232, 119, 34, 0.3) inset
        `;
        this.backdrop.style.top = (rect.top - padding) + 'px';
        this.backdrop.style.left = (rect.left - padding) + 'px';
        this.backdrop.style.width = (rect.width + padding * 2) + 'px';
        this.backdrop.style.height = (rect.height + padding * 2) + 'px';
        this.backdrop.style.borderRadius = '8px';

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    clearHighlight() {
        if (this.highlightedElement) {
            this.highlightedElement.classList.remove('tutorial-highlight');
            this.highlightedElement = null;
        }
        this.backdrop.classList.remove('has-spotlight');
        this.backdrop.style = '';

        // Remove any event listeners
        if (this.waitForListener) {
            document.removeEventListener(this.waitForEvent, this.waitForListener);
            this.waitForListener = null;
        }
    },

    positionPopover(target, position) {
        const rect = target.getBoundingClientRect();
        const popoverRect = this.popover.getBoundingClientRect();
        const padding = 20;

        let top, left;

        // Remove all position classes
        this.popover.classList.remove('position-right', 'position-left', 'position-top', 'position-bottom', 'position-center');

        switch (position) {
            case 'right':
                top = rect.top;
                left = rect.right + padding;
                if (left + 400 > window.innerWidth) {
                    // Not enough space on right, try left
                    left = rect.left - 400 - padding;
                    position = 'left';
                }
                break;
            case 'left':
                top = rect.top;
                left = rect.left - 400 - padding;
                if (left < 0) {
                    left = rect.right + padding;
                    position = 'right';
                }
                break;
            case 'bottom':
                top = rect.bottom + padding;
                left = rect.left;
                break;
            case 'top':
                top = rect.top - popoverRect.height - padding;
                left = rect.left;
                break;
            default:
                top = rect.top;
                left = rect.right + padding;
        }

        // Keep within viewport
        top = Math.max(10, Math.min(top, window.innerHeight - 300));
        left = Math.max(10, Math.min(left, window.innerWidth - 420));

        this.popover.style.top = top + 'px';
        this.popover.style.left = left + 'px';
        this.popover.classList.add('position-' + position);
    },

    prefillForm(data) {
        Object.entries(data).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });
    },

    setupWaitFor(step) {
        const waitFor = step.waitFor;

        if (waitFor === 'modal-open') {
            // Wait for any modal to open
            this.waitForListener = () => {
                const openModal = document.querySelector('.modal:not(.hidden)');
                if (openModal && this.active) {
                    setTimeout(() => this.next(), 300);
                }
            };
            // Use MutationObserver instead
            const observer = new MutationObserver(() => {
                const openModal = document.querySelector('.modal:not(.hidden)');
                if (openModal && this.active) {
                    observer.disconnect();
                    setTimeout(() => this.next(), 300);
                }
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
            this.waitForObserver = observer;
        } else if (waitFor === 'modal-close') {
            // Wait for modal to close (category/venue/map saved)
            const observer = new MutationObserver(() => {
                const openModal = document.querySelector('.modal:not(.hidden)');
                if (!openModal && this.active) {
                    observer.disconnect();
                    // Track created item
                    if (step.trackCreate) {
                        this.trackCreatedItem(step.trackCreate);
                    }
                    setTimeout(() => this.next(), 500);
                }
            });
            observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
            this.waitForObserver = observer;
        } else if (waitFor === 'click' || waitFor === 'dblclick') {
            const target = step.waitForTarget
                ? document.querySelector(step.waitForTarget)
                : (step.targetFn ? step.targetFn() : document.querySelector(step.target));

            if (target) {
                this.waitForListener = () => {
                    if (this.active) {
                        if (step.trackCreate) {
                            this.trackCreatedItem(step.trackCreate);
                        }
                        setTimeout(() => this.next(), 300);
                    }
                };
                this.waitForEvent = waitFor;
                target.addEventListener(waitFor, this.waitForListener, { once: true });
            }
        }
    },

    trackCreatedItem(type) {
        // Track the most recently created item of this type
        if (type === 'category' && Admin.data.categories.length > 0) {
            const cat = Admin.data.categories.find(c => c.name === 'Tutorial Example');
            if (cat) this.tutorialData.categoryId = cat.id;
        } else if (type === 'venue' && Admin.data.venues.length > 0) {
            const venue = Admin.data.venues.find(v => v.name === 'Example Venue');
            if (venue) this.tutorialData.venueId = venue.id;
        } else if (type === 'map' && Admin.currentVenue?.maps?.length > 0) {
            const map = Admin.currentVenue.maps.find(m => m.label === 'Main Floor');
            if (map) this.tutorialData.mapId = map.id;
        } else if (type === 'location' && Admin.currentMap?.locations?.length > 0) {
            const lastLoc = Admin.currentMap.locations[Admin.currentMap.locations.length - 1];
            if (lastLoc && !this.tutorialData.locationIds.includes(lastLoc.id)) {
                this.tutorialData.locationIds.push(lastLoc.id);
            }
        }
    },

    // Navigation
    next() {
        const step = this.steps[this.currentStep];

        // Handle completion step
        if (step.id === 'complete') {
            this.finish(false); // Keep data
            return;
        }

        // Clean up observer
        if (this.waitForObserver) {
            this.waitForObserver.disconnect();
            this.waitForObserver = null;
        }

        if (this.currentStep < this.steps.length - 1) {
            this.showStep(this.currentStep + 1);
        }
    },

    prev() {
        if (this.waitForObserver) {
            this.waitForObserver.disconnect();
            this.waitForObserver = null;
        }

        if (this.currentStep > 0) {
            this.showStep(this.currentStep - 1);
        }
    },

    skip() {
        const step = this.steps[this.currentStep];

        // On completion step, skip means delete
        if (step.id === 'complete') {
            this.finish(true); // Delete data
            return;
        }

        // Otherwise ask for confirmation
        if (confirm('Exit the tutorial? Any example data created will remain (you can delete it manually).')) {
            this.finish(false);
        }
    },

    // Finish tutorial
    async finish(deleteData = false) {
        this.active = false;
        this.clearHighlight();

        if (this.waitForObserver) {
            this.waitForObserver.disconnect();
            this.waitForObserver = null;
        }

        if (deleteData) {
            await this.cleanup();
            Admin.toast('Tutorial complete! Example data deleted.', 'success');
        } else {
            Admin.toast('Tutorial complete! Example data kept.', 'success');
        }

        this.container.classList.add('hidden');
        localStorage.setItem('tutorialCompleted', 'true');
    },

    // Cleanup example data
    async cleanup() {
        try {
            // Delete category (cascades to remove venue associations)
            if (this.tutorialData.categoryId) {
                await Admin.api(`/api/categories/${this.tutorialData.categoryId}`, 'DELETE');
            }

            // Delete venue (cascades to delete maps and locations)
            if (this.tutorialData.venueId) {
                await Admin.api(`/api/venues/${this.tutorialData.venueId}`, 'DELETE');
            }

            // Regenerate HTML
            await Admin.generateHTML();

            // Reload data
            await Admin.loadData();

            // Reset tutorial data
            this.tutorialData = { categoryId: null, venueId: null, mapId: null, locationIds: [] };

        } catch (error) {
            console.error('Tutorial cleanup error:', error);
            Admin.toast('Some example data may not have been deleted', 'warning');
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Admin.init();
    Tutorial.init();
});
