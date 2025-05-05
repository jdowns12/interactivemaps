document.addEventListener("DOMContentLoaded", () => {
  // MAP EXPAND/COLLAPSE
  document.querySelectorAll('.map-container').forEach(map => {
    map.addEventListener('click', () => {
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

  // ICON INTERACTION
  document.querySelectorAll('.location-wrapper').forEach(wrapper => {
    const icon = wrapper.querySelector('.location-icon');
    const infoBox = wrapper.querySelector('.info-box');

    const mapGroup = Array.from(icon.classList).find(cls => cls.startsWith('map-') && cls.endsWith('-arrows'));

    // DESKTOP: hover interaction
    wrapper.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'block';
      }

      hideOtherIcons(icon, mapGroup);
    });

    wrapper.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';
        restoreIcons();
      }
    });

    // MOBILE & desktop: click to expand
    icon.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleExpand(icon);
    });
  });

  // COLLAPSE when clicking outside
  document.addEventListener('click', function(event) {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (expandedMap && !expandedMap.contains(event.target)) {
      collapseMap(expandedMap);
    }
  });
});

// LOGIC FUNCTIONS

function toggleExpand(icon) {
  const infoBox = icon.nextElementSibling;
  const isExpanded = icon.classList.contains('expanded');

  const mapGroup = Array.from(icon.classList).find(cls => cls.startsWith('map-') && cls.endsWith('-arrows'));

  // Collapse all in same group
  document.querySelectorAll('.location-icon.' + mapGroup).forEach(otherIcon => {
    if (otherIcon !== icon) {
      otherIcon.classList.remove('expanded');
      otherIcon.nextElementSibling.style.display = 'none';
    }
  });

  if (isExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';
  } else {
    icon.classList.add('expanded');
    infoBox.style.display = 'block';
  }
}

function hideOtherIcons(activeIcon, mapGroup) {
  document.querySelectorAll('.location-icon.' + mapGroup).forEach(icon => {
    if (icon !== activeIcon && !icon.classList.contains('expanded')) {
      icon.style.visibility = 'hidden';
    }
  });
}

function restoreIcons() {
  document.querySelectorAll('.location-icon').forEach(icon => {
    icon.style.visibility = 'visible';
  });
}

function expandOnlyThisMap(selectedMap) {
  document.querySelectorAll('.map-container').forEach(map => {
    if (map !== selectedMap) {
      map.classList.add('dimmed');
    }
  });
  selectedMap.classList.add('expanded');
  document.body.classList.add('overlay-active');
}

function collapseMap(map) {
  map.classList.remove('expanded');
  document.body.classList.remove('overlay-active');
  document.querySelectorAll('.map-container').forEach(m => m.classList.remove('dimmed'));
}