/* ============================================================
 * site.js — inject shared nav + footer based on body variants
 *
 * Usage: place at the top of <body> (NOT in <head> — requires
 * document.body to exist so it can mutate DOM before any page
 * content or observers attach). No dependencies.
 *
 * Body attributes:
 *   data-nav="marketing" | "member" | "admin" | "employer"  (default: marketing)
 *   data-surface="product"                                   (optional)
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
  // marketing/member render a hamburger + slide-over drawer at ≤768px.
  // admin has only one link which fits on mobile — no burger/drawer rendered.
  var BURGER = '<button class="nav-burger" type="button" aria-label="Menu" ' +
               'aria-expanded="false" aria-controls="nav-drawer"><span></span></button>';

  var SKIP = '<a href="#main" class="skip-link">Skip to main content</a>';

  var NAVS = {
    marketing:
      SKIP +
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
          BURGER +
        '</div>' +
      '</nav>' +
      '<div class="nav-scrim" aria-hidden="true"></div>' +
      '<aside class="nav-drawer" id="nav-drawer" aria-hidden="true" inert>' +
        '<ul class="drawer-links">' +
          '<li><a href="jobs.html" data-match="jobs.html">Find Jobs</a></li>' +
          '<li><a href="learn.html" data-match="learn.html">Level Up</a></li>' +
          '<li><a href="feed.html" data-match="feed.html">Intelligence</a></li>' +
          '<li><a href="kb.html" data-match="kb.html">Resources</a></li>' +
          '<li><a href="resume.html" data-match="resume.html">Resume AI</a></li>' +
          '<li><a href="index.html#employers">For Employers</a></li>' +
        '</ul>' +
        '<div class="drawer-cta">' +
          '<a href="mailto:employers@workforceforhumans.com" class="btn-ghost">Post a Job</a>' +
          '<a href="member.html" class="btn-amber">My Workforce &rarr;</a>' +
        '</div>' +
      '</aside>',

    member:
      SKIP +
      '<nav>' +
        '<div class="nav-inner">' +
          '<a href="index.html" class="nav-logo">Workforce<span class="dot">for</span>Humans</a>' +
          '<ul class="nav-links">' +
            '<li><a href="jobs.html" data-match="jobs.html">Jobs</a></li>' +
            '<li><a href="learn.html" data-match="learn.html">Learn</a></li>' +
            '<li><a href="feed.html" data-match="feed.html">Feed</a></li>' +
            '<li><a href="member.html" data-match="member.html">My Workforce</a></li>' +
          '</ul>' +
          BURGER +
        '</div>' +
      '</nav>' +
      '<div class="nav-scrim" aria-hidden="true"></div>' +
      '<aside class="nav-drawer" id="nav-drawer" aria-hidden="true" inert>' +
        '<ul class="drawer-links">' +
          '<li><a href="jobs.html" data-match="jobs.html">Jobs</a></li>' +
          '<li><a href="learn.html" data-match="learn.html">Learn</a></li>' +
          '<li><a href="feed.html" data-match="feed.html">Feed</a></li>' +
          '<li><a href="member.html" data-match="member.html">My Workforce</a></li>' +
        '</ul>' +
      '</aside>',

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
      '</nav>',

    employer:
      SKIP +
      '<nav>' +
        '<div class="nav-inner">' +
          '<div style="display:flex;align-items:center">' +
            '<a href="index.html" class="nav-logo">Workforce<span class="dot">for</span>Humans</a>' +
            '<span class="nav-badge">Employer</span>' +
          '</div>' +
          '<ul class="nav-links">' +
            '<li><a href="employer.html" data-match="employer.html">My Listings</a></li>' +
            '<li><a href="jobs.html" data-match="jobs.html">View Site</a></li>' +
          '</ul>' +
          BURGER +
        '</div>' +
      '</nav>' +
      '<div class="nav-scrim" aria-hidden="true"></div>' +
      '<aside class="nav-drawer" id="nav-drawer" aria-hidden="true" inert>' +
        '<ul class="drawer-links">' +
          '<li><a href="employer.html" data-match="employer.html">My Listings</a></li>' +
          '<li><a href="jobs.html" data-match="jobs.html">View Site</a></li>' +
        '</ul>' +
      '</aside>'
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
    // Highlight active link in both the bar and the drawer.
    var activeLinks = navHost.querySelectorAll('a[data-match="' + path + '"]');
    for (var i = 0; i < activeLinks.length; i++) activeLinks[i].classList.add('active');

    // Wire up the slide-over drawer (marketing + member variants only).
    // Scroll-lock is CSS-based (body.nav-open) so it stacks cleanly with any
    // page-local modal that sets body.style.overflow inline (e.g. jobs.html).
    var burger = navHost.querySelector('.nav-burger');
    var drawer = navHost.querySelector('.nav-drawer');
    var scrim = navHost.querySelector('.nav-scrim');
    if (burger && drawer && scrim) {
      var openDrawer = function () {
        body.classList.add('nav-open');
        burger.setAttribute('aria-expanded', 'true');
        drawer.setAttribute('aria-hidden', 'false');
        drawer.removeAttribute('inert');
        scrim.setAttribute('aria-hidden', 'false');
        var firstLink = drawer.querySelector('a');
        if (firstLink) firstLink.focus({ preventScroll: true });
      };
      var closeDrawer = function () {
        body.classList.remove('nav-open');
        burger.setAttribute('aria-expanded', 'false');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
        scrim.setAttribute('aria-hidden', 'true');
      };
      burger.addEventListener('click', function () {
        if (body.classList.contains('nav-open')) {
          closeDrawer();
          burger.focus({ preventScroll: true });
        } else {
          openDrawer();
        }
      });
      scrim.addEventListener('click', closeDrawer);
      var drawerLinks = drawer.querySelectorAll('a');
      for (var j = 0; j < drawerLinks.length; j++) {
        drawerLinks[j].addEventListener('click', closeDrawer);
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && body.classList.contains('nav-open')) {
          closeDrawer();
          burger.focus({ preventScroll: true });
        }
      });
    }
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

/* ============================================================
 * SEO HEAD TEMPLATE — copy into each indexable page's <head>
 *
 * This is documentation, not executable. site.js runs at the top
 * of <body> and cannot mutate <head> safely (crawlers like LinkedIn
 * and Slack preview bots don't run JS). So each indexable page
 * carries its own head block — but the shape is canonical here.
 *
 * Replace {TITLE}, {DESCRIPTION}, {PATH} (e.g. "/jobs.html" or "/"
 * for index) for each page. og:image + favicon paths stay as-is.
 * ------------------------------------------------------------
 *
 *   <title>{TITLE}</title>
 *   <meta name="description" content="{DESCRIPTION}"/>
 *   <link rel="canonical" href="https://workforceforhumans.com{PATH}"/>
 *   <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg"/>
 *   <meta name="theme-color" content="#0f1829"/>
 *
 *   <meta property="og:type" content="website"/>
 *   <meta property="og:site_name" content="Workforce for Humans"/>
 *   <meta property="og:title" content="{TITLE}"/>
 *   <meta property="og:description" content="{DESCRIPTION}"/>
 *   <meta property="og:url" content="https://workforceforhumans.com{PATH}"/>
 *   <meta property="og:image" content="https://workforceforhumans.com/assets/og-default.svg"/>
 *   <meta property="og:image:width" content="1200"/>
 *   <meta property="og:image:height" content="630"/>
 *
 *   <meta name="twitter:card" content="summary_large_image"/>
 *   <meta name="twitter:title" content="{TITLE}"/>
 *   <meta name="twitter:description" content="{DESCRIPTION}"/>
 *   <meta name="twitter:image" content="https://workforceforhumans.com/assets/og-default.svg"/>
 *
 * For gated / transactional pages (resume, member, employer,
 * kb-admin, success, cancel), use ONLY:
 *   <meta name="robots" content="noindex, nofollow"/>
 * ============================================================ */
