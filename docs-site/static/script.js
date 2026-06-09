/* manymems docs — sidebar toggle and active-page highlight */
(function () {
  'use strict';

  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      toggle.setAttribute('aria-expanded', sidebar.classList.contains('open'));
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', function (e) {
      if (
        sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        e.target !== toggle &&
        !toggle.contains(e.target)
      ) {
        sidebar.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Scroll active nav link into view in the sidebar
  var activeLink = document.querySelector('.nav-link.active');
  if (activeLink && sidebar) {
    // Give the browser a tick to paint before scrolling
    requestAnimationFrame(function () {
      var linkTop = activeLink.offsetTop;
      var sidebarHeight = sidebar.clientHeight;
      if (linkTop > sidebarHeight * 0.6) {
        sidebar.scrollTop = linkTop - sidebarHeight * 0.3;
      }
    });
  }
})();
