/* LIBELAMEDIA — Gallery: filtro por categoría, vídeos que sólo se cargan y reproducen
   cuando están en pantalla (y nunca con "reducir movimiento"), y visor a pantalla completa. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // vídeos: carga perezosa + play/pause según visibilidad
  var vids = document.querySelectorAll('video[data-src]');
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var v = en.target;
        if (en.isIntersecting) {
          if (!v.src) { v.src = v.dataset.src; }
          var p = v.play(); if (p && p.catch) { p.catch(function () {}); }
        } else if (v.src) { v.pause(); }
      });
    }, { rootMargin: '200px 0px' });
    vids.forEach(function (v) { io.observe(v); });
  }

  // filtro
  var tabs = document.querySelectorAll('.g-tab');
  tabs.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.dataset.filter;
      tabs.forEach(function (x) { var on = x === b; x.classList.toggle('is-active', on); x.setAttribute('aria-pressed', on); });
      document.querySelectorAll('.g-tile').forEach(function (t) { t.hidden = !(f === 'all' || t.dataset.cat === f); });
    });
  });

  // visor
  var dlg = document.querySelector('.p-lightbox');
  if (dlg && dlg.showModal) {
    var img = dlg.querySelector('img');
    document.querySelectorAll('.p-zoom').forEach(function (b) {
      b.addEventListener('click', function () {
        img.src = b.dataset.full; img.alt = b.getAttribute('aria-label') || '';
        dlg.showModal();
      });
    });
    dlg.querySelector('.p-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) { dlg.close(); } });
  }
})();
