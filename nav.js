/**
 * Navigation Module
 * Minimal version - sidebar removed, header handles navigation
 */

// This file is kept for potential future venue-based navigation features
// Currently empty as header.js handles all category navigation

const NavModule = {
  init() {
    // Navigation is handled by header.js
    // This module can be extended for venue-specific features if needed
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  NavModule.init();
});
