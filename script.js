document.addEventListener('DOMContentLoaded', () => {
  const mapContainers = document.querySelectorAll('.map-container');
  const dimOverlay = document.querySelector('.dim-overlay');
  const imageModalOverlay = document.getElementById('image-modal-overlay');
  const imageModalContent = document.getElementById('image-modal-content');
  const imageModalClose = document.getElementById('image-modal-close');

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const toggledBoxes = new Set();
  const preloadedMaps = new Set();

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

    // Apply saved position to prevent jump
    document.body.style.top = `-${savedScrollPosition}px`;

    // Preload all images for this map
    preloadMapImages(container);

    // Listen for scroll to hide indicator
    const scrollHandler = () => {
      if (container.scrollTop > 30) {
        hideScrollIndicator();
        container.removeEventListener('scroll', scrollHandler);
      }
    };
    container.addEventListener('scroll', scrollHandler);
  }

  function closeMapOverlay() {
    mapContainers.forEach(c => c.classList.remove('expanded', 'dimmed'));
    document.body.classList.remove('overlay-active');
    document.documentElement.classList.remove('overlay-active');
    document.body.style.top = '';
    hideScrollIndicator();

    // Restore scroll position
    window.scrollTo(0, savedScrollPosition);
    currentLocationIndex = -1;
  }

  mapContainers.forEach(container => {
    container.addEventListener('click', (e) => {
      // Don't toggle if clicking on info box or close button
      if (e.target.closest('.floating-info-box') || e.target.closest('.close-button')) {
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

  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);

    if (!isTouchDevice) {
      let hoverTimer;

      icon.addEventListener('mouseenter', () => {
        if (!toggledBoxes.has(infoId)) {
          infoBox.classList.add('visible');
          infoBox.style.pointerEvents = 'none';
        }
      });

      icon.addEventListener('mouseleave', () => {
        hoverTimer = setTimeout(() => {
          if (!toggledBoxes.has(infoId)) {
            infoBox.classList.remove('visible');
            infoBox.style.pointerEvents = '';
          }
        }, 200);
      });

      infoBox.addEventListener('mouseenter', () => {
        clearTimeout(hoverTimer);
      });

      infoBox.addEventListener('mouseleave', () => {
        hoverTimer = setTimeout(() => {
          if (!toggledBoxes.has(infoId)) {
            infoBox.classList.remove('visible');
            infoBox.style.pointerEvents = '';
          }
        }, 200);
      });
    }

    icon.addEventListener('click', e => {
      e.stopPropagation();
      const isVisible = infoBox.classList.contains('visible');

      document.querySelectorAll('.floating-info-box.visible').forEach(box => {
        if (box !== infoBox) {
          box.classList.remove('visible');
          box.style.pointerEvents = '';
          toggledBoxes.delete(box.id);
        }
      });

      if (isVisible && toggledBoxes.has(infoId)) {
        infoBox.classList.remove('visible');
        infoBox.style.pointerEvents = '';
        toggledBoxes.delete(infoId);
        hideScrollIndicator();
      } else {
        infoBox.classList.add('visible');
        infoBox.style.pointerEvents = 'auto';
        toggledBoxes.add(infoId);
        // Smart positioning after making visible
        requestAnimationFrame(() => positionInfoBox(infoBox, icon));
        // Show scroll indicator when info box content loads (on expanded map)
        if (document.body.classList.contains('overlay-active')) {
          const img = infoBox.querySelector('img');
          if (img && !img.complete) {
            // Wait for image to load
            img.addEventListener('load', () => {
              showScrollIndicator();
              setTimeout(() => hideScrollIndicator(), 3000);
            }, { once: true });
            // Also handle if image fails to load
            img.addEventListener('error', () => {
              showScrollIndicator();
              setTimeout(() => hideScrollIndicator(), 3000);
            }, { once: true });
          } else {
            // No image or already loaded - show after short delay for content render
            setTimeout(() => {
              showScrollIndicator();
              setTimeout(() => hideScrollIndicator(), 3000);
            }, 100);
          }
        }
      }
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

    // Close all open info boxes first
    document.querySelectorAll('.floating-info-box.visible').forEach(box => {
      box.classList.remove('visible');
      box.style.pointerEvents = '';
      toggledBoxes.delete(box.id);
    });

    // Click the icon to show its info
    icon.click();

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
      } else if (document.querySelector('.floating-info-box.visible')) {
        const openBoxes = document.querySelectorAll('.floating-info-box.visible');
        const lastOpenBox = openBoxes[openBoxes.length - 1];
        lastOpenBox.classList.remove('visible');
        lastOpenBox.style.pointerEvents = '';
        toggledBoxes.delete(lastOpenBox.id);
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
