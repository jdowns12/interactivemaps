function toggleExpand(event, icon) {
    event.stopPropagation();
    icon.classList.toggle('expanded');
    icon.nextElementSibling.classList.toggle('expanded');
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