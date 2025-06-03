document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.querySelector('.image-overlay');
    const overlayImage = overlay.querySelector('img');
  
    document.body.addEventListener('click', function (e) {
      if (e.target.matches('.floating-info-box img')) {
        const src = e.target.src;
        overlayImage.src = src;
        overlay.classList.add('visible');
      } else if (e.target === overlay || e.target === overlayImage) {
        overlay.classList.remove('visible');
      }
    });
  });