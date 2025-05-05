function toggleExpand(event, icon) {
    event.stopPropagation();
  
    const infoBox = icon.nextElementSibling;
    const isExpanded = icon.classList.contains('expanded');
  
    // Close all other icons
    document.querySelectorAll('.location-icon.expanded').forEach(otherIcon => {
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
  
  document.addEventListener('click', function(event) {
    const expandedMap = document.querySelector('.map-container.expanded');
    if (expandedMap && !expandedMap.contains(event.target)) {
      collapseMap(expandedMap);
    }
  });
  
  document.querySelectorAll('.location-wrapper').forEach(wrapper => {
    const icon = wrapper.querySelector('.location-icon');
    const infoBox = wrapper.querySelector('.info-box');
  
    wrapper.addEventListener('mouseenter', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'block';
      }
  
      // Find all icons that share the same map group (e.g., map-one-arrows)
      const sharedMapClass = Array.from(icon.classList).find(cls => cls.startsWith('map-') && cls.endsWith('-arrows'));
  
      document.querySelectorAll('.location-icon').forEach(other => {
        const otherMapClass = Array.from(other.classList).find(cls => cls.startsWith('map-') && cls.endsWith('-arrows'));
        
        if (
          other !== icon &&
          otherMapClass === sharedMapClass &&
          !other.classList.contains('expanded')
        ) {
          other.style.visibility = 'hidden';
        }
      });
    });
  
    wrapper.addEventListener('mouseleave', () => {
      if (!icon.classList.contains('expanded')) {
        infoBox.style.display = 'none';
  
        // Re-show all icons (safe fallback)
        document.querySelectorAll('.location-icon').forEach(other => {
          other.style.visibility = 'visible';
        });
      }
    });
  });
      
