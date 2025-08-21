document.addEventListener('DOMContentLoaded', () => {
  const mapContainers = document.querySelectorAll('.map-container');
  const dimOverlay = document.querySelector('.dim-overlay');
  const imageModalOverlay = document.getElementById('image-modal-overlay');
  const imageModalContent = document.getElementById('image-modal-content');
  const imageModalClose = document.getElementById('image-modal-close');

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const toggledBoxes = new Set();

  mapContainers.forEach(container => {
    container.addEventListener('click', () => {
      const isExpanded = container.classList.contains('expanded');
      mapContainers.forEach(c => c.classList.remove('expanded', 'dimmed'));
      document.body.classList.remove('overlay-active');

      if (!isExpanded) {
        container.classList.add('expanded');
        mapContainers.forEach(c => {
          if (c !== container) c.classList.add('dimmed');
        });
        document.body.classList.add('overlay-active');
      }
    });
  });

  dimOverlay.addEventListener('click', () => {
    mapContainers.forEach(c => c.classList.remove('expanded', 'dimmed'));
    document.body.classList.remove('overlay-active');
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
      } else {
        infoBox.classList.add('visible');
        infoBox.style.pointerEvents = 'auto';
        toggledBoxes.add(infoId);
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

  // 🔁 Esc navigation through layers
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (imageModalOverlay.style.display === 'flex') {
        // Step 1: Close image modal
        imageModalOverlay.style.display = 'none';
        imageModalContent.src = '';
      } else if (document.querySelector('.floating-info-box.visible')) {
        // Step 2: Close topmost visible info box
        const openBoxes = document.querySelectorAll('.floating-info-box.visible');
        const lastOpenBox = openBoxes[openBoxes.length - 1];
        lastOpenBox.classList.remove('visible');
        lastOpenBox.style.pointerEvents = '';
        toggledBoxes.delete(lastOpenBox.id);
      } else if (document.body.classList.contains('overlay-active')) {
        // Step 3: Collapse expanded map
        mapContainers.forEach(c => c.classList.remove('expanded', 'dimmed'));
        document.body.classList.remove('overlay-active');
      }
    }
  });
});
