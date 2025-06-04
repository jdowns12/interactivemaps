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
        collapseMap(map);
      });
    }
  });

  // Location icon hover + click logic for info boxes
  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);
    const mapContent = icon.closest('.map-content');

    // Click to toggle persistent info box
    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      // If the icon is part of a hidden wrapper (due to filtering), don't show infobox
      if (icon.closest('.location-wrapper.hidden-by-filter')) {
          return;
      }
      togglePersistentInfoBox(icon, infoBox, mapContent);
    });

    // Mouseenter to show info box (if not persistently shown)
    icon.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded') && !icon.closest('.location-wrapper.hidden-by-filter')) {
        positionFloatingBox(icon, infoBox, mapContent);
        if (infoBox) infoBox.style.display = 'block';
      }
    });

    // Mouseleave to hide info box (if not persistently shown)
    icon.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        if (infoBox) infoBox.style.display = 'none';
      }
    });

    // Mouseleave from info box itself (if not persistently shown)
    if (infoBox) {
        infoBox.addEventListener('mouseleave', () => {
          if (!icon.classList.contains('expanded')) {
            infoBox.style.display = 'none';
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
      e.stopPropagation(); // Prevent map click or icon click
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
    // Click on overlay (outside image) to close
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
        // Show if no filters selected OR if wrapper's color is in selected list
        if (selectedColors.length === 0 || selectedColors.includes(wrapperColor)) {
          wrapper.classList.remove('hidden-by-filter');
        } else {
          wrapper.classList.add('hidden-by-filter');
          // Also hide any active info box associated with a hidden icon
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

    // Initial filter application
    applyMap5Filter();
  }
  // --- END OF SCRIPT FOR MAP 5 COLOR KEY FILTERING ---

}); // End of DOMContentLoaded

/**
 * Expands only the selected map and dims others.
 * @param {HTMLElement} selectedMap - The map container to expand.
 */
function expandOnlyThisMap(selectedMap) {
  // Hide all info boxes first to prevent them from staying open when map changes state
  document.querySelectorAll('.floating-info-box').forEach(box => box.style.display = 'none');
  document.querySelectorAll('.location-icon.expanded').forEach(icon => icon.classList.remove('expanded'));

  // Reset all maps
  document.querySelectorAll('.map-container').forEach(map => {
    map.classList.remove('dimmed', 'expanded'); 
    map.style.pointerEvents = 'auto';
  });

  // Expand the selected map
  selectedMap.classList.add('expanded');
  document.body.classList.add('overlay-active'); // Activate dim overlay for background

  // Add a one-time click listener to the document to close the map if clicked outside
  // Store it in a way that it can be removed later to prevent multiple listeners
  document.closeMapHandler = function(e) {
    // Check if the click is outside the expanded map and not on an element that should keep it open
    // (e.g., not on the map itself, or an info box, or an image modal close button)
    if (!selectedMap.contains(e.target) && 
        e.target !== selectedMap && 
        !e.target.closest('.floating-info-box') &&
        !e.target.closest('#image-modal-overlay')) { 
      collapseMap(selectedMap);
    }
  };
  // Add delay to prevent immediate closing if the click was on the map to expand it
  setTimeout(() => { 
      document.addEventListener('click', document.closeMapHandler);
  }, 0);
}

/**
 * Collapses the specified map.
 * @param {HTMLElement} map - The map container to collapse.
 */
function collapseMap(map) {
  map.classList.remove('expanded');
  document.body.classList.remove('overlay-active'); // Deactivate dim overlay
  
  // Make all maps interactive again
  document.querySelectorAll('.map-container').forEach(m => {
    m.classList.remove('dimmed');
    m.style.pointerEvents = 'auto';
  });

  // Hide all info boxes when map collapses
  document.querySelectorAll('.floating-info-box').forEach(box => box.style.display = 'none');
  document.querySelectorAll('.location-icon.expanded').forEach(icon => icon.classList.remove('expanded'));

  // Remove the specific click listener for closing the map
  if (document.closeMapHandler) {
    document.removeEventListener('click', document.closeMapHandler);
    delete document.closeMapHandler; // Clean up the stored handler
  }
}

/**
 * Toggles the persistent display of an info box.
 * @param {HTMLElement} icon - The location icon clicked.
 * @param {HTMLElement} infoBox - The associated info box.
 * @param {HTMLElement} mapContent - The parent map content area.
 */
function togglePersistentInfoBox(icon, infoBox, mapContent) {
  if (!infoBox || !icon || !mapContent) return;
  const isExpanded = icon.classList.contains('expanded');

  // Hide all other info boxes on this map before showing/hiding the current one
  mapContent.querySelectorAll('.floating-info-box').forEach(visBox => {
    if (visBox !== infoBox) visBox.style.display = 'none';
  });
  mapContent.querySelectorAll('.location-icon.expanded').forEach(expIcon => {
    if (expIcon !== icon) expIcon.classList.remove('expanded');
  });

  if (isExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';
  } else {
    icon.classList.add('expanded');
    positionFloatingBox(icon, infoBox, mapContent); // Position it first
    infoBox.style.display = 'block'; // Then display
  }
}

/**
 * Positions a floating info box relative to its icon and within the map content.
 * @param {HTMLElement} icon - The location icon.
 * @param {HTMLElement} infoBox - The info box to position.
 * @param {HTMLElement} mapContent - The bounding map content area.
 */
function positionFloatingBox(icon, infoBox, mapContent) {
  if (!infoBox || !mapContent || !icon) return;

  // Temporarily make visible to measure, but off-screen or transparent
  infoBox.style.visibility = 'hidden';
  infoBox.style.display = 'block'; 
  infoBox.classList.remove('above', 'below'); // Reset positioning classes

  const iconRect = icon.getBoundingClientRect();
  const mapRect = mapContent.getBoundingClientRect(); // Reference for relative positioning
  
  const boxHeight = infoBox.offsetHeight;
  const boxWidth = infoBox.offsetWidth;
  
  // Calculate space available within the viewport relative to the icon's bottom/top
  const spaceBelowViewport = window.innerHeight - iconRect.bottom;
  const spaceAboveViewport = iconRect.top;
  
  // Calculate icon's center X relative to mapContent for horizontal positioning
  const iconCenterXRel = (iconRect.left + iconRect.width / 2) - mapRect.left;
  
  let topPositionRel;
  // Default to placing below the icon
  infoBox.classList.add('below');
  topPositionRel = (iconRect.bottom - mapRect.top) + 10; // 10px offset

  // Conditions to place above:
  // 1. Not enough space below in viewport AND more space above in viewport.
  // 2. Or, placing below would make it go off the bottom of the mapContent itself.
  if ( (spaceBelowViewport < boxHeight && spaceAboveViewport > spaceBelowViewport && spaceAboveViewport >= boxHeight) || 
       (topPositionRel + boxHeight > mapRect.height && (iconRect.top - mapRect.top) - boxHeight - 10 >=0 ) ) {
    topPositionRel = (iconRect.top - mapRect.top) - boxHeight - 10; // Position above icon with 10px offset
    infoBox.classList.remove('below');
    infoBox.classList.add('above');
  }
  
  // Horizontal positioning: attempt to center the box over/under the icon
  let leftPositionRel = iconCenterXRel - (boxWidth / 2);

  // Keep infoBox within mapContent horizontally, with a small padding
  const padding = 5; // 5px padding from edges
  if (leftPositionRel < padding) {
    leftPositionRel = padding; 
  } else if (leftPositionRel + boxWidth > mapRect.width - padding) {
    leftPositionRel = mapRect.width - boxWidth - padding; 
  }
  
  // Ensure infoBox doesn't go above the top of mapContent
  if (topPositionRel < padding && infoBox.classList.contains('above')) {
      topPositionRel = padding;
  }
  // Ensure infoBox doesn't go below the bottom of mapContent
  if (topPositionRel + boxHeight > mapRect.height - padding && infoBox.classList.contains('below')) {
      // If it would overflow below, and there was space above, try to flip it
      if ((iconRect.top - mapRect.top) - boxHeight - 10 >= padding) {
          topPositionRel = (iconRect.top - mapRect.top) - boxHeight - 10;
          infoBox.classList.remove('below');
          infoBox.classList.add('above');
          // Re-check top boundary after flip
          if (topPositionRel < padding) topPositionRel = padding;
      } else { // If still no space above, pin to bottom edge
          topPositionRel = mapRect.height - boxHeight - padding;
      }
  }

  infoBox.style.top = `${topPositionRel}px`;
  infoBox.style.left = `${leftPositionRel}px`;
  // Reset transform if we manually set left for centering, as it might conflict with other transforms
  infoBox.style.transform = 'translateX(0)'; 

  infoBox.style.visibility = 'visible'; // Make it visible after positioning
}