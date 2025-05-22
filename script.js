document.addEventListener("DOMContentLoaded", () => {
  // Expand/Collapse Logic
  document.querySelectorAll('.map-container').forEach(map => {
    map.addEventListener('click', (e) => {
      e.stopPropagation();
      expandOnlyThisMap(map);
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
      togglePersistentInfoBox(icon, infoBox, mapContent);
    });

    icon.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded')) {
        positionFloatingBox(icon, infoBox, mapContent);
        infoBox.style.display = 'block';
      }
    });

    icon.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';
      }
    });

    infoBox.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';
      }
    });
  });
});

function expandOnlyThisMap(selectedMap) {
  document.querySelectorAll('.map-container').forEach(map => {
    map.classList.remove('dimmed');
    map.style.pointerEvents = 'auto';
  });

  document.querySelectorAll('.map-container').forEach(map => {
    if (map !== selectedMap) {
      map.classList.add('dimmed');
      map.style.pointerEvents = 'none';
    }
  });

  selectedMap.classList.add('expanded');
  document.body.classList.add('overlay-active');

  document.addEventListener('click', closeMapIfClickedOutside);
}

function collapseMap(map) {
  map.classList.remove('expanded');
  document.body.classList.remove('overlay-active');
  document.querySelectorAll('.map-container').forEach(m => {
    m.classList.remove('dimmed');
    m.style.pointerEvents = 'auto';
  });

  document.removeEventListener('click', closeMapIfClickedOutside);
}

function closeMapIfClickedOutside(e) {
  const expandedMap = document.querySelector('.map-container.expanded');
  if (expandedMap && !expandedMap.contains(e.target)) {
    collapseMap(expandedMap);
  }
}

function togglePersistentInfoBox(icon, infoBox, mapContent) {
  const isExpanded = icon.classList.contains('expanded');
  if (isExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';
  } else {
    icon.classList.add('expanded');
    positionFloatingBox(icon, infoBox, mapContent);
    infoBox.style.display = 'block';
  }
}

// 📍 This function is the most important: dynamic above/below placement
function positionFloatingBox(icon, infoBox, mapContent) {
  if (!infoBox || !mapContent) return;

  // Temporarily show box to calculate position
  infoBox.style.visibility = 'hidden';
  infoBox.style.display = 'block';
  infoBox.classList.remove('above', 'below');

  const iconRect = icon.getBoundingClientRect();
  const mapRect = mapContent.getBoundingClientRect();
  const boxHeight = infoBox.offsetHeight;
  const spaceBelow = window.innerHeight - iconRect.bottom;
  const spaceAbove = iconRect.top;

  const iconHeight = icon.offsetHeight;
  const relativeTop = iconRect.top - mapRect.top;

  let newTop;
  if (spaceBelow >= boxHeight || spaceBelow > spaceAbove) {
    infoBox.classList.add('below');
    newTop = relativeTop + iconHeight + 10;
  } else {
    infoBox.classList.add('above');
    newTop = relativeTop - boxHeight - 10;
  }

  infoBox.style.top = `${newTop}px`;

  // Force background rendering in both states
  infoBox.style.backgroundColor = 'white';
  infoBox.style.visibility = 'visible';
  infoBox.style.zIndex = '10000';
  infoBox.style.position = 'absolute';
  infoBox.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
  infoBox.style.padding = '1em';
  infoBox.style.border = '1px solid #ccc';
  infoBox.style.borderRadius = '6px';
}