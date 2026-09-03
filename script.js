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

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const toggledBoxes = new Set();
  const preloadedMaps = new Set();

  // === IMAGE PATH HELPERS ===
  // Thumbnail for DIR/NAME.jpg lives at DIR/thumbs/NAME.jpg (root photos: thumbs/NAME.jpg)
  function thumbPath(src) {
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
    const slash = src.lastIndexOf('/');
    if (slash === -1) return 'thumbs/' + src;
    return src.slice(0, slash + 1) + 'thumbs/' + src.slice(slash + 1);
  }

  // Parse the image list off a marker: data-images (JSON array) with a
  // fallback to the single data-image attribute on older generated pages.
  function parseMarkerImages(marker) {
    const raw = marker.dataset.images;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(p => typeof p === 'string' && p.trim() !== '');
        }
      } catch (e) {
        // fall through to data-image
      }
    }
    return marker.dataset.image ? [marker.dataset.image] : [];
  }

  function normalizeImages(locationData) {
    let images = [];
    if (Array.isArray(locationData.images)) {
      images = locationData.images.filter(p => typeof p === 'string' && p.trim() !== '');
    } else if (locationData.image) {
      images = [locationData.image];
    }
    return images;
  }

  // Build the overlay payload from a .location-marker element
  function markerToLocationData(marker) {
    const images = parseMarkerImages(marker);
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
  }

  // === MAP TABS FUNCTIONALITY ===
  function activateMapTab(venue, mapId) {
    if (!venue || !mapId) return null;
    venue.querySelectorAll('.map-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.map === mapId);
    });
    let targetPanel = null;
    venue.querySelectorAll('.map-panel').forEach(panel => {
      const isTarget = panel.id === mapId;
      panel.classList.toggle('active', isTarget);
      if (isTarget) targetPanel = panel;
    });
    return targetPanel;
  }

  document.querySelectorAll('.map-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activateMapTab(tab.closest('.venue'), tab.dataset.map);
    });
  });

  // === LOCATION OVERLAY (Full-Page) ===
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
        <button class="location-overlay-close" aria-label="Close">&times;</button>
      </div>
      <div class="location-overlay-body">
        <p></p>
      </div>
      <div class="photo-strip" hidden>
        <div class="photo-strip-track" tabindex="0" aria-label="Location photos"></div>
        <button type="button" class="photo-strip-arrow photo-strip-prev" aria-label="Previous photo">&#8249;</button>
        <button type="button" class="photo-strip-arrow photo-strip-next" aria-label="Next photo">&#8250;</button>
      </div>
      <div class="photo-strip-nav" hidden>
        <div class="photo-strip-dots" role="tablist"></div>
        <span class="photo-strip-counter" aria-live="polite"></span>
      </div>
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

  const overlayContent = locationOverlay.querySelector('.location-overlay-content');
  const overlayNumber = locationOverlay.querySelector('.location-overlay-number');
  const overlayTitle = locationOverlay.querySelector('.location-overlay-title h2');
  const overlayFiber = locationOverlay.querySelector('.fiber-badge');
  const overlayBody = locationOverlay.querySelector('.location-overlay-body p');
  const overlayClose = locationOverlay.querySelector('.location-overlay-close');
  const photoStrip = locationOverlay.querySelector('.photo-strip');
  const photoTrack = locationOverlay.querySelector('.photo-strip-track');
  const photoPrevBtn = locationOverlay.querySelector('.photo-strip-prev');
  const photoNextBtn = locationOverlay.querySelector('.photo-strip-next');
  const photoNav = locationOverlay.querySelector('.photo-strip-nav');
  const photoDots = locationOverlay.querySelector('.photo-strip-dots');
  const photoCounter = locationOverlay.querySelector('.photo-strip-counter');
  const photoPlaceholder = locationOverlay.querySelector('.photo-placeholder');
  const requestPhotoBtn = locationOverlay.querySelector('.request-photo-btn');
  const uploadPhotoInput = locationOverlay.querySelector('.upload-photo-input');
  const uploadPreviewContainer = locationOverlay.querySelector('.upload-preview-container');
  const uploadPreviewImg = locationOverlay.querySelector('.upload-preview-img');
  const uploadRemoveBtn = locationOverlay.querySelector('.upload-remove-btn');

  // Current location data for photo request
  let currentLocationData = null;
  let uploadedPhotoFile = null;

  // Photo strip state
  let currentImages = [];
  let currentPhotoIndex = 0;

  // Handle file selection for photo upload
  uploadPhotoInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadedPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (ev) => {
        uploadPreviewImg.src = ev.target.result;
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

  // === PHOTO STRIP ===
  function photoCount() {
    return currentImages.length;
  }

  function slideWidth() {
    return photoTrack.clientWidth || 1;
  }

  function updatePhotoNav() {
    const n = photoCount();
    const idx = Math.min(Math.max(currentPhotoIndex, 0), Math.max(n - 1, 0));
    photoDots.querySelectorAll('.photo-strip-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
      dot.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    photoCounter.textContent = n > 1 ? `${idx + 1} / ${n}` : '';
    photoPrevBtn.disabled = idx <= 0;
    photoNextBtn.disabled = idx >= n - 1;
  }

  function goToPhoto(index, behavior) {
    const n = photoCount();
    if (n === 0) return;
    const idx = Math.min(Math.max(index, 0), n - 1);
    currentPhotoIndex = idx;
    photoTrack.scrollTo({ left: idx * slideWidth(), behavior: behavior || 'smooth' });
    updatePhotoNav();
  }

  function stepPhoto(delta) {
    goToPhoto(currentPhotoIndex + delta);
  }

  // Keep index in sync with native swiping (scroll-snap)
  let trackScrollTimer = null;
  photoTrack.addEventListener('scroll', () => {
    clearTimeout(trackScrollTimer);
    trackScrollTimer = setTimeout(() => {
      const idx = Math.round(photoTrack.scrollLeft / slideWidth());
      if (idx !== currentPhotoIndex && idx >= 0 && idx < photoCount()) {
        currentPhotoIndex = idx;
        updatePhotoNav();
      }
    }, 60);
  }, { passive: true });

  photoPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); stepPhoto(-1); });
  photoNextBtn.addEventListener('click', (e) => { e.stopPropagation(); stepPhoto(1); });

  // Load a strip slide: thumbnail first, full image if the thumb is missing
  function loadSlideImage(img, fullSrc) {
    let triedFull = false;
    img.classList.add('img-loading');
    img.addEventListener('load', () => {
      img.classList.remove('img-loading');
      img.closest('.photo-slide').classList.remove('broken');
    });
    img.addEventListener('error', () => {
      if (!triedFull && img.getAttribute('src') !== fullSrc) {
        triedFull = true;
        img.src = fullSrc;
        return;
      }
      img.classList.remove('img-loading');
      img.closest('.photo-slide').classList.add('broken');
      // A single dead photo behaves like no photo at all
      if (photoCount() === 1) {
        showPlaceholder();
      }
    });
    img.src = thumbPath(fullSrc);
  }

  function showPlaceholder() {
    photoStrip.hidden = true;
    photoNav.hidden = true;
    photoPlaceholder.style.display = 'flex';
  }

  function renderPhotoStrip(images) {
    currentImages = images.slice();
    currentPhotoIndex = 0;
    photoTrack.innerHTML = '';
    photoDots.innerHTML = '';

    if (images.length === 0) {
      showPlaceholder();
      return;
    }

    photoPlaceholder.style.display = 'none';
    photoStrip.hidden = false;
    photoStrip.classList.toggle('single', images.length === 1);
    photoNav.hidden = images.length <= 1;

    images.forEach((src, i) => {
      const slide = document.createElement('div');
      slide.className = 'photo-slide';
      slide.dataset.index = String(i);
      const img = document.createElement('img');
      img.alt = `Photo ${i + 1} of ${images.length}`;
      img.decoding = 'async';
      img.loading = i === 0 ? 'eager' : 'lazy';
      img.draggable = false;
      slide.appendChild(img);
      const broken = document.createElement('div');
      broken.className = 'photo-slide-broken';
      broken.textContent = 'Photo unavailable';
      slide.appendChild(broken);
      photoTrack.appendChild(slide);
      loadSlideImage(img, src);

      slide.addEventListener('click', (e) => {
        e.stopPropagation();
        if (slide.classList.contains('broken')) return;
        openImageModal(i);
      });

      if (images.length > 1) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'photo-strip-dot';
        dot.setAttribute('role', 'tab');
        dot.setAttribute('aria-label', `Photo ${i + 1}`);
        dot.addEventListener('click', (e) => { e.stopPropagation(); goToPhoto(i); });
        photoDots.appendChild(dot);
      }
    });

    photoTrack.scrollLeft = 0;
    updatePhotoNav();
  }

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

    renderPhotoStrip(normalizeImages(locationData));

    overlayContent.scrollTop = 0;
    locationOverlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function hideLocationOverlay() {
    locationOverlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  // Expose for search.js and other modules
  window.showLocationOverlay = showLocationOverlay;
  window.WEPMaps = { showLocationOverlay, markerToLocationData, parseMarkerImages, thumbPath };

  // Close overlay handlers
  overlayClose.addEventListener('click', hideLocationOverlay);
  locationOverlay.addEventListener('click', (e) => {
    if (e.target === locationOverlay) {
      hideLocationOverlay();
    }
  });

  // === IMAGE MODAL (zoom) with prev/next ===
  let modalImages = [];
  let modalIndex = 0;
  let modalOpenedFromOverlay = false;

  // Prev/next controls are created here so old generated pages get them too
  const modalPrevBtn = document.createElement('button');
  modalPrevBtn.type = 'button';
  modalPrevBtn.className = 'image-modal-arrow image-modal-prev';
  modalPrevBtn.setAttribute('aria-label', 'Previous photo');
  modalPrevBtn.innerHTML = '&#8249;';
  const modalNextBtn = document.createElement('button');
  modalNextBtn.type = 'button';
  modalNextBtn.className = 'image-modal-arrow image-modal-next';
  modalNextBtn.setAttribute('aria-label', 'Next photo');
  modalNextBtn.innerHTML = '&#8250;';
  const modalCounter = document.createElement('div');
  modalCounter.className = 'image-modal-counter';
  if (imageModalOverlay) {
    imageModalOverlay.appendChild(modalPrevBtn);
    imageModalOverlay.appendChild(modalNextBtn);
    imageModalOverlay.appendChild(modalCounter);
  }

  function updateModalNav() {
    const n = modalImages.length;
    const multi = n > 1;
    modalPrevBtn.hidden = !multi;
    modalNextBtn.hidden = !multi;
    modalCounter.hidden = !multi;
    modalPrevBtn.disabled = modalIndex <= 0;
    modalNextBtn.disabled = modalIndex >= n - 1;
    modalCounter.textContent = multi ? `${modalIndex + 1} / ${n}` : '';
  }

  function showModalImage(index) {
    if (modalImages.length === 0) return;
    modalIndex = Math.min(Math.max(index, 0), modalImages.length - 1);
    imageModalContent.classList.add('img-loading');
    imageModalContent.src = modalImages[modalIndex];
    updateModalNav();
  }

  function openImageModal(index) {
    if (!imageModalOverlay) return;
    modalImages = currentImages.slice();
    modalOpenedFromOverlay = locationOverlay.classList.contains('visible');
    if (modalOpenedFromOverlay) locationOverlay.style.visibility = 'hidden';
    imageModalOverlay.style.display = 'flex';
    showModalImage(index);
  }

  function openSingleImageModal(src) {
    if (!imageModalOverlay) return;
    modalImages = [src];
    modalOpenedFromOverlay = false;
    imageModalOverlay.style.display = 'flex';
    showModalImage(0);
  }

  function closeImageModal() {
    if (!imageModalOverlay) return;
    imageModalOverlay.style.display = 'none';
    imageModalContent.src = '';
    imageModalContent.classList.remove('img-loading');
    locationOverlay.style.visibility = '';
    if (modalOpenedFromOverlay && modalImages.length > 1) {
      // Keep the strip on the photo the user was looking at
      goToPhoto(modalIndex, 'auto');
    }
    modalImages = [];
  }

  function isImageModalOpen() {
    return !!imageModalOverlay && imageModalOverlay.style.display === 'flex';
  }

  if (imageModalOverlay) {
    imageModalContent.addEventListener('load', () => imageModalContent.classList.remove('img-loading'));
    imageModalContent.addEventListener('error', () => imageModalContent.classList.remove('img-loading'));
    imageModalClose.addEventListener('click', (e) => { e.stopPropagation(); closeImageModal(); });
    imageModalOverlay.addEventListener('click', (e) => {
      if (e.target === imageModalOverlay) closeImageModal();
    });
    modalPrevBtn.addEventListener('click', (e) => { e.stopPropagation(); showModalImage(modalIndex - 1); });
    modalNextBtn.addEventListener('click', (e) => { e.stopPropagation(); showModalImage(modalIndex + 1); });

    // Swipe left/right inside the modal to move between photos
    let modalTouchX = null;
    let modalTouchY = null;
    imageModalOverlay.addEventListener('touchstart', (e) => {
      modalTouchX = e.changedTouches[0].clientX;
      modalTouchY = e.changedTouches[0].clientY;
    }, { passive: true });
    imageModalOverlay.addEventListener('touchend', (e) => {
      if (modalTouchX === null) return;
      const dx = e.changedTouches[0].clientX - modalTouchX;
      const dy = e.changedTouches[0].clientY - modalTouchY;
      modalTouchX = null;
      modalTouchY = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && modalImages.length > 1) {
        showModalImage(modalIndex + (dx < 0 ? 1 : -1));
      }
    }, { passive: true });
  }

  // === LOCATION MARKER CLICK HANDLERS ===
  document.querySelectorAll('.location-marker').forEach(marker => {
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      showLocationOverlay(markerToLocationData(marker));
    });
  });

  // === IMAGE PRELOADING (thumbnails only) ===
  function preloadMapImages(container) {
    if (preloadedMaps.has(container)) return;
    preloadedMaps.add(container);

    const thumbUrls = [];
    container.querySelectorAll('.location-marker').forEach(marker => {
      parseMarkerImages(marker).forEach(src => {
        if (src && !src.startsWith('data:')) {
          const thumb = thumbPath(src);
          if (!thumbUrls.includes(thumb)) thumbUrls.push(thumb);
        }
      });
    });

    if (thumbUrls.length === 0) return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        action: 'precacheImages',
        images: thumbUrls
      });
    } else {
      thumbUrls.forEach(src => {
        const preloadImg = new Image();
        preloadImg.src = src;
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
  document.querySelectorAll('.floating-info-box img').forEach(img => {
    img.addEventListener('error', function() {
      const placeholder = document.createElement('div');
      placeholder.className = 'image-placeholder';
      this.parentNode.replaceChild(placeholder, this);
    });
  });

  document.querySelectorAll('.map-image').forEach(img => {
    img.addEventListener('error', function() {
      this.classList.add('image-error');
      const content = this.closest('.map-content') || this.closest('.map-container');
      if (content) content.classList.add('has-image-error');
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

  // === LAZY PRELOAD: warm the thumbnail cache as maps scroll into view ===
  const mapInViewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        preloadMapImages(entry.target);
        mapInViewObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '200px' });

  mapContainers.forEach(c => mapInViewObserver.observe(c));

  // === SMART INFO BOX POSITIONING (legacy floating boxes) ===
  function positionInfoBox(infoBox, icon) {
    if (window.innerWidth <= 768) {
      return;
    }

    infoBox.style.top = '';
    infoBox.style.bottom = '';
    infoBox.style.left = '';
    infoBox.style.right = '';
    infoBox.style.transform = '';
    infoBox.style.marginTop = '';
    infoBox.style.marginBottom = '';
    infoBox.style.maxWidth = '';
    infoBox.style.position = 'absolute';

    const iconRect = icon.getBoundingClientRect();
    const boxRect = infoBox.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const padding = 10;

    const spaceAbove = iconRect.top - padding;
    const spaceBelow = viewportHeight - iconRect.bottom - padding;
    const spaceLeft = iconRect.left + (iconRect.width / 2);
    const spaceRight = viewportWidth - iconRect.left - (iconRect.width / 2);

    const maxBoxWidth = Math.min(boxRect.width, viewportWidth - (padding * 2));
    if (maxBoxWidth < boxRect.width) {
      infoBox.style.maxWidth = `${maxBoxWidth}px`;
    }

    if (spaceBelow >= boxRect.height || spaceBelow >= spaceAbove) {
      infoBox.style.top = '100%';
      infoBox.style.bottom = 'auto';
      infoBox.style.marginTop = '10px';
    } else {
      infoBox.style.bottom = '100%';
      infoBox.style.top = 'auto';
      infoBox.style.marginBottom = '10px';
    }

    const halfBoxWidth = Math.min(boxRect.width, maxBoxWidth) / 2;

    if (spaceLeft < halfBoxWidth + padding) {
      const offset = halfBoxWidth - spaceLeft + padding;
      infoBox.style.left = '50%';
      infoBox.style.transform = `translateX(calc(-50% + ${offset}px))`;
    } else if (spaceRight < halfBoxWidth + padding) {
      const offset = halfBoxWidth - spaceRight + padding;
      infoBox.style.left = '50%';
      infoBox.style.transform = `translateX(calc(-50% - ${offset}px))`;
    } else {
      infoBox.style.left = '50%';
      infoBox.style.transform = 'translateX(-50%)';
    }
  }

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

  function addMapCloseButton(container) {
    if (container.querySelector('.map-close-btn')) return;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-button map-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close map');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMapOverlay();
    });
    container.appendChild(closeBtn);
  }

  function openMapOverlay(container) {
    container.classList.add('expanded');
    mapContainers.forEach(c => {
      if (c !== container) c.classList.add('dimmed');
    });
    document.body.classList.add('overlay-active');
    document.documentElement.classList.add('overlay-active');

    addMapCloseButton(container);
    preloadMapImages(container);
    createLocationList(container);

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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Create location list for expanded maps
  function createLocationList(container) {
    if (locationListEl) {
      locationListEl.remove();
    }

    const markers = container.querySelectorAll('.location-marker');
    if (markers.length === 0) return;

    locationListEl = document.createElement('div');
    locationListEl.className = 'location-list visible';
    locationListEl.innerHTML = `
      <div class="location-list-header">
        <span>Locations (${markers.length})</span>
        <button class="location-list-toggle">Show List</button>
      </div>
      <ul class="location-list-items" style="display:none"></ul>
    `;

    const listItems = locationListEl.querySelector('.location-list-items');
    const toggleBtn = locationListEl.querySelector('.location-list-toggle');

    const sortedMarkers = Array.from(markers).sort((a, b) => {
      const numA = parseInt(a.dataset.number) || 0;
      const numB = parseInt(b.dataset.number) || 0;
      return numA - numB;
    });

    sortedMarkers.forEach(marker => {
      const number = marker.dataset.number || '?';
      const name = marker.dataset.name || 'Location';
      const fiber = marker.dataset.fiber || '';
      const count = parseMarkerImages(marker).length;

      const li = document.createElement('li');
      li.className = 'location-list-item';
      li.innerHTML = `
        <div class="location-list-number">${escapeHtml(number)}</div>
        <div class="location-list-info">
          <div class="location-list-name">${escapeHtml(name)}</div>
          ${fiber ? `<div class="location-list-fiber">${escapeHtml(fiber)}</div>` : ''}
        </div>
        ${count > 1 ? `<span class="location-list-photos" title="${count} photos">${count} 📷</span>` : ''}
        <div class="location-list-arrow">›</div>
      `;

      li.addEventListener('click', (e) => {
        e.stopPropagation();
        showLocationOverlay(markerToLocationData(marker));
      });

      listItems.appendChild(li);
    });

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = listItems.style.display === 'none';
      listItems.style.display = isHidden ? '' : 'none';
      toggleBtn.textContent = isHidden ? 'Hide List' : 'Show List';
    });

    document.body.appendChild(locationListEl);
  }

  function hideLocationList() {
    if (locationListEl) {
      locationListEl.remove();
      locationListEl = null;
    }
  }

  function closeMapOverlay() {
    mapContainers.forEach(c => {
      c.classList.remove('expanded', 'dimmed');
      const closeBtn = c.querySelector('.map-close-btn');
      if (closeBtn) closeBtn.remove();
    });
    document.body.classList.remove('overlay-active');
    document.documentElement.classList.remove('overlay-active');
    hideScrollIndicator();
    hideLocationList();
    currentLocationIndex = -1;
  }

  mapContainers.forEach(container => {
    container.addEventListener('click', (e) => {
      if (e.target.closest('.floating-info-box') ||
          e.target.closest('.close-button') ||
          e.target.closest('.location-marker')) {
        return;
      }

      const isExpanded = container.classList.contains('expanded');

      if (isExpanded) {
        closeMapOverlay();
      } else {
        closeMapOverlay();
        openMapOverlay(container);
      }
    });
  });

  if (dimOverlay) {
    dimOverlay.addEventListener('click', () => {
      closeMapOverlay();
    });
  }

  // === DEEP LINK: #<mapId> scrolls to and expands that map ===
  // Used by search results that point at a map on another category page.
  function openMapFromHash() {
    const hash = (window.location.hash || '').replace(/^#/, '');
    if (!hash) return false;
    let mapId = hash;
    try { mapId = decodeURIComponent(hash); } catch (e) { /* keep raw */ }

    const mapPanel = document.getElementById(mapId);
    if (!mapPanel || !mapPanel.classList.contains('map-panel')) return false;
    const venue = mapPanel.closest('.venue');
    const container = mapPanel.querySelector('.map-container');
    if (!venue || !container) return false;

    activateMapTab(venue, mapId);
    venue.scrollIntoView({ behavior: 'auto', block: 'start' });

    // Let layout settle before expanding so the fixed overlay measures right
    setTimeout(() => {
      closeMapOverlay();
      openMapOverlay(container);

      // A search result on another page may have stashed the location to open
      let pendingLocation = '';
      try {
        pendingLocation = sessionStorage.getItem('wep-pending-location') || '';
        sessionStorage.removeItem('wep-pending-location');
      } catch (e) { /* storage unavailable */ }
      if (pendingLocation) {
        const marker = Array.from(mapPanel.querySelectorAll('.location-marker'))
          .find(m => m.dataset.locationId === pendingLocation);
        if (marker) {
          setTimeout(() => showLocationOverlay(markerToLocationData(marker)), 300);
        }
      }
    }, 150);
    return true;
  }

  openMapFromHash();
  window.addEventListener('hashchange', openMapFromHash);

  // === LEGACY FLOATING INFO BOX SUPPORT ===
  function extractLocationData(infoBox, icon) {
    const nameEl = infoBox.querySelector('strong, h3, h4');
    const descEl = infoBox.querySelector('p');
    const imgEl = infoBox.querySelector('img');
    const fiberEl = infoBox.querySelector('.fiber-info, [class*="fiber"]');

    const number = icon.textContent.trim();

    let fiber = '';
    if (fiberEl) {
      fiber = fiberEl.textContent.trim();
    } else {
      const text = infoBox.textContent;
      const fiberMatch = text.match(/(\d+\s*ST|\d+\s*fiber|fiber:\s*\d+)/i);
      if (fiberMatch) fiber = fiberMatch[0];
    }

    const image = imgEl ? (imgEl.dataset.src || imgEl.src) : '';
    return {
      number: number,
      name: nameEl ? nameEl.textContent.trim() : 'Location ' + number,
      description: descEl ? descEl.textContent.trim() : '',
      image: image,
      images: image ? [image] : [],
      fiber: fiber
    };
  }

  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);

    icon.addEventListener('click', e => {
      e.stopPropagation();
      if (!infoBox) return;
      showLocationOverlay(extractLocationData(infoBox, icon));
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
      openSingleImageModal(img.src);
    });
  });

  // === SWIPE GESTURES FOR MOBILE ===
  // Scoped to the expanded map container only. Gestures that begin inside a
  // vertically scrollable element (the location list, the bottom sheet, the
  // photo strip) are ignored, as are gestures that scrolled anything.
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

    const closeBtn = expandedMap.querySelector('.map-close-btn');
    if (closeBtn) closeBtn.remove();
    expandedMap.classList.remove('expanded');

    const nextMap = allMaps[nextIndex];
    nextMap.classList.add('expanded');
    addMapCloseButton(nextMap);
    preloadMapImages(nextMap);
    createLocationList(nextMap);
  }

  function isInsideVerticalScroller(el) {
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      if (node.nodeType === 1) {
        const style = window.getComputedStyle(node);
        const oy = style.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
          return true;
        }
      }
      node = node.parentNode;
    }
    return false;
  }

  if (isTouchDevice) {
    let gesture = null;

    const cancelGesture = () => { if (gesture) gesture.scrolled = true; };
    // Any scroll during the gesture (page, list, sheet, strip) disqualifies it
    document.addEventListener('scroll', cancelGesture, { passive: true, capture: true });

    document.addEventListener('touchstart', (e) => {
      gesture = null;
      if (e.touches.length !== 1) return;
      if (!document.body.classList.contains('overlay-active')) return;
      if (locationOverlay.classList.contains('visible') || isImageModalOpen()) return;

      const expandedMap = document.querySelector('.map-container.expanded');
      if (!expandedMap) return;

      const target = e.target;
      if (!(target instanceof Element) || !expandedMap.contains(target)) return;
      if (target.closest('.close-button')) return;
      if (isInsideVerticalScroller(target)) return;

      const t = e.touches[0];
      gesture = {
        startX: t.clientX,
        startY: t.clientY,
        startTime: Date.now(),
        scrolled: false,
        axis: null
      };
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (!gesture || gesture.scrolled) return;
      if (e.touches.length !== 1) { gesture.scrolled = true; return; }
      const t = e.touches[0];
      const dx = t.clientX - gesture.startX;
      const dy = t.clientY - gesture.startY;
      if (!gesture.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      if (!gesture) return;
      const g = gesture;
      gesture = null;
      if (g.scrolled) return;
      if (Date.now() - g.startTime > 800) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;
      const minSwipeDistance = 60;

      if (g.axis === 'y') {
        // Mostly vertical, downward: close the expanded map
        if (dy > minSwipeDistance && Math.abs(dy) > Math.abs(dx) * 2) {
          closeMapOverlay();
        }
      } else if (g.axis === 'x') {
        if (Math.abs(dx) > minSwipeDistance && Math.abs(dx) > Math.abs(dy) * 2) {
          navigateMaps(dx > 0 ? 'prev' : 'next');
        }
      }
    }, { passive: true });

    document.addEventListener('touchcancel', () => { gesture = null; }, { passive: true });
  }

  // === KEYBOARD NAVIGATION ===
  let currentLocationIndex = -1;

  function getExpandedMapMarkers() {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (!expandedMap) return [];
    const markers = Array.from(expandedMap.querySelectorAll('.location-marker'));
    if (markers.length > 0) {
      return markers.sort((a, b) => (parseInt(a.dataset.number) || 0) - (parseInt(b.dataset.number) || 0));
    }
    return Array.from(expandedMap.querySelectorAll('.location-icon'));
  }

  function navigateToLocation(index) {
    const items = getExpandedMapMarkers();
    if (items.length === 0) return;

    if (index < 0) index = items.length - 1;
    if (index >= items.length) index = 0;

    currentLocationIndex = index;
    const item = items[index];

    if (item.classList.contains('location-marker')) {
      showLocationOverlay(markerToLocationData(item));
    } else {
      const infoId = item.getAttribute('data-info-id');
      const infoBox = document.getElementById(infoId);
      if (infoBox) {
        showLocationOverlay(extractLocationData(infoBox, item));
      }
    }

    items.forEach(i => i.classList.remove('keyboard-focus'));
    item.classList.add('keyboard-focus');
  }

  document.addEventListener('keydown', (e) => {
    // Never hijack typing in the search box or other inputs
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Escape') {
      if (isImageModalOpen()) {
        closeImageModal();
      } else if (locationOverlay.classList.contains('visible')) {
        hideLocationOverlay();
      } else if (document.body.classList.contains('overlay-active')) {
        closeMapOverlay();
      }
      return;
    }

    // Zoom modal open: arrows move between photos
    if (isImageModalOpen()) {
      if (e.key === 'ArrowRight') { e.preventDefault(); showModalImage(modalIndex + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showModalImage(modalIndex - 1); }
      return;
    }

    // Location sheet open with several photos: arrows move the strip
    if (locationOverlay.classList.contains('visible')) {
      if (photoCount() > 1) {
        if (e.key === 'ArrowRight') { e.preventDefault(); stepPhoto(1); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); stepPhoto(-1); return; }
      }
      if (e.key === 'Enter' && photoCount() > 0 && document.activeElement === photoTrack) {
        e.preventDefault();
        openImageModal(currentPhotoIndex);
        return;
      }
    }

    if (!document.body.classList.contains('overlay-active')) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      navigateToLocation(currentLocationIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateToLocation(currentLocationIndex - 1);
    }

    const num = parseInt(e.key);
    if (num >= 1 && num <= 9) {
      e.preventDefault();
      navigateToLocation(num - 1);
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        navigateToLocation(currentLocationIndex - 1);
      } else {
        navigateToLocation(currentLocationIndex + 1);
      }
    }
  });

  // === PRINT: list every location under its map ===
  // Built lazily on beforeprint from marker data attributes; print.css shows it.
  function buildPrintLists() {
    mapContainers.forEach(container => {
      if (container.querySelector('.print-location-list')) return;
      const markers = Array.from(container.querySelectorAll('.location-marker'))
        .sort((a, b) => (parseInt(a.dataset.number) || 0) - (parseInt(b.dataset.number) || 0));
      if (markers.length === 0) return;
      const panel = container.closest('.map-panel');
      const venue = container.closest('.venue');
      if (panel && venue && !panel.querySelector('.print-map-label')) {
        const tab = venue.querySelector(`.map-tab[data-map="${panel.id}"]`);
        const labelText = tab ? tab.textContent.trim() : (markers[0].dataset.mapLabel || '');
        if (labelText) {
          const label = document.createElement('div');
          label.className = 'print-map-label';
          label.textContent = labelText;
          panel.insertBefore(label, container);
        }
      }
      const list = document.createElement('ol');
      list.className = 'print-location-list';
      markers.forEach(marker => {
        const li = document.createElement('li');
        const number = marker.dataset.number || '';
        const fiber = marker.dataset.fiber ? ` (${marker.dataset.fiber})` : '';
        li.innerHTML = `<strong>${escapeHtml(number)}. ${escapeHtml(marker.dataset.name || 'Location')}</strong>${escapeHtml(fiber)}` +
          (marker.dataset.description ? `<span class="print-location-desc">${escapeHtml(marker.dataset.description)}</span>` : '');
        list.appendChild(li);
      });
      container.appendChild(list);
    });
  }
  window.addEventListener('beforeprint', buildPrintLists);
  if (window.matchMedia) {
    const printQuery = window.matchMedia('print');
    if (printQuery.addEventListener) {
      printQuery.addEventListener('change', (mq) => { if (mq.matches) buildPrintLists(); });
    }
  }

  // === SERVICE WORKER UPDATE TOAST ===
  // When a new service worker takes control, tell the user instead of
  // silently serving cached content until the next visit.
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    let toastShown = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || toastShown) return;
      toastShown = true;
      const toast = document.createElement('button');
      toast.type = 'button';
      toast.className = 'sw-update-toast';
      toast.setAttribute('aria-live', 'polite');
      toast.textContent = 'Updated, tap to refresh';
      toast.addEventListener('click', () => window.location.reload());
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('visible'));
    });
  }
});
