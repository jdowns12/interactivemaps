document.addEventListener("DOMContentLoaded", () => {
  const imageModalOverlay = document.getElementById('image-modal-overlay');
  const imageModalContent = document.getElementById('image-modal-content');
  const imageModalClose = document.getElementById('image-modal-close');
  const dimOverlay = document.querySelector('.dim-overlay');

  // Expand/Collapse Logic for maps
  document.querySelectorAll('.map-container').forEach(map => {
    map.addEventListener('click', (e) => {
      if (e.target.classList.contains('map-container') || e.target.classList.contains('map-image')) {
        if (!map.classList.contains('expanded')) {
            expandOnlyThisMap(map);
        }
      }
    });

    const closeBtn = map.querySelector('.close-button');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        collapseMap(map);
      });
    }
  });

  // Location icon hover + click logic
  document.querySelectorAll('.location-icon').forEach(icon => {
    const infoId = icon.getAttribute('data-info-id');
    const infoBox = document.getElementById(infoId);
    const mapContent = icon.closest('.map-content');

    icon.addEventListener('click', (e) => {
      e.stopPropagation();
      const parentMap = icon.closest('.map-container');
      if (parentMap && !parentMap.classList.contains('expanded')) {
        expandOnlyThisMap(parentMap);
        setTimeout(() => { // Allow map to expand before positioning infoBox
            togglePersistentInfoBox(icon, infoBox, mapContent);
        }, 50);
      } else if (parentMap && parentMap.classList.contains('expanded')) {
        togglePersistentInfoBox(icon, infoBox, mapContent);
      }
    });

    icon.addEventListener('mouseenter', () => {
      const parentMap = icon.closest('.map-container');
      if (parentMap && parentMap.classList.contains('expanded')) {
        if (!icon.classList.contains('expanded')) {
          positionFloatingBox(icon, infoBox, mapContent);
        }
      }
    });

    icon.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';
      }
    });

    if (infoBox) {
        infoBox.addEventListener('mouseenter', () => {
            const parentMap = icon.closest('.map-container');
            if (parentMap && parentMap.classList.contains('expanded')) {
                 if (!icon.classList.contains('expanded')) {
                    positionFloatingBox(icon, infoBox, mapContent);
                }
            }
        });
        infoBox.addEventListener('mouseleave', () => {
            if (!icon.classList.contains('expanded')) {
                infoBox.style.display = 'none';
            }
        });
    }
  });

  document.querySelectorAll('.floating-info-box img').forEach(infoImage => {
    infoImage.addEventListener('click', (e) => {
      e.stopPropagation();
      imageModalContent.src = infoImage.src;
      imageModalOverlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    });
  });

  function closeImageModal() {
    imageModalOverlay.style.display = 'none';
    imageModalContent.src = "";
    document.body.style.overflow = '';
  }

  imageModalClose.addEventListener('click', () => {
    closeImageModal();
  });

  imageModalOverlay.addEventListener('click', (e) => {
    if (e.target === imageModalOverlay) {
      closeImageModal();
    }
  });

  document.querySelectorAll('.info-close-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const infoBox = button.closest('.floating-info-box');
      if (infoBox) {
        infoBox.style.display = 'none';
        const icon = document.querySelector(`.location-icon[data-info-id="${infoBox.id}"]`);
        if (icon) icon.classList.remove('expanded');
      }
    });
  });

  dimOverlay.addEventListener('click', () => {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (expandedMap) {
      collapseMap(expandedMap);
    }
  });
}); // End of DOMContentLoaded

function expandOnlyThisMap(selectedMap) {
  document.querySelectorAll('.floating-info-box').forEach(ib => {
    ib.style.display = 'none';
  });
  document.querySelectorAll('.location-icon.expanded').forEach(ic => ic.classList.remove('expanded'));
  const imageModalOverlay = document.getElementById('image-modal-overlay');
  if (imageModalOverlay.style.display === 'flex') {
    imageModalOverlay.style.display = 'none';
    document.getElementById('image-modal-content').src = "";
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.map-container').forEach(map => {
    map.classList.remove('dimmed', 'expanded');
    map.style.pointerEvents = 'auto';
  });

  selectedMap.classList.add('expanded');
  document.body.classList.add('overlay-active');

  document.querySelectorAll('.map-container').forEach(map => {
    if (map !== selectedMap) {
      map.classList.add('dimmed');
      map.style.pointerEvents = 'none';
    }
  });
  selectedMap.style.pointerEvents = 'auto';
}

function collapseMap(map) {
  map.classList.remove('expanded');
  document.body.classList.remove('overlay-active');
  document.querySelectorAll('.map-container').forEach(m => {
    m.classList.remove('dimmed');
    m.style.pointerEvents = 'auto';
  });
  map.querySelectorAll('.floating-info-box').forEach(infoBox => {
    infoBox.style.display = 'none';
  });
  map.querySelectorAll('.location-icon.expanded').forEach(icon => {
    icon.classList.remove('expanded');
  });
}

function togglePersistentInfoBox(icon, infoBox, mapContent) {
  const isCurrentlyExpanded = icon.classList.contains('expanded');

  document.querySelectorAll('.location-icon.expanded').forEach(otherIcon => {
    if (otherIcon !== icon) {
      otherIcon.classList.remove('expanded');
      const otherInfoBoxId = otherIcon.getAttribute('data-info-id');
      const otherInfoBox = document.getElementById(otherInfoBoxId);
      if (otherInfoBox) {
        otherInfoBox.style.display = 'none';
      }
    }
  });

  if (isCurrentlyExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';
  } else {
    icon.classList.add('expanded');
    positionFloatingBox(icon, infoBox, mapContent);
  }
}

function positionFloatingBox(icon, infoBox, mapContent) {
  if (!icon || !infoBox || !mapContent) return; // mapContent is now important

  const parentMap = icon.closest('.map-container');
  // Only position if the map is expanded
  if (!parentMap || !parentMap.classList.contains('expanded')) {
    infoBox.style.display = 'none'; // Ensure it's hidden if map not expanded
    return;
  }

  // Prepare for measurement
  infoBox.style.visibility = 'hidden';
  infoBox.style.position = 'absolute'; // Position relative to mapContent
  infoBox.style.display = 'block';

  const boxHeight = infoBox.offsetHeight;
  const boxWidth = infoBox.offsetWidth;

  // Get dimensions of the mapContent area (which fills the expanded map)
  const contentHeight = mapContent.offsetHeight;
  const contentWidth = mapContent.offsetWidth;

  // Calculate top and left to center the infoBox within mapContent
  let newTop = (contentHeight / 2) - (boxHeight / 2);
  let newLeft = (contentWidth / 2) - (boxWidth / 2);

  // Apply new position
  infoBox.style.top = `${newTop}px`;
  infoBox.style.left = `${newLeft}px`;
  infoBox.style.transform = 'none'; // Override any CSS transforms like translateX

  // Make it visible
  infoBox.style.visibility = 'visible';
  infoBox.style.display = 'block'; // Ensure it stays block

  // Remove 'above'/'below' classes as they are not used for this positioning logic
  infoBox.classList.remove('above', 'below');
}