// Main script for WEP Venue Maps
document.addEventListener("DOMContentLoaded", () => {
  // Expand/Collapse Logic for map containers
  document.querySelectorAll('.map-container').forEach(map => {
    map.addEventListener('click', (e) => {
      // Prevent expansion if click is on interactive elements within the map
      if (e.target.closest('.location-icon') || e.target.closest('.color-key') || e.target.closest('.close-button') || e.target.closest('.floating-info-box')) {
        return;
      }
      e.stopPropagation();
      expandOnlyThisMap(map);
    });

    // Close button for expanded map
    const closeBtn = map.querySelector('.close-button');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseMap(map); // Pass the specific map to collapse
      });
    }
  });

  // Location icon hover + click logic for info boxes
  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);
    const mapContent = icon.closest('.map-content');

    // Click on icon to toggle persistent info box
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      if (icon.closest('.location-wrapper.hidden-by-filter')) {
          return;
      }
      if (!infoBox) {
          console.error('[ICON CLICK] No infoBox found for infoId:', infoId, 'Icon:', icon);
          return;
      }
      togglePersistentInfoBox(icon, infoBox, mapContent);
    });

    // Mouseenter on icon to show info box (non-persistent)
    icon.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded') && !icon.closest('.location-wrapper.hidden-by-filter')) {
        if (!infoBox) {
          return;
        }
        positionFloatingBox(icon, infoBox, mapContent);
        infoBox.style.display = 'block';
      }
    });

    // Mouseleave from icon
    icon.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!icon.classList.contains('expanded') && infoBox && infoBox.style.display === 'block') {
          const isMouseOverInfoBox = infoBox.matches(':hover');
          if (!isMouseOverInfoBox) {
            infoBox.style.display = 'none';
          }
        }
      }, 50); 
    });

    if (infoBox) {
        // Click on infoBox: if it was only hover-visible, make it persistent.
        infoBox.addEventListener('click', (e) => {
            if (!icon.classList.contains('expanded')) {
                togglePersistentInfoBox(icon, infoBox, mapContent);
            }
            e.stopPropagation();
        });

        // Mouseleave from info box itself (if not persistently shown)
        infoBox.addEventListener('mouseleave', () => {
          if (!icon.classList.contains('expanded')) {
            const isMouseOverIcon = icon.matches(':hover');
            if (!isMouseOverIcon) {
                 infoBox.style.display = 'none';
            }
          }
        });

        // Close button within info box
        const infoCloseBtn = infoBox.querySelector('.info-close-button');
        if (infoCloseBtn) {
            infoCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                infoBox.style.display = 'none';
                if (icon) icon.classList.remove('expanded');
            });
        }
    }
  });

  // Image Modal Logic for images within info boxes
  const modalOverlay = document.getElementById('image-modal-overlay');
  const modalImage = document.getElementById('image-modal-content');
  const modalClose = document.getElementById('image-modal-close');

  document.querySelectorAll('.floating-info-box img').forEach(img => {
    img.addEventListener('click', function(e) {
      e.stopPropagation(); 
      if (modalOverlay && modalImage) {
        modalImage.src = this.src;
        modalOverlay.style.display = 'flex';
      }
    });
  });

  if (modalClose) {
    modalClose.addEventListener('click', () => {
      if (modalOverlay) modalOverlay.style.display = 'none';
    });
  }
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) { 
        modalOverlay.style.display = 'none';
      }
    });
  }

  // --- SCRIPT FOR MAP 5 COLOR KEY FILTERING ---
  const map5Container = document.querySelector('.map-container[data-map-id="map5"]');
  if (map5Container) {
    const filterCheckboxes = map5Container.querySelectorAll('.color-filter-checkbox');
    const locationWrappersInMap5 = map5Container.querySelectorAll('.map-content .location-wrapper');

    function applyMap5Filter() {
      const selectedColors = [];
      filterCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedColors.push(checkbox.dataset.filterColor);
        }
      });

      locationWrappersInMap5.forEach(wrapper => {
        const wrapperColor = wrapper.dataset.floorColor;
        if (selectedColors.length === 0 || selectedColors.includes(wrapperColor)) {
          wrapper.classList.remove('hidden-by-filter');
        } else {
          wrapper.classList.add('hidden-by-filter');
          const icon = wrapper.querySelector('.location-icon');
          if (icon && icon.classList.contains('expanded')) {
              const infoId = icon.getAttribute('data-info-id');
              const infoBox = document.getElementById(infoId);
              if (infoBox) {
                  infoBox.style.display = 'none';
                  icon.classList.remove('expanded');
              }
          }
        }
      });
    }

    filterCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', applyMap5Filter);
    });
    applyMap5Filter();
  }
  // --- END OF SCRIPT FOR MAP 5 COLOR KEY FILTERING ---

  // --- GLOBAL KEYDOWN LISTENER FOR ESCAPE KEY ---
  document.addEventListener('keydown', function(event) {
    if (event.key === "Escape" || event.key === "Esc") { 
      if (modalOverlay && modalOverlay.style.display === 'flex') {
        modalOverlay.style.display = 'none';
        return; 
      }
      const expandedMap = document.querySelector('.map-container.expanded');
      if (expandedMap) {
        collapseMap(expandedMap);
      }
    }
  });
  // --- END OF GLOBAL KEYDOWN LISTENER ---

  // --- CLICK LISTENER FOR DIM OVERLAY TO CLOSE EXPANDED MAP ---
  const dimOverlay = document.querySelector('.dim-overlay');
  if (dimOverlay) {
    dimOverlay.addEventListener('click', () => {
      const expandedMap = document.querySelector('.map-container.expanded');
      if (expandedMap) {
        collapseMap(expandedMap);
      }
    });
  }
  // --- END OF DIM OVERLAY CLICK LISTENER ---

}); // End of DOMContentLoaded

/**
 * Expands only the selected map and dims others.
 * @param {HTMLElement} selectedMap - The map container to expand.
 */
function expandOnlyThisMap(selectedMap) {
  // Hide all info boxes first to prevent them from staying open when map changes state
  document.querySelectorAll('.floating-info-box').forEach(box => box.style.display = 'none');
  document.querySelectorAll('.location-icon.expanded').forEach(icon => icon.classList.remove('expanded'));

  // Reset all maps (collapse any other expanded map)
  document.querySelectorAll('.map-container.expanded').forEach(map => {
    if (map !== selectedMap) {
        collapseMap(map); // Collapse other maps
    }
  });
  // Dim all maps initially
  document.querySelectorAll('.map-container').forEach(map => {
    map.classList.add('dimmed');
    map.style.pointerEvents = 'none'; // Make non-selected maps non-interactive
  });
  
  // Undim and expand the selected map
  selectedMap.classList.remove('dimmed');
  selectedMap.classList.add('expanded');
  selectedMap.style.pointerEvents = 'auto'; // Make selected map interactive

  document.body.classList.add('overlay-active'); // Activate dim overlay for background
}

/**
 * Collapses the specified map.
 * @param {HTMLElement} map - The map container to collapse.
 */
function collapseMap(map) {
  if (map && map.classList.contains('expanded')) { // Check if the map is actually expanded
    map.classList.remove('expanded');
    document.body.classList.remove('overlay-active'); // Deactivate dim overlay
    
    // Make all maps interactive again and remove dimming
    document.querySelectorAll('.map-container').forEach(m => {
      m.classList.remove('dimmed');
      m.style.pointerEvents = 'auto';
    });

    // Hide all info boxes when map collapses
    document.querySelectorAll('.floating-info-box').forEach(box => box.style.display = 'none');
    document.querySelectorAll('.location-icon.expanded').forEach(icon => icon.classList.remove('expanded'));
  }
}

/**
 * Toggles the persistent display of an info box.
 * @param {HTMLElement} icon - The location icon clicked.
 * @param {HTMLElement} infoBox - The associated info box.
 * @param {HTMLElement} mapContent - The parent map content area.
 */
function togglePersistentInfoBox(icon, infoBox, mapContent) {
  if (!infoBox) { 
    console.error('[togglePersistentInfoBox] ERROR: infoBox is null or undefined for icon:', icon.dataset.infoId); 
    return;
  }
  if (!icon || !mapContent) { 
     console.error('[togglePersistentInfoBox] ERROR: Missing icon or mapContent.', {iconId: icon?.dataset.infoId, mapContentExists: !!mapContent}); 
    return;
  }

  const wasInitiallyExpanded = icon.classList.contains('expanded');

  // Close OTHERS first within the same mapContent
  mapContent.querySelectorAll('.location-icon.expanded').forEach(otherIcon => {
    if (otherIcon !== icon) {
      otherIcon.classList.remove('expanded');
      const otherInfoBox = document.getElementById(otherIcon.dataset.infoId);
      if (otherInfoBox) otherInfoBox.style.display = 'none';
    }
  });

  if (wasInitiallyExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';
  } else {
    icon.classList.add('expanded');
    positionFloatingBox(icon, infoBox, mapContent);
    infoBox.style.display = 'block';
  }
}


/**
 * Positions a floating info box relative to its icon and within the map content.
 * Ensures the info box does not directly cover the icon that triggered it.
 * @param {HTMLElement} icon - The location icon.
 * @param {HTMLElement} infoBox - The info box to position.
 * @param {HTMLElement} mapContent - The bounding map content area.
 */
function positionFloatingBox(icon, infoBox, mapContent) {
  if (!infoBox || !mapContent || !icon) return;

  infoBox.style.visibility = 'hidden';
  infoBox.style.display = 'block'; 
  infoBox.classList.remove('above', 'below'); 

  const iconRect = icon.getBoundingClientRect();
  const mapRect = mapContent.getBoundingClientRect(); 
  
  const boxHeight = infoBox.offsetHeight;
  const boxWidth = infoBox.offsetWidth;
  
  const spaceBelowViewport = window.innerHeight - iconRect.bottom;
  const spaceAboveViewport = iconRect.top;
  
  const iconCenterXRel = (iconRect.left + iconRect.width / 2) - mapRect.left;
  const offset = 15; 

  let topPositionRel;
  
  if (spaceBelowViewport >= boxHeight + offset || (spaceBelowViewport > spaceAboveViewport && spaceBelowViewport >= boxHeight)) {
    topPositionRel = (iconRect.bottom - mapRect.top) + offset; 
    infoBox.classList.add('below');
  } 
  else if (spaceAboveViewport >= boxHeight + offset) {
    topPositionRel = (iconRect.top - mapRect.top) - boxHeight - offset; 
    infoBox.classList.add('above');
  }
  else if (spaceBelowViewport > spaceAboveViewport) {
    topPositionRel = (iconRect.bottom - mapRect.top) + 5; 
     infoBox.classList.add('below');
  } else {
    topPositionRel = (iconRect.top - mapRect.top) - boxHeight - 5; 
    infoBox.classList.add('above');
  }
  
  let leftPositionRel = iconCenterXRel - (boxWidth / 2);
  const padding = 5; 
  if (leftPositionRel < padding) {
    leftPositionRel = padding; 
  } else if (leftPositionRel + boxWidth > mapRect.width - padding) {
    leftPositionRel = mapRect.width - boxWidth - padding; 
  }
  
  if (topPositionRel < padding) {
      topPositionRel = padding;
  }
  if (topPositionRel + boxHeight > mapRect.height - padding) {
      topPositionRel = mapRect.height - boxHeight - padding;
      if (infoBox.classList.contains('below') && topPositionRel < (iconRect.bottom - mapRect.top) + 5){
          // This case is tricky, might mean the box is too tall for the space.
      }
  }

  infoBox.style.top = `${topPositionRel}px`;
  infoBox.style.left = `${leftPositionRel}px`;
  infoBox.style.transform = 'translateX(0)'; 
  infoBox.style.visibility = 'visible'; 
}
