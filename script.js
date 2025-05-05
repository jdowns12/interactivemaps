const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

function toggleExpand(event, icon) {
  event.stopPropagation();

  const infoBox = icon.nextElementSibling;
  const isExpanded = icon.classList.contains('expanded');

  const sharedMapClass = Array.from(icon.classList).find(cls =>
    cls.startsWith('map-') && cls.endsWith('-arrows')
  );

  // Close others in the same group
  document.querySelectorAll('.location-icon.expanded').forEach(otherIcon => {
    const otherMapClass = Array.from(otherIcon.classList).find(cls =>
      cls.startsWith('map-') && cls.endsWith('-arrows')
    );
    if (otherIcon !== icon && otherMapClass === sharedMapClass) {
      otherIcon.classList.remove('expanded');
      otherIcon.nextElementSibling.style.display = 'none';
      otherIcon.style.visibility = 'visible';
    }
  });

  if (isExpanded) {
    icon.classList.remove('expanded');
    infoBox.style.display = 'none';

    document.querySelectorAll(`.${sharedMapClass}`).forEach(other => {
      other.style.visibility = 'visible';
    });
  } else {
    icon.classList.add('expanded');
    infoBox.style.display = 'block';

    document.querySelectorAll(`.${sharedMapClass}`).forEach(other => {
      if (other !== icon && !other.classList.contains('expanded')) {
        other.style.visibility = 'hidden';
      }
    });
  }
}

function expandOnlyThisMap(selectedMap) {
  document.querySelectorAll('.map-container').forEach(map => {
    if (map !== selectedMap) map.classList.add('dimmed');
  });
  selectedMap.classList.add('expanded');
  document.body.classList.add('overlay-active');
}

function collapseMap(map) {
  map.classList.remove('expanded');
  document.body.classList.remove('overlay-active');
  document.querySelectorAll('.map-container').forEach(map => {
    map.classList.remove('dimmed');
  });
}

// Clicking outside collapses everything
document.addEventListener('click', function (event) {
  if (!event.target.closest('.location-wrapper')) {
    document.querySelectorAll('.location-icon.expanded').forEach(icon => {
      icon.classList.remove('expanded');
      icon.nextElementSibling.style.display = 'none';
    });
    document.querySelectorAll('.location-icon').forEach(icon => {
      icon.style.visibility = 'visible';
    });
  }

  const expandedMap = document.querySelector('.map-container.expanded');
  if (expandedMap && !expandedMap.contains(event.target)) {
    collapseMap(expandedMap);
  }
});

document.querySelectorAll('.location-wrapper').forEach(wrapper => {
  const icon = wrapper.querySelector('.location-icon');
  const infoBox = wrapper.querySelector('.info-box');

  const getMapGroupClass = el => {
    return Array.from(el.classList).find(cls =>
      cls.startsWith('map-') && cls.endsWith('-arrows')
    );
  };
  const sharedMapClass = getMapGroupClass(icon);

  if (!isTouchDevice) {
    // Hover only if not already locked open
    wrapper.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'block';

        document.querySelectorAll('.location-icon').forEach(other => {
          const otherMapClass = getMapGroupClass(other);
          if (
            other !== icon &&
            otherMapClass === sharedMapClass &&
            !other.classList.contains('expanded')
          ) {
            other.style.visibility = 'hidden';
          }
        });
      }
    });

    wrapper.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';

        document.querySelectorAll('.location-icon').forEach(other => {
          other.style.visibility = 'visible';
        });
      }
    });

    // Add click-to-toggle for desktop
    icon.addEventListener('click', (event) => {
      toggleExpand(event, icon);
    });
  } else {
    // On touch devices, just use tap
    icon.addEventListener('click', (event) => {
      toggleExpand(event, icon);
    });
  }
});