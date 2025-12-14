document.addEventListener('DOMContentLoaded', () => {
  // Track page visit for analytics
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page: window.location.pathname }),
    credentials: 'include'
  }).catch(() => {}); // Silently fail if tracking fails

  const mapContainers = document.querySelectorAll('.map-container');
  const dimOverlay = document.querySelector('.dim-overlay');
  const imageModalOverlay = document.getElementById('image-modal-overlay');
  const imageModalContent = document.getElementById('image-modal-content');
  const imageModalClose = document.getElementById('image-modal-close');

  // === MAP TABS FUNCTIONALITY ===
  // Handle clicking on map tabs to switch between different maps within a venue
  document.querySelectorAll('.map-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const mapId = tab.dataset.map;
      const venue = tab.closest('.venue');

      if (!venue || !mapId) return;

      // Deactivate all tabs in this venue
      venue.querySelectorAll('.map-tab').forEach(t => t.classList.remove('active'));

      // Activate clicked tab
      tab.classList.add('active');

      // Hide all map panels in this venue
      venue.querySelectorAll('.map-panel').forEach(panel => panel.classList.remove('active'));

      // Show the selected map panel
      const targetPanel = venue.querySelector(`#${mapId}`);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const toggledBoxes = new Set();
  const preloadedMaps = new Set();

  // === LOCATION OVERLAY (Full-Page) ===
  // Create the overlay element
  const locationOverlay = document.createElement('div');
  locationOverlay.className = 'location-overlay';
  locationOverlay.innerHTML = `
    <div class="location-overlay-content">
      <div class="location-overlay-header">
        <span class="location-overlay-number"></span>
        <div class="location-overlay-title">
          <h2></h2>
          <span class="fiber-badge"></span>
        </div>
        <button class="location-overlay-close">&times;</button>
      </div>
      <div class="location-overlay-body">
        <p></p>
      </div>
      <img class="location-overlay-image" src="" alt="Location image">
      <div class="photo-placeholder">
        <div class="photo-placeholder-icon">📷</div>
        <div class="photo-placeholder-text">Photo Coming Soon</div>
        <div class="photo-request-form">
          <label class="upload-photo-label">
            <input type="file" accept="image/*" class="upload-photo-input" hidden>
            <span class="upload-photo-btn">📤 Upload a Photo</span>
          </label>
          <div class="upload-preview-container" style="display: none;">
            <img class="upload-preview-img" src="" alt="Preview">
            <button class="upload-remove-btn" type="button">×</button>
          </div>
          <button class="request-photo-btn">Submit Photo Request</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(locationOverlay);

  const overlayNumber = locationOverlay.querySelector('.location-overlay-number');
  const overlayTitle = locationOverlay.querySelector('.location-overlay-title h2');
  const overlayFiber = locationOverlay.querySelector('.fiber-badge');
  const overlayBody = locationOverlay.querySelector('.location-overlay-body p');
  const overlayImage = locationOverlay.querySelector('.location-overlay-image');
  const overlayClose = locationOverlay.querySelector('.location-overlay-close');
  const photoPlaceholder = locationOverlay.querySelector('.photo-placeholder');
  const requestPhotoBtn = locationOverlay.querySelector('.request-photo-btn');
  const uploadPhotoInput = locationOverlay.querySelector('.upload-photo-input');
  const uploadPreviewContainer = locationOverlay.querySelector('.upload-preview-container');
  const uploadPreviewImg = locationOverlay.querySelector('.upload-preview-img');
  const uploadRemoveBtn = locationOverlay.querySelector('.upload-remove-btn');

  // Current location data for photo request
  let currentLocationData = null;
  let uploadedPhotoFile = null;

  // Handle file selection for photo upload
  uploadPhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadedPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        uploadPreviewImg.src = e.target.result;
        uploadPreviewContainer.style.display = 'block';
        requestPhotoBtn.textContent = 'Submit Photo';
      };
      reader.readAsDataURL(file);
    }
  });

  // Handle remove uploaded photo
  uploadRemoveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedPhotoFile = null;
    uploadPhotoInput.value = '';
    uploadPreviewContainer.style.display = 'none';
    uploadPreviewImg.src = '';
    requestPhotoBtn.textContent = 'Submit Photo Request';
  });

  // Handle photo request button click
  requestPhotoBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!currentLocationData) return;

    try {
      requestPhotoBtn.textContent = 'Sending...';
      requestPhotoBtn.disabled = true;

      const formData = new FormData();
      formData.append('locationId', currentLocationData.locationId || '');
      formData.append('locationName', currentLocationData.name || 'Unknown');
      formData.append('venueName', currentLocationData.venueName || '');
      formData.append('mapLabel', currentLocationData.mapLabel || '');
      formData.append('venueId', currentLocationData.venueId || '');
      formData.append('mapId', currentLocationData.mapId || '');

      if (uploadedPhotoFile) {
        formData.append('photo', uploadedPhotoFile);
      }

      const response = await fetch('/api/photo-requests', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        requestPhotoBtn.textContent = uploadedPhotoFile ? 'Photo Submitted!' : 'Request Sent!';
        requestPhotoBtn.classList.add('sent');
        // Reset upload state
        uploadedPhotoFile = null;
        uploadPhotoInput.value = '';
        uploadPreviewContainer.style.display = 'none';
      } else {
        requestPhotoBtn.textContent = 'Error - Try Again';
        requestPhotoBtn.disabled = false;
      }
    } catch (error) {
      console.error('Failed to send photo request:', error);
      requestPhotoBtn.textContent = 'Error - Try Again';
      requestPhotoBtn.disabled = false;
    }
  });

  function showLocationOverlay(locationData) {
    currentLocationData = locationData;
    overlayNumber.textContent = locationData.number || '';
    overlayTitle.textContent = locationData.name || 'Location';

    if (locationData.fiber) {
      overlayFiber.textContent = locationData.fiber;
      overlayFiber.style.display = 'inline-block';
    } else {
      overlayFiber.style.display = 'none';
    }

    overlayBody.textContent = locationData.description || '';

    // Reset request button and upload state
    requestPhotoBtn.textContent = 'Submit Photo Request';
    requestPhotoBtn.disabled = false;
    requestPhotoBtn.classList.remove('sent');
    uploadedPhotoFile = null;
    uploadPhotoInput.value = '';
    uploadPreviewContainer.style.display = 'none';
    uploadPreviewImg.src = '';

    if (locationData.image) {
      overlayImage.src = locationData.image;
      overlayImage.style.display = 'block';
      photoPlaceholder.style.display = 'none';
    } else {
      overlayImage.style.display = 'none';
      photoPlaceholder.style.display = 'flex';
    }

    locationOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function hideLocationOverlay() {
    locationOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  // Expose showLocationOverlay globally for search.js
  window.showLocationOverlay = showLocationOverlay;

  // Close overlay handlers
  overlayClose.addEventListener('click', hideLocationOverlay);
  locationOverlay.addEventListener('click', (e) => {
    if (e.target === locationOverlay) {
      hideLocationOverlay();
    }
  });

  // Click image in overlay to open in image modal
  overlayImage.addEventListener('click', (e) => {
    e.stopPropagation();
    imageModalContent.src = overlayImage.src;
    imageModalOverlay.style.display = 'flex';
  });

  // Handle image load errors - show placeholder when image fails to load
  overlayImage.addEventListener('error', () => {
    overlayImage.style.display = 'none';
    photoPlaceholder.style.display = 'flex';
  });

  // Handle successful image load
  overlayImage.addEventListener('load', () => {
    overlayImage.style.display = 'block';
    photoPlaceholder.style.display = 'none';
  });

  // === LOCATION MARKER CLICK HANDLERS ===
  document.querySelectorAll('.location-marker').forEach(marker => {
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      const locationData = {
        number: marker.dataset.number || '',
        name: marker.dataset.name || 'Location',
        description: marker.dataset.description || '',
        fiber: marker.dataset.fiber || '',
        image: marker.dataset.image || '',
        // New fields for photo requests
        locationId: marker.dataset.locationId || '',
        venueId: marker.dataset.venueId || '',
        mapId: marker.dataset.mapId || '',
        venueName: marker.dataset.venueName || '',
        mapLabel: marker.dataset.mapLabel || ''
      };
      showLocationOverlay(locationData);
    });
  });

  // === IMAGE PRELOADING ===
  function preloadMapImages(container) {
    const mapId = container.querySelector('.map-content')?.id;
    if (!mapId || preloadedMaps.has(mapId)) return;

    preloadedMaps.add(mapId);
    const images = container.querySelectorAll('.floating-info-box img');
    const imageUrls = [];

    images.forEach(img => {
      const src = img.dataset.src || img.src;
      if (src && !src.startsWith('data:')) {
        imageUrls.push(src);
        // Preload via Image object for browser cache
        const preloadImg = new Image();
        preloadImg.src = src;
      }
    });

    // Also tell service worker to cache these
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        action: 'precacheImages',
        images: imageUrls
      });
    }
  }

  // Preload images when hovering over a map (desktop)
  mapContainers.forEach(container => {
    container.addEventListener('mouseenter', () => {
      preloadMapImages(container);
    }, { once: true });
  });

  // === HANDLE MISSING IMAGES ===
  // Handle location images in info boxes
  document.querySelectorAll('.floating-info-box img').forEach(img => {
    img.addEventListener('error', function() {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-placeholder';
      this.parentNode.replaceChild(placeholder, this);
    });
  });

  // Handle map images
  document.querySelectorAll('.map-image').forEach(img => {
    img.addEventListener('error', function() {
      this.classList.add('image-error');
      this.closest('.map-content').classList.add('has-image-error');
    });
  });

  // === COLOR FILTER CHECKBOXES ===
  document.querySelectorAll('.color-filter-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const color = e.target.dataset.filterColor;
      const isChecked = e.target.checked;
      const mapContent = e.target.closest('.map-content');
      if (mapContent) {
        mapContent.querySelectorAll(`[data-floor-color="${color}"]`).forEach(wrapper => {
          wrapper.classList.toggle('hidden-by-filter', !isChecked);
        });
      }
    });
  });

  // === LAZY LOAD IMAGES ===
  const lazyLoadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          lazyLoadObserver.unobserve(img);
        }
      }
    });
  }, { rootMargin: '100px' });

  // Observe all images with data-src attribute
  document.querySelectorAll('img[data-src]').forEach(img => {
    lazyLoadObserver.observe(img);
  });

  // === SMART INFO BOX POSITIONING ===
  function positionInfoBox(infoBox, icon) {
    // Skip positioning on mobile - bottom sheet handles it
    if (window.innerWidth <= 768) {
      return;
    }

    // Reset positioning first
    infoBox.style.top = '';
    infoBox.style.bottom = '';
    infoBox.style.left = '';
    infoBox.style.right = '';
    infoBox.style.transform = '';
    infoBox.style.marginTop = '';
    infoBox.style.marginBottom = '';
    infoBox.style.maxWidth = '';
    infoBox.style.position = 'absolute';

    // Get measurements after reset
    const iconRect = icon.getBoundingClientRect();
    const boxRect = infoBox.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 10; // Minimum distance from viewport edge

    // Calculate available space
    const spaceAbove = iconRect.top - padding;
    const spaceBelow = viewportHeight - iconRect.bottom - padding;
    const spaceLeft = iconRect.left + (iconRect.width / 2);
    const spaceRight = viewportWidth - iconRect.left - (iconRect.width / 2);

    // Limit box width to fit in viewport
    const maxBoxWidth = Math.min(boxRect.width, viewportWidth - (padding * 2));
    if (maxBoxWidth < boxRect.width) {
      infoBox.style.maxWidth = `${maxBoxWidth}px`;
    }

    // Vertical positioning
    if (spaceBelow >= boxRect.height || spaceBelow >= spaceAbove) {
      // Position below
      infoBox.style.top = '100%';
      infoBox.style.bottom = 'auto';
      infoBox.style.marginTop = '10px';
    } else {
      // Position above
      infoBox.style.bottom = '100%';
      infoBox.style.top = 'auto';
      infoBox.style.marginBottom = '10px';
    }

    // Horizontal positioning - keep within viewport
    const halfBoxWidth = Math.min(boxRect.width, maxBoxWidth) / 2;

    if (spaceLeft < halfBoxWidth + padding) {
      // Too close to left edge - align left
      const offset = halfBoxWidth - spaceLeft + padding;
      infoBox.style.left = '50%';
      infoBox.style.transform = `translateX(calc(-50% + ${offset}px))`;
    } else if (spaceRight < halfBoxWidth + padding) {
      // Too close to right edge - align right
      const offset = halfBoxWidth - spaceRight + padding;
      infoBox.style.left = '50%';
      infoBox.style.transform = `translateX(calc(-50% - ${offset}px))`;
    } else {
      // Center normally
      infoBox.style.left = '50%';
      infoBox.style.transform = 'translateX(-50%)';
    }
  }

  // Track scroll position when opening overlay
  let savedScrollPosition = 0;

  // Create scroll indicator element
  const scrollIndicator = document.createElement('div');
  scrollIndicator.className = 'scroll-indicator';
  scrollIndicator.innerHTML = `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
    </svg>
  `;
  document.body.appendChild(scrollIndicator);

  function showScrollIndicator() {
    scrollIndicator.classList.add('visible');
  }

  function hideScrollIndicator() {
    scrollIndicator.classList.remove('visible');
  }

  function openMapOverlay(container) {
    // Save current scroll position
    savedScrollPosition = window.scrollY;

    container.classList.add('expanded');
    mapContainers.forEach(c => {
      if (c !== container) c.classList.add('dimmed');
    });
    document.body.classList.add('overlay-active');
    document.documentElement.classList.add('overlay-active');

    // Preload all images for this map
    preloadMapImages(container);

    // Create location list
    createLocationList(container);

    // Listen for scroll to hide indicator
    const scrollHandler = () => {
      if (container.scrollTop > 30) {
        hideScrollIndicator();
        container.removeEventListener('scroll', scrollHandler);
      }
    };
    container.addEventListener('scroll', scrollHandler);
  }

  // Global location list element
  let locationListEl = null;

  // Create location list for expanded maps
  function createLocationList(container) {
    // Remove any existing list
    if (locationListEl) {
      locationListEl.remove();
    }

    // Get all markers in this container
    const markers = container.querySelectorAll('.location-marker');
    if (markers.length === 0) return;

    // Create the list container
    locationListEl = document.createElement('div');
    locationListEl.className = 'location-list visible';
    locationListEl.innerHTML = `
      <div class="location-list-header">
        <span>Locations (${markers.length})</span>
        <button class="location-list-toggle">Hide List</button>
      </div>
      <ul class="location-list-items"></ul>
    `;

    const listItems = locationListEl.querySelector('.location-list-items');
    const toggleBtn = locationListEl.querySelector('.location-list-toggle');

    // Sort markers by number
    const sortedMarkers = Array.from(markers).sort((a, b) => {
      const numA = parseInt(a.dataset.number) || 0;
      const numB = parseInt(b.dataset.number) || 0;
      return numA - numB;
    });

    // Create list items
    sortedMarkers.forEach(marker => {
      const number = marker.dataset.number || '?';
      const name = marker.dataset.name || 'Location';
      const fiber = marker.dataset.fiber || '';

      const li = document.createElement('li');
      li.className = 'location-list-item';
      li.innerHTML = `
        <div class="location-list-number">${number}</div>
        <div class="location-list-info">
          <div class="location-list-name">${name}</div>
          ${fiber ? `<div class="location-list-fiber">${fiber}</div>` : ''}
        </div>
        <div class="location-list-arrow">›</div>
      `;

      // Click handler - show the location overlay
      li.addEventListener('click', (e) => {
        e.stopPropagation();
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
        showLocationOverlay(locationData);
      });

      listItems.appendChild(li);
    });

    // Toggle list visibility
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = listItems.style.display === 'none';
      listItems.style.display = isHidden ? '' : 'none';
      toggleBtn.textContent = isHidden ? 'Hide List' : 'Show List';
    });

    // Append list to body so it's positioned fixed at bottom
    document.body.appendChild(locationListEl);
  }

  // Hide and remove location list
  function hideLocationList() {
    if (locationListEl) {
      locationListEl.remove();
      locationListEl = null;
    }
  }

  function closeMapOverlay() {
    mapContainers.forEach(c => c.classList.remove('expanded', 'dimmed'));
    document.body.classList.remove('overlay-active');
    document.documentElement.classList.remove('overlay-active');
    hideScrollIndicator();
    hideLocationList();
    currentLocationIndex = -1;
  }

  mapContainers.forEach(container => {
    container.addEventListener('click', (e) => {
      // Don't toggle if clicking on info box, close button, or location marker
      if (e.target.closest('.floating-info-box') ||
          e.target.closest('.close-button') ||
          e.target.closest('.location-marker')) {
        return;
      }

      const isExpanded = container.classList.contains('expanded');

      if (isExpanded) {
        closeMapOverlay();
      } else {
        closeMapOverlay(); // Close any open first
        openMapOverlay(container);
      }
    });
  });

  dimOverlay.addEventListener('click', () => {
    closeMapOverlay();
  });

  // Extract location data from info box element
  function extractLocationData(infoBox, icon) {
    const nameEl = infoBox.querySelector('strong, h3, h4');
    const descEl = infoBox.querySelector('p');
    const imgEl = infoBox.querySelector('img');
    const fiberEl = infoBox.querySelector('.fiber-info, [class*="fiber"]');

    // Get number from icon text
    const number = icon.textContent.trim();

    // Try to find fiber info in text
    let fiber = '';
    if (fiberEl) {
      fiber = fiberEl.textContent.trim();
    } else {
      // Look for fiber pattern in description
      const text = infoBox.textContent;
      const fiberMatch = text.match(/(\d+\s*ST|\d+\s*fiber|fiber:\s*\d+)/i);
      if (fiberMatch) fiber = fiberMatch[0];
    }

    return {
      number: number,
      name: nameEl ? nameEl.textContent.trim() : 'Location ' + number,
      description: descEl ? descEl.textContent.trim() : '',
      image: imgEl ? (imgEl.dataset.src || imgEl.src) : '',
      fiber: fiber
    };
  }

  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);

    icon.addEventListener('click', e => {
      e.stopPropagation();

      // Extract data and show in overlay
      const locationData = extractLocationData(infoBox, icon);
      showLocationOverlay(locationData);
    });
  });

  document.querySelectorAll('.info-close-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const box = button.closest('.floating-info-box');
      box.classList.remove('visible');
      box.style.pointerEvents = '';
      toggledBoxes.delete(box.id);
      hideScrollIndicator();
    });
  });

  document.querySelectorAll('.floating-info-box img').forEach(img => {
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      imageModalContent.src = img.src;
      imageModalOverlay.style.display = 'flex';
    });
  });

  imageModalClose.addEventListener('click', () => {
    imageModalOverlay.style.display = 'none';
    imageModalContent.src = '';
  });

  imageModalOverlay.addEventListener('click', (e) => {
    if (e.target === imageModalOverlay) {
      imageModalOverlay.style.display = 'none';
      imageModalContent.src = '';
    }
  });

  // === SWIPE GESTURES FOR MOBILE ===
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  function handleSwipeGesture() {
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;
    const minSwipeDistance = 50;

    // Check if swipe is more horizontal or vertical
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Horizontal swipe
      if (Math.abs(deltaX) > minSwipeDistance) {
        if (deltaX > 0) {
          // Swipe right - previous map
          navigateMaps('prev');
        } else {
          // Swipe left - next map
          navigateMaps('next');
        }
      }
    } else {
      // Vertical swipe
      if (deltaY > minSwipeDistance) {
        // Swipe down - close expanded map
        if (document.body.classList.contains('overlay-active')) {
          closeMapOverlay();
        }
      }
    }
  }

  function navigateMaps(direction) {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (!expandedMap) return;

    const allMaps = Array.from(mapContainers);
    const currentIndex = allMaps.indexOf(expandedMap);
    let nextIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % allMaps.length;
    } else {
      nextIndex = (currentIndex - 1 + allMaps.length) % allMaps.length;
    }

    // Close current and open next
    expandedMap.classList.remove('expanded');
    allMaps[nextIndex].classList.add('expanded');

    // Close any open info boxes
    document.querySelectorAll('.floating-info-box.visible').forEach(box => {
      box.classList.remove('visible');
      box.style.pointerEvents = '';
      toggledBoxes.delete(box.id);
    });
  }

  // Only add touch listeners on touch devices
  if (isTouchDevice) {
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipeGesture();
    }, { passive: true });
  }

  // === KEYBOARD NAVIGATION ===
  let currentLocationIndex = -1;

  function getExpandedMapIcons() {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (!expandedMap) return [];
    return Array.from(expandedMap.querySelectorAll('.location-icon'));
  }

  function navigateToLocation(index) {
    const icons = getExpandedMapIcons();
    if (icons.length === 0) return;

    // Wrap around
    if (index < 0) index = icons.length - 1;
    if (index >= icons.length) index = 0;

    currentLocationIndex = index;
    const icon = icons[index];

    // Get info box and show overlay
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);
    if (infoBox) {
      const locationData = extractLocationData(infoBox, icon);
      showLocationOverlay(locationData);
    }

    // Add focus indicator
    icons.forEach(i => i.classList.remove('keyboard-focus'));
    icon.classList.add('keyboard-focus');
  }

  document.addEventListener('keydown', (e) => {
    // Escape key handling
    if (e.key === 'Escape') {
      if (imageModalOverlay.style.display === 'flex') {
        imageModalOverlay.style.display = 'none';
        imageModalContent.src = '';
      } else if (locationOverlay.classList.contains('visible')) {
        hideLocationOverlay();
      } else if (document.body.classList.contains('overlay-active')) {
        closeMapOverlay();
      }
      return;
    }

    // Only handle navigation keys when a map is expanded
    if (!document.body.classList.contains('overlay-active')) return;

    // Arrow keys to navigate between locations
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateToLocation(currentLocationIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateToLocation(currentLocationIndex - 1);
    }

    // Number keys 1-9 to jump to location
    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      e.preventDefault();
      navigateToLocation(num - 1);
    }

    // Tab to cycle through locations
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateToLocation(currentLocationIndex - 1);
      } else {
        navigateToLocation(currentLocationIndex + 1);
      }
    }
  });
});
