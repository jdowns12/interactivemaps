document.addEventListener('DOMContentLoaded', function () {
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
    function toggleExpand(event, icon) {
      event.stopPropagation();
  
      const infoBox = icon.nextElementSibling;
      const isExpanded = icon.classList.contains('expanded');
  
      // Determine map group (e.g., "map-one-arrows")
      const sharedMapClass = Array.from(icon.classList).find(cls =>
        cls.startsWith('map-') && cls.endsWith('-arrows')
      );
  
      // Close all other icons from the same map group
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
  
        // Restore visibility to all same-group icons
        document.querySelectorAll(`.${sharedMapClass}`).forEach(other => {
          other.style.visibility = 'visible';
        });
      } else {
        icon.classList.add('expanded');
        infoBox.style.display = 'block';
  
        // Hide other icons in the same group
        document.querySelectorAll(`.${sharedMapClass}`).forEach(other => {
          if (other !== icon && !other.classList.contains('expanded')) {
            other.style.visibility = 'hidden';
          }
        });
      }
    }
  
    function expandOnlyThisMap(selectedMap) {
      const allMaps = document.querySelectorAll('.map-container');
      allMaps.forEach(map => {
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
      const allMaps = document.querySelectorAll('.map-container');
      allMaps.forEach(map => map.classList.remove('dimmed'));
    }
  
    // Collapse map on outside click
    document.addEventListener('click', function (event) {
      const expandedMap = document.querySelector('.map-container.expanded');
      if (expandedMap && !expandedMap.contains(event.target)) {
        collapseMap(expandedMap);
      }
    });
  
    // Set up location wrappers
    document.querySelectorAll('.location-wrapper').forEach(wrapper => {
      const icon = wrapper.querySelector('.location-icon');
      const infoBox = wrapper.querySelector('.info-box');
  
      const getMapGroupClass = el => {
        return Array.from(el.classList).find(cls =>
          cls.startsWith('map-') && cls.endsWith('-arrows')
        );
      };
  
      const sharedMapClass = getMapGroupClass(icon);
  
      // Desktop hover logic only
      if (!isTouchDevice) {
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
      }
  
      // Always enable click/tap for all devices
      icon.addEventListener('click', (event) => {
        toggleExpand(event, icon);
      });
    });
  });