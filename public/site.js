/* Saltmarsh Photo Co. : site behaviour. Small, dependency-free, honours prefers-reduced-motion. */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  /* ---------- header state, scroll progress, back-to-top, parallax ---------- */
  var header = $('.site-header'), progress = $('.progress'), toTop = $('.to-top');
  var parallaxEls = $$('[data-parallax]');
  var ticking = false;
  function frame() {
    ticking = false;
    var y = window.scrollY || 0;
    if (header) header.classList.toggle('is-scrolled', y > 40);
    if (progress) { var h = root.scrollHeight - window.innerHeight; progress.style.setProperty('--p', h > 0 ? Math.min(1, y / h) : 0); }
    if (toTop) toTop.classList.toggle('show', y > 900);
    if (!reduce) parallaxEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > window.innerHeight + 100) return;
      var f = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      var c = r.top + r.height / 2 - window.innerHeight / 2;
      el.style.transform = 'translate3d(0,' + (-c * f).toFixed(1) + 'px,0)';
    });
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  frame();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  /* ---------- mobile menu ---------- */
  var burger = $('[data-menu]');
  function setMenu(open) {
    if (!header || !burger) return;
    header.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    d.body.style.overflow = open ? 'hidden' : '';
  }
  if (burger) {
    burger.addEventListener('click', function () { setMenu(!header.classList.contains('menu-open')); });
    $$('.menu-panel a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', function (m) { if (m.matches) setMenu(false); });
  }

  /* ---------- reveals + counters ---------- */
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count')) || 0, dur = 1700, t0 = null;
    var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
    if (reduce) { el.textContent = fmt(target); return; }
    (function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  var revealTargets = $$('.reveal, .reveal-img, [data-count]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        if (e.target.hasAttribute('data-count')) runCount(e.target);
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('in'); if (el.hasAttribute('data-count')) runCount(el); });
  }

  /* ---------- hero slideshow ---------- */
  var slides = $$('.hero-slide'), dots = $$('.dots button'), cur = 0, timer = null, caption = $('[data-slide-caption]');
  function go(i) {
    if (!slides.length) return;
    cur = (i + slides.length) % slides.length;
    slides.forEach(function (s, n) { s.classList.toggle('is-active', n === cur); });
    dots.forEach(function (b, n) { b.classList.remove('is-active'); if (n === cur) { void b.offsetWidth; b.classList.add('is-active'); } b.setAttribute('aria-current', n === cur ? 'true' : 'false'); });
    if (caption) caption.textContent = slides[cur].getAttribute('data-caption') || '';
  }
  function play() { clearInterval(timer); if (!reduce && slides.length > 1) timer = setInterval(function () { go(cur + 1); }, 6000); }
  if (slides.length) {
    dots.forEach(function (b, n) { b.addEventListener('click', function () { go(n); play(); }); });
    d.addEventListener('visibilitychange', function () { if (d.hidden) clearInterval(timer); else play(); });
    go(0); play();
  }

  /* ---------- carousel buttons ---------- */
  $$('[data-carousel]').forEach(function (wrap) {
    var track = $('.carousel', wrap), prev = $('[data-prev]', wrap), next = $('[data-next]', wrap);
    if (!track) return;
    var step = function (dir) { track.scrollBy({ left: dir * (track.firstElementChild.getBoundingClientRect().width + 24), behavior: reduce ? 'auto' : 'smooth' }); };
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });
  });

  /* ---------- portfolio filter ---------- */
  $$('[data-filter-group]').forEach(function (group) {
    var buttons = $$('[data-filter]', group), items = $$('[data-cat]', group);
    var empty = $('[data-empty]', group);
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter'), shown = 0;
        buttons.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        items.forEach(function (li) {
          var show = f === 'all' || li.getAttribute('data-cat') === f;
          li.hidden = !show; if (show) { shown++; li.style.animation = 'none'; void li.offsetWidth; li.style.animation = 'fadeUp .8s var(--ease-out-expo) both'; li.style.animationDelay = Math.min(shown * 45, 400) + 'ms'; }
        });
        if (empty) empty.hidden = shown > 0;
      });
    });
  });

  /* ---------- lightbox ---------- */
  var lb, lbImg, lbTitle, lbMeta, lbCount, lbItems = [], lbIdx = 0, lbReturn = null, touchX = null;
  var icon = function (path) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' + path + '</svg>'; };
  function buildLightbox() {
    lb = d.createElement('div');
    lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Photo viewer');
    lb.innerHTML = '<div class="lb-count"></div>' +
      '<button class="lb-x" type="button" aria-label="Close">' + icon('<path d="M5 5l14 14M19 5L5 19"/>') + '</button>' +
      '<button class="lb-prev" type="button" aria-label="Previous photo">' + icon('<path d="M15 5l-7 7 7 7"/>') + '</button>' +
      '<button class="lb-next" type="button" aria-label="Next photo">' + icon('<path d="M9 5l7 7-7 7"/>') + '</button>' +
      '<figure><img alt=""></figure><div class="lb-bar"><div class="lb-title"></div><div class="lb-meta"></div></div>';
    d.body.appendChild(lb);
    lbImg = $('img', lb); lbTitle = $('.lb-title', lb); lbMeta = $('.lb-meta', lb); lbCount = $('.lb-count', lb);
    $('.lb-x', lb).addEventListener('click', closeLb);
    $('.lb-prev', lb).addEventListener('click', function () { stepLb(-1); });
    $('.lb-next', lb).addEventListener('click', function () { stepLb(1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'FIGURE') closeLb(); });
    lb.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) { if (touchX === null) return; var dx = e.changedTouches[0].clientX - touchX; touchX = null; if (Math.abs(dx) > 50) stepLb(dx < 0 ? 1 : -1); });
    d.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') closeLb(); else if (e.key === 'ArrowRight') stepLb(1); else if (e.key === 'ArrowLeft') stepLb(-1);
      else if (e.key === 'Tab') { var f = $$('button', lb), first = f[0], last = f[f.length - 1]; if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
  }
  function showLb() {
    var a = lbItems[lbIdx];
    lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    lbImg.src = a.href; lbImg.alt = a.getAttribute('data-alt') || '';
    lbTitle.textContent = a.getAttribute('data-title') || '';
    lbMeta.textContent = '';
    var who = a.getAttribute('data-credit'), url = a.getAttribute('data-credit-url');
    if (who) {
      lbMeta.appendChild(d.createTextNode('Photo by '));
      if (url) { var l = d.createElement('a'); l.href = url; l.target = '_blank'; l.rel = 'noopener'; l.textContent = who; lbMeta.appendChild(l); } else lbMeta.appendChild(d.createTextNode(who));
      lbMeta.appendChild(d.createTextNode(' on Unsplash'));
    }
    lbCount.textContent = (lbIdx + 1) + ' / ' + lbItems.length;
    [1, -1].forEach(function (o) { var n = lbItems[(lbIdx + o + lbItems.length) % lbItems.length]; if (n) { var p = new Image(); p.src = n.href; } });
  }
  function openLb(list, i) {
    if (!lb) buildLightbox();
    lbItems = list; lbIdx = i; lbReturn = d.activeElement;
    showLb(); lb.classList.add('open'); d.body.style.overflow = 'hidden'; $('.lb-x', lb).focus();
    var multi = list.length > 1; $('.lb-prev', lb).style.display = $('.lb-next', lb).style.display = multi ? '' : 'none';
  }
  function stepLb(dir) { lbIdx = (lbIdx + dir + lbItems.length) % lbItems.length; showLb(); }
  function closeLb() { lb.classList.remove('open'); d.body.style.overflow = ''; if (lbReturn && lbReturn.focus) lbReturn.focus(); }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-lightbox]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    var scope = a.closest('[data-lightbox-group]') || d;
    var list = $$('a[data-lightbox]', scope).filter(function (x) { return x.offsetParent !== null; });
    openLb(list, Math.max(0, list.indexOf(a)));
  });

  /* ---------- "View" cursor over photos (mouse only) ---------- */
  if (fine && !reduce) {
    var cur2 = d.createElement('div'); cur2.className = 'cursor'; cur2.setAttribute('aria-hidden', 'true'); d.body.appendChild(cur2);
    var cx = -200, cy = -200, tx = -200, ty = -200, raf = null;
    var loop = function () { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cur2.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)'; raf = (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.5) ? requestAnimationFrame(loop) : null; };
    d.addEventListener('mousemove', function (e) { tx = e.clientX; ty = e.clientY; if (!raf) raf = requestAnimationFrame(loop); });
    d.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest('[data-cursor]');
      if (t) { cur2.textContent = t.getAttribute('data-cursor'); cur2.classList.add('on'); t.classList.add('cursor-hide'); } else cur2.classList.remove('on');
    });
    d.addEventListener('mouseleave', function () { cur2.classList.remove('on'); });
  }

  /* ---------- copy buttons ---------- */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy'), label = b.getAttribute('data-label') || b.textContent;
      var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = label; }, 1700); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else { var t = d.createElement('textarea'); t.value = text; d.body.appendChild(t); t.select(); try { d.execCommand('copy'); } catch (x) {} d.body.removeChild(t); done(); }
    });
  });
})();
