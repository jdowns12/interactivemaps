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
    this.searchInput = document.getElementById('global-search');
    this.resultsContainer = document.getElementById('search-results');

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

  // Fallback: Build index from DOM
  buildIndexFromDOM() {
    document.querySelectorAll('.map-container').forEach(container => {
      const mapLabel = container.querySelector('.map-label')?.textContent || '';

      container.querySelectorAll('.floating-info-box').forEach(box => {
        const name = box.querySelector('strong')?.textContent || '';
        const description = box.querySelector('p')?.textContent || '';

        this.searchIndex.push({
          type: 'location',
          venue: mapLabel.split('\n')[0],
          map: mapLabel,
          name: name,
          description: description,
          fiber: '',
          mapElement: container,
          infoBoxElement: box,
          searchText: [mapLabel, name, description].join(' ').toLowerCase()
        });
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
        this.navigateToLocation(mapId, locationId);
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

  // Navigate to a location
  navigateToLocation(mapId, locationId) {
    // Find the map panel by ID
    const mapPanel = document.getElementById(mapId);
    if (!mapPanel) return;

    // Find the venue section containing this map
    const venue = mapPanel.closest('.venue');
    if (!venue) return;

    // Activate the correct map tab
    const tab = venue.querySelector(`[data-map="${mapId}"]`);
    if (tab) {
      venue.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      venue.querySelectorAll('.map-panel').forEach(p => p.classList.remove('active'));
      mapPanel.classList.add('active');
    }

    // Scroll venue into view
    venue.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Find the location marker and show overlay
    const marker = mapPanel.querySelector(`[data-location-id="${locationId}"]`);
    if (marker && window.showLocationOverlay) {
      setTimeout(() => {
        const locationData = {
          number: marker.dataset.number || '',
          name: marker.dataset.name || 'Location',
          description: marker.dataset.description || '',
          fiber: marker.dataset.fiber || '',
          image: marker.dataset.image || '',
          locationId: marker.dataset.locationId || '',
          venueId: marker.dataset.venueId || '',
          mapId: marker.dataset.mapId || '',
          venueName: marker.dataset.venueName || '',
          mapLabel: marker.dataset.mapLabel || ''
        };
        window.showLocationOverlay(locationData);
      }, 400);
    }

    // Hide search results
    this.resultsContainer.classList.remove('visible');
    this.searchInput.value = '';
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  SearchModule.init();
});
