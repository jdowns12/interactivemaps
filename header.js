/**
 * Shared Header Component
 * Injects consistent header across all pages
 */

const HeaderComponent = {
  // Configuration
  config: {
    logoSrc: 'auburn-logo.png',
    logoAlt: 'Auburn Logo',
    siteName: 'WEP Venue Maps',
    homeLink: 'index.html',
    navItems: [
      { href: 'Fiber.html', label: 'Fiber Connectivity' },
      { href: 'ESPN.html', label: 'ESPN Positions' },
      { href: 'camera_positions.html', label: 'Camera Positions' }
    ]
  },

  // Generate header HTML
  render() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    return `
      <header class="site-header">
        <a href="${this.config.homeLink}" class="header-brand">
          <img src="${this.config.logoSrc}" alt="${this.config.logoAlt}" class="header-logo">
          <h1 class="header-title">${this.config.siteName}</h1>
        </a>
        <nav class="header-nav">
          <button class="nav-toggle" aria-label="Toggle navigation">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <ul class="nav-menu">
            ${this.config.navItems.map(item => `
              <li>
                <a href="${item.href}" class="nav-link ${currentPage === item.href ? 'active' : ''}">
                  ${item.label}
                </a>
              </li>
            `).join('')}
          </ul>
        </nav>
        <div class="header-search">
          <input type="search" id="global-search" placeholder="Search locations..." autocomplete="off">
          <div id="search-results" class="search-results"></div>
        </div>
      </header>
    `;
  },

  // Initialize header
  init() {
    // Find existing header or create container
    const existingHeader = document.querySelector('header');

    if (existingHeader) {
      // Replace existing header with new one
      existingHeader.outerHTML = this.render();
    } else {
      // Insert at beginning of body
      document.body.insertAdjacentHTML('afterbegin', this.render());
    }

    // Setup mobile nav toggle
    this.setupMobileNav();
  },

  // Mobile navigation toggle
  setupMobileNav() {
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.querySelector('.nav-menu');

    if (toggle && menu) {
      toggle.addEventListener('click', () => {
        menu.classList.toggle('open');
        toggle.classList.toggle('open');
      });
    }
  }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  HeaderComponent.init();
});
