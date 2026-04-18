/* ============================================================
 * site.js — inject shared nav + footer based on body variants
 *
 * Usage: place at the top of <body> (NOT in <head> — requires
 * document.body to exist so it can mutate DOM before any page
 * content or observers attach). No dependencies.
 *
 * Body attributes:
 *   data-nav="marketing" | "member" | "admin"  (default: marketing)
 *   data-surface="product"                      (optional)
 * ============================================================ */
(function () {
  var body = document.body;
  var variant = (body && body.dataset.nav) || 'marketing';

  // --- Active link detection ---
  // Normalize pathname to a page filename; "/" → "index.html".
  var path = location.pathname.split('/').pop() || 'index.html';
  if (path.indexOf('.html') === -1 && path.indexOf('.') === -1) {
    path = path ? path + '.html' : 'index.html';
  }

  // --- Nav templates ---
  var NAVS = {
    marketing:
      '<nav>' +
        '<div class="nav-inner">' +
          '<a href="index.html" class="nav-logo">Workforce<span class="dot">for</span>Humans</a>' +
          '<ul class="nav-links">' +
            '<li><a href="jobs.html" data-match="jobs.html">Find Jobs</a></li>' +
            '<li><a href="learn.html" data-match="learn.html">Level Up</a></li>' +
            '<li><a href="feed.html" data-match="feed.html">Intelligence</a></li>' +
            '<li><a href="kb.html" data-match="kb.html">Resources</a></li>' +
            '<li><a href="resume.html" data-match="resume.html">Resume AI</a></li>' +
            '<li><a href="index.html#employers">For Employers</a></li>' +
          '</ul>' +
          '<div class="nav-actions">' +
            '<a href="mailto:employers@workforceforhumans.com" class="btn-ghost">Post a Job</a>' +
            '<a href="member.html" class="btn-amber">My Workforce &rarr;</a>' +
          '</div>' +
        '</div>' +
      '</nav>',

    member:
      '<nav>' +
        '<div class="nav-inner">' +
          '<a href="index.html" class="nav-logo">Workforce<span class="dot">for</span>Humans</a>' +
          '<ul class="nav-links">' +
            '<li><a href="jobs.html" data-match="jobs.html">Jobs</a></li>' +
            '<li><a href="learn.html" data-match="learn.html">Learn</a></li>' +
            '<li><a href="feed.html" data-match="feed.html">Feed</a></li>' +
            '<li><a href="member.html" data-match="member.html">My Workforce</a></li>' +
          '</ul>' +
        '</div>' +
      '</nav>',

    admin:
      '<nav>' +
        '<div class="nav-inner">' +
          '<div style="display:flex;align-items:center">' +
            '<a href="index.html" class="nav-logo">Workforce<span class="dot">for</span>Humans</a>' +
            '<span class="nav-badge">KB Admin</span>' +
          '</div>' +
          '<div class="nav-right">' +
            '<a href="kb.html">&larr; View Knowledge Base</a>' +
          '</div>' +
        '</div>' +
      '</nav>'
  };

  // --- Footer template (shared marketing + member; admin uses minimal). ---
  var FOOTER_FULL =
    '<footer>' +
      '<div class="footer-grid">' +
        '<div>' +
          '<div class="fb">Workforce<span class="dot">for</span>Humans</div>' +
          '<p class="fd">The platform for displaced workers, career changers, and anyone building their next chapter. Find Work. Level Up. Move Forward.</p>' +
          '<div class="fsoc">' +
            '<a href="mailto:hello@workforceforhumans.com" title="Email us">&#9993;</a>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="fc-title">Find Work</div>' +
          '<ul class="fc-links">' +
            '<li><a href="jobs.html">Browse Jobs</a></li>' +
            '<li><a href="jobs.html?q=entry">Entry Level</a></li>' +
            '<li><a href="jobs.html?state=remote">Remote Jobs</a></li>' +
            '<li><a href="jobs.html?q=50%2B+friendly">50+ Friendly</a></li>' +
            '<li><a href="jobs.html?q=apprenticeship">Apprenticeships</a></li>' +
          '</ul>' +
        '</div>' +
        '<div>' +
          '<div class="fc-title">Level Up</div>' +
          '<ul class="fc-links">' +
            '<li><a href="learn.html">Learning Paths</a></li>' +
            '<li><a href="learn.html#healthcare">Healthcare</a></li>' +
            '<li><a href="learn.html#tech">Technology</a></li>' +
            '<li><a href="learn.html#trades">Skilled Trades</a></li>' +
            '<li><a href="learn.html#coaching">Career Coaching</a></li>' +
          '</ul>' +
        '</div>' +
        '<div>' +
          '<div class="fc-title">Resources</div>' +
          '<ul class="fc-links">' +
            '<li><a href="kb.html">Knowledge Base</a></li>' +
            '<li><a href="feed.html">Intelligence Feed</a></li>' +
            '<li><a href="index.html#employers">For Employers</a></li>' +
            '<li><a href="mailto:hello@workforceforhumans.com">Contact</a></li>' +
            '<li><a href="mailto:employers@workforceforhumans.com">Post a Job</a></li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="footer-bot">' +
        '<div class="fcopy">&copy; 2025 WorkforceForHumans LLC &middot; Colorado, USA</div>' +
        '<div class="flegal">' +
          '<a href="mailto:privacy@workforceforhumans.com">Privacy</a>' +
          '<a href="mailto:legal@workforceforhumans.com">Terms</a>' +
          '<a href="mailto:access@workforceforhumans.com">Accessibility</a>' +
        '</div>' +
      '</div>' +
    '</footer>';

  var FOOTER_ADMIN =
    '<footer>' +
      '<div class="footer-bot">' +
        '<div class="fcopy">&copy; 2025 WorkforceForHumans LLC &middot; KB Admin</div>' +
      '</div>' +
    '</footer>';

  // --- Inject ---
  var navHost = document.getElementById('site-nav');
  if (navHost) {
    navHost.innerHTML = NAVS[variant] || NAVS.marketing;
    var active = navHost.querySelector('a[data-match="' + path + '"]');
    if (active) active.classList.add('active');
  }

  var footHost = document.getElementById('site-footer');
  if (footHost) {
    if (variant === 'admin') {
      footHost.classList.add('admin');
      footHost.innerHTML = FOOTER_ADMIN;
    } else {
      footHost.innerHTML = FOOTER_FULL;
    }
  }
})();
