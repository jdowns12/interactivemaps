/**
 * Sidebar Navigation Module
 * Provides venue list and quick navigation
 */

const NavModule = {
  data: null,
  sidebar: null,
  isOpen: false,

  // Initialize navigation
  async init() {
    await this.loadData();
    this.createSidebar();
    this.setupListeners();
    this.setupIntersectionObserver();
  },

  // Load venue data
  async loadData() {
    try {
      const response = await fetch('data.json');
      this.data = await response.json();
    } catch (error) {
      console.error('Failed to load data.json:', error);
      // Fallback: build from DOM
      this.buildDataFromDOM();
    }
  },

  // Fallback: Build data from DOM
  buildDataFromDOM() {
    this.data = { venues: [] };
    const venueMap = {};

    document.querySelectorAll('.map-container').forEach(container => {
      const mapId = container.dataset.mapId;
      const label = container.querySelector('.map-label')?.textContent.trim() || '';
      const lines = label.split('\n').map(l => l.trim());
      const venueName = lines[0] || 'Unknown';

      if (!venueMap[venueName]) {
        venueMap[venueName] = {
          id: venueName.toLowerCase().replace(/\s+/g, '-'),
          name: venueName,
          maps: []
        };
        this.data.venues.push(venueMap[venueName]);
      }

      venueMap[venueName].maps.push({
        id: mapId,
        label: label,
        element: container
      });
    });
  },

  // Create sidebar HTML
  createSidebar() {
    const sidebarHTML = `
      <aside class="sidebar" id="venue-sidebar">
        <button class="sidebar-toggle" aria-label="Toggle sidebar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
        </button>
        <div class="sidebar-content">
          <h3 class="sidebar-title">Venues</h3>
          <nav class="sidebar-nav">
            ${this.renderVenueList()}
          </nav>
          <div class="sidebar-footer">
            <button class="list-view-toggle" id="list-view-toggle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              List View
            </button>
          </div>
        </div>
      </aside>
    `;

    document.body.insertAdjacentHTML('afterbegin', sidebarHTML);
    this.sidebar = document.getElementById('venue-sidebar');
  },

  // Render venue list
  renderVenueList() {
    if (!this.data || !this.data.venues) return '';

    // Group by type
    const groups = {
      arena: { name: 'Arenas', venues: [] },
      stadium: { name: 'Stadiums', venues: [] },
      field: { name: 'Fields', venues: [] }
    };

    this.data.venues.forEach(venue => {
      const type = venue.type || 'field';
      if (groups[type]) {
        groups[type].venues.push(venue);
      }
    });

    let html = '';
    for (const [type, group] of Object.entries(groups)) {
      if (group.venues.length === 0) continue;

      html += `
        <div class="sidebar-group">
          <div class="sidebar-group-title">${group.name}</div>
          <ul class="sidebar-venue-list">
            ${group.venues.map(venue => `
              <li class="sidebar-venue">
                <button class="sidebar-venue-btn" data-venue="${venue.id}">
                  ${venue.name}
                </button>
                <ul class="sidebar-map-list">
                  ${venue.maps.map(map => `
                    <li>
                      <a href="#" class="sidebar-map-link" data-map-id="${map.id}">
                        ${map.label.split('\n')[0]}
                      </a>
                    </li>
                  `).join('')}
                </ul>
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    return html;
  },

  // Setup event listeners
  setupListeners() {
    // Toggle sidebar
    const toggle = this.sidebar.querySelector('.sidebar-toggle');
    toggle.addEventListener('click', () => {
      this.isOpen = !this.isOpen;
      this.sidebar.classList.toggle('open', this.isOpen);
    });

    // Venue expansion
    this.sidebar.querySelectorAll('.sidebar-venue-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.classList.toggle('expanded');
      });
    });

    // Map links
    this.sidebar.querySelectorAll('.sidebar-map-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const mapId = link.dataset.mapId;
        this.navigateToMap(mapId);
      });
    });

    // List view toggle
    const listViewToggle = document.getElementById('list-view-toggle');
    if (listViewToggle) {
      listViewToggle.addEventListener('click', () => {
        document.body.classList.toggle('list-view-mode');
      });
    }

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && this.isOpen) {
        if (!e.target.closest('.sidebar')) {
          this.isOpen = false;
          this.sidebar.classList.remove('open');
        }
      }
    });
  },

  // Navigate to a map
  navigateToMap(mapId) {
    const mapContainer = document.querySelector(`[data-map-id="${mapId}"]`);

    if (mapContainer) {
      mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight briefly
      mapContainer.classList.add('highlight-pulse');
      setTimeout(() => {
        mapContainer.classList.remove('highlight-pulse');
      }, 2000);
    }

    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      this.isOpen = false;
      this.sidebar.classList.remove('open');
    }
  },

  // Setup intersection observer for current map indicator
  setupIntersectionObserver() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const mapId = entry.target.dataset.mapId;
          this.setActiveMap(mapId);
        }
      });
    }, { threshold: 0.5 });

    document.querySelectorAll('.map-container').forEach(container => {
      observer.observe(container);
    });
  },

  // Set active map in sidebar
  setActiveMap(mapId) {
    this.sidebar.querySelectorAll('.sidebar-map-link').forEach(link => {
      link.classList.toggle('active', link.dataset.mapId === mapId);
    });
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  NavModule.init();
});
