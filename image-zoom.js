// Legacy lightbox for .floating-info-box images (kept for old pages).
// The current location sheet uses #image-modal-overlay via script.js.
document.addEventListener('DOMContentLoaded', function () {
  const overlay = document.querySelector('.image-overlay');
  if (!overlay) return;
  const overlayImage = overlay.querySelector('img');
  if (!overlayImage) return;

  document.body.addEventListener('click', function (e) {
    if (e.target.matches('.floating-info-box img')) {
      overlayImage.src = e.target.src;
      overlay.classList.add('visible');
    } else if (e.target === overlay || e.target === overlayImage) {
      overlay.classList.remove('visible');
      overlayImage.src = '';
    }
  });
});
