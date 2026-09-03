/**
 * Full-Text Search Module
 * Provides search across all venue data
 */

const SearchModule = {
  data: null,
  searchIndex: [],
  searchInput: null,
  resultsContainer: null,
  selectedIndex: -1,

  // Initialize search
  async init() {
    // The search elements are injected by header.js after it fetches
    // data.json, so they may not exist yet on DOMContentLoaded — wait for them.
    for (let i = 0; i < 50; i++) {
      this.searchInput = document.getElementById('global-search');
      this.resultsContainer = document.getElementById('search-results');
      if (this.searchInput && this.resultsContainer) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.searchInput || !this.resultsContainer) {
      console.warn('Search elements not found');
      return;
    }

    // Load data
    await this.loadData();

    // Build search index
    this.buildIndex();

    // Setup event listeners
    this.setupListeners();
  },

  // Load venue data
  async loadData() {
    try {
      const response = await fetch('data.json');
      this.data = await response.json();
    } catch (error) {
      console.error('Failed to load data.json:', error);
      // Fallback: build index from DOM
      this.buildIndexFromDOM();
    }
  },

  // Build search index from data.json
  buildIndex() {
    if (!this.data) return;

    this.data.venues.forEach(venue => {
      venue.maps.forEach(map => {
        map.locations.forEach(location => {
          this.searchIndex.push({
            type: 'location',
            venue: venue.name,
            venueId: venue.id,
            venueCategories: Array.isArray(venue.categories)
              ? venue.categories
              : (venue.category ? [venue.category] : []),
            map: map.label,
            mapId: map.id,
            name: location.name,
            locationId: location.id,
            number: location.number,
            description: location.description,
            fiber: location.fiber || '',
            searchText: [
              venue.name,
              map.label,
              location.name,
              location.description,
              location.fiber
            ].join(' ').toLowerCase()
          });
        });
      });
    });
  },

  // Fallback: Build index from the markers on this page
  buildIndexFromDOM() {
    document.querySelectorAll('.location-marker').forEach(marker => {
      const d = marker.dataset;
      this.searchIndex.push({
        type: 'location',
        venue: d.venueName || '',
        venueId: d.venueId || '',
        venueCategories: [],
        map: d.mapLabel || '',
        mapId: d.mapId || '',
        name: d.name || '',
        locationId: d.locationId || '',
        number: d.number || '',
        description: d.description || '',
        fiber: d.fiber || '',
        searchText: [d.venueName, d.mapLabel, d.name, d.description, d.fiber]
          .filter(Boolean).join(' ').toLowerCase()
      });
    });
  },

  // Setup event listeners
  setupListeners() {
    let debounceTimer;

    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.search(e.target.value);
      }, 200);
    });

    this.searchInput.addEventListener('focus', () => {
      if (this.searchInput.value.length >= 2) {
        this.resultsContainer.classList.add('visible');
      }
    });

    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.header-search')) {
        this.resultsContainer.classList.remove('visible');
      }
    });

    // Keyboard navigation
    this.searchInput.addEventListener('keydown', (e) => {
      const items = this.resultsContainer.querySelectorAll('.search-result-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection(items);
      } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
        e.preventDefault();
        items[this.selectedIndex]?.click();
      } else if (e.key === 'Escape') {
        this.resultsContainer.classList.remove('visible');
        this.searchInput.blur();
      }
    });
  },

  // Update keyboard selection
  updateSelection(items) {
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });

    if (this.selectedIndex >= 0) {
      items[this.selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  },

  // Perform search
  search(query) {
    if (query.length < 2) {
      this.resultsContainer.classList.remove('visible');
      return;
    }

    const searchTerms = query.toLowerCase().split(' ').filter(t => t.length > 0);
    const results = this.searchIndex.filter(item => {
      return searchTerms.every(term => item.searchText.includes(term));
    });

    this.displayResults(results, query);
    this.selectedIndex = -1;
  },

  // Display search results
  displayResults(results, query) {
    if (results.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="search-result-item" style="text-align: center; color: #666;">
          No results found for "${query}"
        </div>
      `;
      this.resultsContainer.classList.add('visible');
      return;
    }

    // Group by venue
    const grouped = {};
    results.forEach(result => {
      if (!grouped[result.venue]) {
        grouped[result.venue] = [];
      }
      grouped[result.venue].push(result);
    });

    let html = '';
    for (const [venue, items] of Object.entries(grouped)) {
      html += `
        <div class="search-results-group">
          <div class="search-results-group-title">${venue}</div>
          ${items.map(item => `
            <div class="search-result-item"
                 data-map-id="${item.mapId}"
                 data-location-id="${item.locationId}">
              <strong>${this.highlight(item.name, query)}</strong>
              ${item.fiber ? `<span style="color: #E87722; font-size: 0.8em; margin-left: 8px;">${item.fiber}</span>` : ''}
              <small>${this.highlight(item.description.substring(0, 80), query)}${item.description.length > 80 ? '...' : ''}</small>
            </div>
          `).join('')}
        </div>
      `;
    }

    this.resultsContainer.innerHTML = html;
    this.resultsContainer.classList.add('visible');

    // Add click handlers
    this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const mapId = item.dataset.mapId;
        const locationId = item.dataset.locationId;
        const result = results.find(r => r.mapId === mapId && r.locationId === locationId);
        this.navigateToLocation(mapId, locationId, result);
      });
    });
  },

  // Highlight search terms
  highlight(text, query) {
    if (!text) return '';
    const terms = query.toLowerCase().split(' ').filter(t => t.length > 0);
    let result = text;
    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      result = result.replace(regex, '<mark>$1</mark>');
    });
    return result;
  },

  // Current page's file name (e.g. "Fiber.html")
  currentPage() {
    return decodeURIComponent(window.location.pathname.split('/').pop() || '') || 'index.html';
  },

  // Work out which category page hosts this result's venue.
  // Prefers a category other than the current page (we already know the map
  // is not here), falls back to the first category the venue belongs to.
  categoryPageFor(result) {
    if (!this.data || !Array.isArray(this.data.categories)) return null;
    const categories = this.data.categories;
    const venueCats = result && Array.isArray(result.venueCategories) ? result.venueCategories : [];
    const current = this.currentPage().toLowerCase();
    const candidates = venueCats
      .map(id => categories.find(c => c.id === id))
      .filter(c => c && c.slug);
    if (candidates.length === 0) return null;
    const other = candidates.find(c => `${c.slug}.html`.toLowerCase() !== current);
    return `${(other || candidates[0]).slug}.html`;
  },

  // Build overlay data from a marker (shared helper from script.js if present)
  markerData(marker) {
    if (window.WEPMaps && typeof window.WEPMaps.markerToLocationData === 'function') {
      return window.WEPMaps.markerToLocationData(marker);
    }
    let images = [];
    try {
      const parsed = JSON.parse(marker.dataset.images || 'null');
      if (Array.isArray(parsed)) images = parsed.filter(Boolean);
    } catch (e) { /* fall back */ }
    if (images.length === 0 && marker.dataset.image) images = [marker.dataset.image];
    return {
      number: marker.dataset.number || '',
      name: marker.dataset.name || 'Location',
      description: marker.dataset.description || '',
      fiber: marker.dataset.fiber || '',
      image: images[0] || '',
      images: images,
      locationId: marker.dataset.locationId || '',
      venueId: marker.dataset.venueId || '',
      mapId: marker.dataset.mapId || '',
      venueName: marker.dataset.venueName || '',
      mapLabel: marker.dataset.mapLabel || ''
    };
  },

  // Navigate to a location. If its map is not on this page, jump to the
  // category page that has it (<slug>.html#<mapId>); script.js expands the
  // map on load and opens the stashed location.
  navigateToLocation(mapId, locationId, result) {
    this.resultsContainer.classList.remove('visible');
    this.searchInput.value = '';

    const mapPanel = document.getElementById(mapId);
    const venue = mapPanel ? mapPanel.closest('.venue') : null;

    if (!mapPanel || !venue) {
      const page = this.categoryPageFor(result);
      if (!page) {
        console.warn('Search: map not on this page and no category page found for', mapId);
        return;
      }
      try {
        if (locationId) sessionStorage.setItem('wep-pending-location', locationId);
      } catch (e) { /* storage unavailable */ }
      window.location.href = `${page}#${encodeURIComponent(mapId)}`;
      return;
    }

    // Activate the correct map tab
    const tab = venue.querySelector(`[data-map="${mapId}"]`);
    if (tab) {
      venue.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      venue.querySelectorAll('.map-panel').forEach(p => p.classList.remove('active'));
      mapPanel.classList.add('active');
    }

    venue.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const marker = Array.from(mapPanel.querySelectorAll('.location-marker'))
      .find(m => m.dataset.locationId === String(locationId));
    if (marker && window.showLocationOverlay) {
      setTimeout(() => {
        window.showLocationOverlay(this.markerData(marker));
      }, 400);
    }
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  SearchModule.init();
});
