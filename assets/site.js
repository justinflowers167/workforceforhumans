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

  // --- Analytics: PostHog (custom events) + Cloudflare Web Analytics
  // (pageviews, auto-injected by CF Pages at the edge — no snippet here).
  // PostHog free tier covers 1M events/mo; autocapture is OFF so only
  // intentional capture() calls count toward quota. The standard PostHog
  // snippet auto-creates window.posthog and queues capture() calls before
  // the loader script arrives.
  try {
    if (!window.posthog || !window.posthog.__SV) {
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing startSessionRecording stopSessionRecording getSessionId getSessionReplayUrl loaded".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      window.posthog.init('phc_uFTsrhGcJoRPqCRq3KZBrLnXFXCGcZkQ6xj9sD8mcVM5', {
        api_host: 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: true,
        capture_pageleave: true,
        disable_session_recording: true,
        person_profiles: 'identified_only'
      });
    }
  } catch (e) { /* analytics is best-effort; never break the page */ }

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
            '<li><a href="about.html">About the founder</a></li>' +
            '<li><a href="mailto:hello@workforceforhumans.com">Contact</a></li>' +
            '<li><a href="mailto:employers@workforceforhumans.com">Post a Job</a></li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      '<div class="footer-bot">' +
        '<div class="fcopy">&copy; 2025 WorkforceForHumans LLC &middot; Colorado, USA</div>' +
        '<div class="flegal">' +
          '<a href="privacy.html">Privacy</a>' +
          '<a href="terms.html">Terms</a>' +
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

  // --- Phase 12 §B3: floating feedback widget ---
  // Injected on every page by default. Pages can opt out with
  // <body data-feedback="off"> — useful for high-friction surfaces (KB
  // admin, employer dashboard) where the floating button would be noise.
  if (body.dataset.feedback !== 'off') {
    var FB_HOST = 'https://dbomfjqijyrkidptrrfi.supabase.co';
    var fbWrap = document.createElement('div');
    fbWrap.id = 'wfh-fb';
    fbWrap.innerHTML =
      '<button type="button" id="wfh-fb-pill" aria-haspopup="dialog" aria-controls="wfh-fb-modal">' +
        '<span aria-hidden="true">💬</span> Feedback' +
      '</button>' +
      '<div id="wfh-fb-modal" role="dialog" aria-modal="true" aria-labelledby="wfh-fb-title" hidden>' +
        '<div class="wfh-fb-scrim"></div>' +
        '<div class="wfh-fb-card">' +
          '<button type="button" class="wfh-fb-close" aria-label="Close feedback form">&times;</button>' +
          '<h2 id="wfh-fb-title">Tell us what\'s on your mind</h2>' +
          '<p class="wfh-fb-sub">We read every one. No support team in the middle.</p>' +
          '<form id="wfh-fb-form" novalidate>' +
            '<fieldset class="wfh-fb-cats">' +
              '<legend class="sr-only">Category</legend>' +
              '<label><input type="radio" name="category" value="bug"/> 🐛 Bug</label>' +
              '<label><input type="radio" name="category" value="feature-request"/> 💡 Feature</label>' +
              '<label><input type="radio" name="category" value="praise"/> ❤️ Praise</label>' +
              '<label><input type="radio" name="category" value="confusion"/> 🤔 Confusing</label>' +
              '<label><input type="radio" name="category" value="other" checked/> 📝 Other</label>' +
            '</fieldset>' +
            '<label class="wfh-fb-lbl" for="wfh-fb-msg">Your message <span class="wfh-fb-hint">(5–2000 characters)</span></label>' +
            '<textarea id="wfh-fb-msg" name="message" rows="5" minlength="5" maxlength="2000" required placeholder="What\'s broken, missing, or great?"></textarea>' +
            '<label class="wfh-fb-lbl" for="wfh-fb-email">Email <span class="wfh-fb-hint">(optional, only if you want a reply)</span></label>' +
            '<input type="email" id="wfh-fb-email" name="user_email" autocomplete="email" maxlength="200"/>' +
            // Honeypot — hidden from real users via CSS, bots fill it. Server drops silently when set.
            '<input type="text" name="hp" tabindex="-1" autocomplete="off" class="wfh-fb-hp" aria-hidden="true"/>' +
            '<div class="wfh-fb-actions">' +
              '<button type="button" class="wfh-fb-cancel">Cancel</button>' +
              '<button type="submit" class="wfh-fb-submit">Send feedback</button>' +
            '</div>' +
            '<div class="wfh-fb-status" role="status" aria-live="polite"></div>' +
          '</form>' +
        '</div>' +
      '</div>';
    body.appendChild(fbWrap);

    var fbModal = fbWrap.querySelector('#wfh-fb-modal');
    var fbForm = fbWrap.querySelector('#wfh-fb-form');
    var fbStatus = fbWrap.querySelector('.wfh-fb-status');
    var fbPill = fbWrap.querySelector('#wfh-fb-pill');
    var fbScrim = fbWrap.querySelector('.wfh-fb-scrim');
    var fbCloseBtn = fbWrap.querySelector('.wfh-fb-close');
    var fbCancel = fbWrap.querySelector('.wfh-fb-cancel');
    var fbSubmit = fbWrap.querySelector('.wfh-fb-submit');
    var fbMsg = fbWrap.querySelector('#wfh-fb-msg');

    var fbOpen = function () {
      fbModal.hidden = false;
      body.classList.add('wfh-fb-open');
      // Focus the textarea after the modal renders (rAF guarantees layout).
      requestAnimationFrame(function () { fbMsg.focus(); });
    };
    var fbClose = function () {
      fbModal.hidden = true;
      body.classList.remove('wfh-fb-open');
      fbPill.focus({ preventScroll: true });
    };
    fbPill.addEventListener('click', fbOpen);
    fbScrim.addEventListener('click', fbClose);
    fbCloseBtn.addEventListener('click', fbClose);
    fbCancel.addEventListener('click', fbClose);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !fbModal.hidden) fbClose();
    });

    fbForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(fbForm);
      var payload = {
        page_path: location.pathname,
        category: fd.get('category') || 'other',
        message: (fd.get('message') || '').toString().trim(),
        user_email: (fd.get('user_email') || '').toString().trim() || null,
        hp: (fd.get('hp') || '').toString(),
      };
      if (payload.message.length < 5) {
        fbStatus.textContent = 'Please write at least a few words.';
        fbStatus.className = 'wfh-fb-status err';
        return;
      }
      fbSubmit.disabled = true;
      fbStatus.textContent = 'Sending…';
      fbStatus.className = 'wfh-fb-status';
      fetch(FB_HOST + '/functions/v1/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; });
      }).then(function (res) {
        if (res.ok) {
          fbStatus.textContent = 'Thanks — heard you. We read every one.';
          fbStatus.className = 'wfh-fb-status ok';
          // Auto-close after a beat so the user sees the confirmation.
          setTimeout(function () { fbClose(); fbForm.reset(); fbStatus.textContent = ''; fbSubmit.disabled = false; }, 1800);
        } else {
          fbStatus.textContent = (res.body && res.body.error) || 'Could not save. Please try again.';
          fbStatus.className = 'wfh-fb-status err';
          fbSubmit.disabled = false;
        }
      }).catch(function () {
        fbStatus.textContent = 'Network hiccup. Please try again.';
        fbStatus.className = 'wfh-fb-status err';
        fbSubmit.disabled = false;
      });
    });
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
