/* EBM Countertop Tracker - field portal (Phase G3).
 * A small single-page app: screens are built with DOM calls (never innerHTML with data),
 * routes live in the URL hash so the back button works.
 */
(function () {
  'use strict';
  var api = window.EBM_API, cam = window.EBM_CAMERA;
  var app = document.getElementById('app');
  var cleanup = null;              // stops camera/GPS when leaving a screen
  var profile = null;

  // ------------------------------------------------------------------ helpers
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  /** Append any number of children (nodes, text, arrays; null/false are skipped). */
  function add(el) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); continue; }
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
  }
  function show(nodes) {
    app.textContent = '';
    add(app, nodes);
    var focus = app.querySelector('h1');
    if (focus) { focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  var dtf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  var df = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric' });
  function when(iso) { return iso ? dtf.format(new Date(iso)) : ''; }
  function day(iso) { return iso ? df.format(new Date(iso)) : ''; }
  function metres(m) { return m === null || m === undefined ? '' : m >= 1000 ? (Math.round(m / 100) / 10) + ' km' : Math.round(m) + ' m'; }
  var ROLE = { order_booker: 'Order booker', supervisor: 'Supervisor', mo: 'MO', tsm: 'TSM', asm: 'ASM', amtm: 'AMTM', rsm: 'RSM' };
  var LEVEL_CLASS = { normal: 'lv-normal', overdue: 'lv-overdue', high_priority: 'lv-high', critical: 'lv-critical', not_live: 'lv-muted', not_monitored: 'lv-muted' };

  function msg(kind, text, testid) { return h('p', { class: 'msg msg-' + kind, role: kind === 'error' ? 'alert' : 'status', 'data-testid': testid }, text); }
  function button(label, onclick, cls, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn ' + (cls || ''), onclick: onclick }, extra || {}), label);
  }
  /** A button that runs an async action once at a time and shows progress. */
  function actionButton(label, busyLabel, run, cls) {
    var b = button(label, function () {
      if (b.disabled) return;
      b.disabled = true; b.textContent = busyLabel;
      Promise.resolve(run()).finally(function () { if (b.isConnected) { b.disabled = false; b.textContent = label; } });
    }, cls);
    return b;
  }

  /** Handles the answers every screen treats the same way. Returns true if handled. */
  function common(res) {
    if (res.ok) return false;
    if (res.code === 401) {
      try { sessionStorage.setItem('ebm.returnTo', location.hash); } catch (e) { /* ignore */ }
      showLogin('You have been signed out. Sign in again: an unfinished visit will be waiting.');
      return true;
    }
    if (res.code === 428) { go('#/password'); return true; }
    return false;
  }
  function loadFailed(res, retry) {
    if (common(res)) return;
    frame([h('h1', { text: res.network ? 'Cannot reach the system' : 'Something went wrong' }),
      msg('error', res.error, 'load-error'), button('Try again', retry, 'btn-primary btn-block')], null);
  }

  // ------------------------------------------------------------------ frame
  function frame(content, tab, opts) {
    opts = opts || {};
    var top = h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner' },
      h('div', null, h('div', { class: 'who', text: profile ? profile.name : 'EBM Countertop' }),
        profile ? h('div', { class: 'role', text: profile.designationName + (profile.territory ? ', ' + profile.territory + ' territory' : '') + ' · ' + profile.code }) : null),
      profile ? button('Sign out', signOut, 'btn-ghost', { 'data-testid': 'sign-out' }) : null));
    var tabs = opts.noTabs || !profile || profile.isAdmin ? null : h('nav', { class: 'tabbar', 'aria-label': 'Main' }, h('ul', null,
      tabItem('#/home', 'Home', tab === 'home', 'M3 11l9-8 9 8v10h-6v-6H9v6H3z'),
      tabItem('#/outlets', 'Outlets', tab === 'outlets', 'M4 4h16l1 5H3zm1 6h14v10H5zm4 3v7h6v-7z'),
      tabItem('#/visits', 'My visits', tab === 'visits', 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v5.4l4 2.4-1 1.7-5-3V7z'),
      profile.seesTeamVisits ? tabItem('#/team', 'Team visits', tab === 'team', 'M9 11a4 4 0 110-8 4 4 0 010 8zm8 0a3 3 0 110-6 3 3 0 010 6zM1 20c0-3.3 3.6-6 8-6s8 2.7 8 6v1H1zm16.5-6c3 .3 5.5 2.3 5.5 5v2h-4v-1c0-2.4-.6-4.4-1.5-6z') : null));
    if (tabs && profile.seesTeamVisits) tabs.classList.add('tabbar-4');
    show([top, h('main', { class: 'page' + (opts.noTabs ? ' page-flow' : '') }, content), tabs]);
  }
  function tabItem(href, label, current, d) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); svg.appendChild(p);
    return h('li', null, h('a', { href: href, 'aria-current': current ? 'page' : null }, svg, h('span', { text: label })));
  }
  function signOut() {
    api.call('logout', {}).then(function () { api.setToken(''); profile = null; showLogin('You have signed out.'); });
  }

  // ------------------------------------------------------------------ sign in
  function showLogin(notice) {
    if (location.hash !== '#/login') history.replaceState(null, '', '#/login');
    profile = null;
    var code = h('input', { id: 'code', name: 'code', class: 'input', autocomplete: 'username', autocapitalize: 'characters', spellcheck: 'false', required: true });
    var pw = h('input', { id: 'password', name: 'password', type: 'password', class: 'input', autocomplete: 'current-password', required: true });
    var toggle = button('Show', function () { var s = pw.type === 'password'; pw.type = s ? 'text' : 'password'; toggle.textContent = s ? 'Hide' : 'Show'; toggle.setAttribute('aria-pressed', String(s)); }, 'btn-inline', { 'aria-pressed': 'false', 'aria-controls': 'password' });
    var out = h('div', { 'aria-live': 'polite' });
    var submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-lg' }, 'Sign in');
    var form = h('form', { class: 'stack-lg', novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      out.textContent = '';
      if (!code.value.trim() || !pw.value) { add(out, msg('error', 'Enter your employee code and password.')); return; }
      submit.disabled = true; submit.textContent = 'Signing in…';
      api.call('login', { code: code.value.trim(), password: pw.value, userAgent: navigator.userAgent.slice(0, 200) }).then(function (res) {
        submit.disabled = false; submit.textContent = 'Sign in';
        if (!res.ok) { add(out, msg('error', res.error, 'login-error')); return; }
        api.setToken(res.data.token);
        profile = res.data.profile;
        var back = ''; try { back = sessionStorage.getItem('ebm.returnTo') || ''; sessionStorage.removeItem('ebm.returnTo'); } catch (e) { /* ignore */ }
        go(res.data.mustChangePassword ? '#/password' : (back && back !== '#/login' ? back : (profile.isAdmin ? '#/admin/dashboard' : '#/home')));
      });
    } },
      h('div', { class: 'field' }, h('label', { for: 'code', text: 'Employee code' }), code),
      h('div', { class: 'field' }, h('label', { for: 'password', text: 'Password' }), h('div', { class: 'input-row' }, pw, toggle)),
      out, submit);
    show(h('main', { class: 'page-plain' }, h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '', width: 56, height: 56 }),
      h('div', null, h('h1', { text: 'EBM Countertop Tracker' }), h('p', { class: 'quiet', text: 'Sign in with your own employee code.' }))),
      notice ? msg('info', notice, 'login-notice') : null, form,
      h('p', { class: 'quiet small center', text: 'Forgot your password? Ask your administrator to reset it.' })));
    code.focus();
  }

  function showPassword() {
    var cur = h('input', { id: 'cur', type: 'password', class: 'input', autocomplete: 'current-password' });
    var nw = h('input', { id: 'new', type: 'password', class: 'input', autocomplete: 'new-password', 'aria-describedby': 'rules' });
    var rep = h('input', { id: 'rep', type: 'password', class: 'input', autocomplete: 'new-password' });
    var out = h('div', { 'aria-live': 'polite' });
    var submit = h('button', { type: 'submit', class: 'btn btn-primary btn-block btn-lg' }, 'Save new password');
    var form = h('form', { class: 'stack-lg', novalidate: true, onsubmit: function (e) {
      e.preventDefault(); out.textContent = '';
      if (nw.value !== rep.value) { add(out, msg('error', 'The two new passwords are not the same.')); return; }
      submit.disabled = true;
      api.call('changePassword', { currentPassword: cur.value, newPassword: nw.value }).then(function (res) {
        submit.disabled = false;
        if (common(res)) return;
        if (!res.ok) { add(out, msg('error', res.error, 'password-error')); return; }
        if (profile) profile.mustChangePassword = false;
        go(profile && profile.isAdmin ? '#/admin/dashboard' : '#/home');
      });
    } },
      h('div', { class: 'field' }, h('label', { for: 'cur', text: 'Current (temporary) password' }), cur),
      h('div', { class: 'field' }, h('label', { for: 'new', text: 'New password' }), nw,
        h('p', { id: 'rules', class: 'hint', text: 'At least 8 characters, with letters and numbers. Not your employee code.' })),
      h('div', { class: 'field' }, h('label', { for: 'rep', text: 'New password again' }), rep),
      out, submit);
    show(h('main', { class: 'page-plain' }, h('h1', { text: 'Choose your own password' }),
      h('p', { class: 'quiet', text: 'Your administrator gave you a temporary password. Choose one only you know.' }), form));
    cur.focus();
  }

  // ------------------------------------------------------------------ home
  function levelBadge(level, text, days) {
    return h('span', { class: 'badge ' + (LEVEL_CLASS[level] || 'lv-muted') }, days === null || days === undefined ? text : days + (days === 1 ? ' day' : ' days') + ' · ' + text);
  }
  function responsibleLine(list) {
    var order = ['order_booker', 'supervisor', 'tsm', 'asm', 'mo', 'amtm', 'rsm'];
    return (list || []).slice().sort(function (a, b) { return order.indexOf(a.role) - order.indexOf(b.role); })
      .map(function (r) { return (ROLE[r.role] || r.role) + ': ' + r.name; }).join(' · ');
  }
  function showHome() {
    api.call('home').then(function (res) {
      if (!res.ok) { loadFailed(res, showHome); return; }
      var d = res.data; profile = d.profile;
      if (profile.isAdmin) { go('#/admin/dashboard'); return; }
      var parts = [h('h1', { text: 'Assalam-o-Alaikum, ' + profile.name })];
      if (d.openVisit) {
        parts.push(h('section', { class: 'card card-info', 'data-testid': 'open-visit' },
          h('h2', { text: 'Unfinished visit' }), h('p', { text: d.openVisit.outletName + ': ' + d.openVisit.statusText }),
          button('Continue visit', function () { go('#/visit/' + d.openVisit.id); }, 'btn-primary btn-block')));
      }
      if (!d.live) parts.push(msg('info', 'Monitoring has not started yet. Your visits are still recorded.', 'not-live'));
      var c = d.counts;
      parts.push(h('div', { class: 'chips', 'data-testid': 'counts' },
        chip(c.outlets, 'outlets', 'lv-muted'), chip(c.overdue, 'overdue', 'lv-overdue'), chip(c.high_priority, 'high priority', 'lv-high'), chip(c.critical, 'critical', 'lv-critical')));
      if (d.alerts.length) {
        parts.push(h('section', { class: 'stack', 'aria-labelledby': 'alerts-h', 'data-testid': 'alerts' },
          h('h2', { id: 'alerts-h', text: 'Outlets needing a visit (' + d.alerts.length + ')' }),
          d.alerts.map(alertCard)));
      } else if (d.live) {
        parts.push(h('section', { class: 'card card-ok', 'data-testid': 'all-clear' }, h('h2', { text: 'All your outlets are on track' }),
          h('p', { class: 'quiet', text: 'Every outlet had a verified visit in the last ' + (d.thresholds.overdue - 1) + ' days.' })));
      }
      parts.push(button('See all my outlets', function () { go('#/outlets'); }, 'btn-secondary btn-block'));
      frame(parts, 'home');
    });
  }
  function chip(n, label, cls) { return h('span', { class: 'chip ' + cls }, h('b', { class: 'num', text: String(n) }), ' ' + label); }
  function alertCard(a) {
    return h('a', { class: 'card alert-card ' + LEVEL_CLASS[a.level], href: '#/outlet/' + encodeURIComponent(a.id), 'data-testid': 'alert' },
      h('div', { class: 'alert-days' }, h('b', { class: 'num', text: String(a.days) }), h('span', { text: a.days === 1 ? 'day' : 'days' })),
      h('div', { class: 'alert-body' },
        h('div', { class: 'alert-top' }, h('strong', { text: a.name }), levelBadge(a.level, a.levelText)),
        h('div', { class: 'small quiet', text: (a.code ? a.code + ', ' : '') + a.territory + ' territory' }),
        h('div', { class: 'small', text: a.lastVisitAt ? 'Last verified visit ' + day(a.lastVisitAt) + (a.lastVisitBy ? ', ' + a.lastVisitBy : '') : 'No verified visit since monitoring started' }),
        h('div', { class: 'small quiet', text: responsibleLine(a.responsible) })));
  }
  // ------------------------------------------------------------------ outlets
  function showOutlets() {
    api.call('outlets').then(function (res) {
      if (!res.ok) { loadFailed(res, showOutlets); return; }
      var all = res.data.outlets;
      var list = h('ul', { class: 'list', 'data-testid': 'outlet-list' });
      var search = h('input', { id: 'q', type: 'search', class: 'input', placeholder: 'Name or code', autocomplete: 'off', oninput: draw });
      function draw() {
        var q = search.value.trim().toLowerCase();
        list.textContent = '';
        var shown = all.filter(function (o) { return !q || o.name.toLowerCase().indexOf(q) >= 0 || (o.code || '').toLowerCase().indexOf(q) >= 0; });
        if (!shown.length) add(list, h('li', { class: 'empty', text: q ? 'No outlet matches "' + search.value.trim() + '".' : 'No outlets are assigned to you yet. Ask your administrator.' }));
        shown.forEach(function (o) {
          add(list, h('li', null, h('a', { class: 'row', href: '#/outlet/' + encodeURIComponent(o.id) },
            h('div', { class: 'row-main' }, h('strong', { text: o.name }), h('span', { class: 'small quiet', text: (o.code ? o.code + ' · ' : '') + o.territory })),
            o.monitored ? levelBadge(o.level, o.levelText, o.days) : o.demo ? h('span', { class: 'badge badge-demo', text: 'DEMO' }) : h('span', { class: 'badge lv-muted', text: 'Not monitored' }))));
        });
      }
      draw();
      frame([h('h1', { text: 'My outlets' }), h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
        h('p', { class: 'small quiet', text: all.length + ' outlets, longest without a verified visit first.' }), list], 'outlets');
    });
  }

  function showOutlet(id) {
    api.call('outlet', { outletId: id }).then(function (res) {
      if (!res.ok) { if (res.code === 404) { frame([h('h1', { text: 'Outlet not found' }), msg('error', 'This outlet is not in your list.'), h('a', { href: '#/outlets', text: 'Back to my outlets' })], 'outlets'); return; } loadFailed(res, function () { showOutlet(id); }); return; }
      var o = res.data.outlet;
      var status = h('section', { class: 'card status ' + (LEVEL_CLASS[o.level] || ''), 'data-testid': 'outlet-status' },
        h('div', { class: 'big-days' }, h('b', { class: 'num', text: o.days === null ? '–' : String(o.days) }), h('span', { text: 'days' })),
        h('div', null, h('strong', { text: o.levelText }),
          h('p', { class: 'small', text: o.lastVisitAt ? 'Last verified visit ' + day(o.lastVisitAt) + (o.lastVisitBy ? ', ' + o.lastVisitBy : '') : 'No verified visit yet' })));
      var startArea = h('div', { class: 'stack' });
      if (o.demo) add(startArea, msg('info', 'DEMO outlet: your distance from the registered point is checked and shown, but the 50 m limit is not enforced. Demo visits never count on the dashboard or in reports.'));
      if (!o.monitored && !o.demo) add(startArea, msg('info', 'This outlet is not active with a deployed countertop, so no visit can be recorded.'));
      else if (o.myOpenVisitId) add(startArea, button('Continue visit', function () { go('#/visit/' + o.myOpenVisitId); }, 'btn-primary btn-block btn-lg'));
      else add(startArea, startButton(o, startArea));
      var ct = { present: 'Present', missing: 'Missing', unclear: 'Photo unclear', pending: 'Waiting for admin check', not_checked: 'Not checked yet' };
      var pg = { correct: 'Correct', incorrect: 'Incorrect', unclear: 'Photo unclear', not_applicable: 'Not applicable', pending: 'Waiting for admin check', not_checked: 'Not checked yet' };
      frame([h('a', { class: 'back', href: '#/outlets', text: 'Back to outlets' }),
        h('div', null, h('h1', { text: o.name }), h('p', { class: 'quiet', text: (o.code ? o.code + ', ' : '') + o.territory })),
        status, startArea,
        h('section', { class: 'card' }, h('h2', { text: 'Last countertop check' }), h('dl', { class: 'kv' },
          h('dt', { text: 'Countertop' }), h('dd', { text: ct[o.countertop] || o.countertop }),
          h('dt', { text: 'Planogram' }), h('dd', { text: pg[o.planogram] || o.planogram }),
          o.visitsAwaitingReview ? [h('dt', { text: 'Review' }), h('dd', { text: o.visitsAwaitingReview + (o.visitsAwaitingReview === 1 ? ' visit' : ' visits') + ' waiting for location review' })] : null)),
        h('section', { class: 'card' }, h('h2', { text: 'Location' }),
          h('p', { class: 'small', text: 'Registered point ' + o.lat + ', ' + o.lon + (o.demo ? '. Demo outlet: the distance is shown but the ' + o.radiusM + ' m limit is not enforced.' : '. Your phone must be within ' + o.radiusM + ' m when you take the shop-front photo.') }),
          h('a', { class: 'btn btn-secondary btn-block', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.lat + ',' + o.lon), target: '_blank', rel: 'noopener noreferrer', text: 'Open in Google Maps' })),
        h('section', { class: 'card' }, h('h2', { text: 'Responsible' }), h('dl', { class: 'kv' },
          o.responsible.map(function (r) { return [h('dt', { text: ROLE[r.role] || r.role }), h('dd', { text: r.name })]; }))),
        o.recentVisits.length ? h('section', { class: 'card' }, h('h2', { text: 'Recent visits' }), h('ul', { class: 'plain' },
          o.recentVisits.map(function (v) { return h('li', { class: 'small' }, h('b', { text: when(v.at) }), ' ' + v.by + ': ' + v.statusText); }))) : null
      ], 'outlets');
    });
  }
  function startButton(o, area) {
    var key = 'ebm.start.' + o.id, cid;
    try { cid = sessionStorage.getItem(key); } catch (e) { cid = null; }
    if (!cid) { cid = api.uuid(); try { sessionStorage.setItem(key, cid); } catch (e) { /* ignore */ } }
    var err = h('div');
    return [actionButton('Start visit', 'Starting…', function () {
      err.textContent = '';
      return api.call('startVisit', { outletId: o.id, clientVisitId: cid, userAgent: navigator.userAgent.slice(0, 200) }).then(function (res) {
        if (common(res)) return;
        if (!res.ok) { add(err, msg('error', res.error, 'start-error')); return; }
        try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
        go('#/visit/' + res.data.visit.id);
      });
    }, 'btn-primary btn-block btn-lg'), err];
  }

  // ------------------------------------------------------------------ the visit
  function showVisit(id) {
    api.call('myVisit', { visitId: id }).then(function (res) {
      if (!res.ok) { if (res.code === 404) { go('#/home'); return; } loadFailed(res, function () { showVisit(id); }); return; }
      var st = res.data, v = st.visit;
      if (v.status === 'started') fasciaStep(st);
      else if (v.status === 'gps_passed' || v.status === 'review_pending') countertopStep(st);
      else doneScreen(v);
    });
  }
  function stepHeader(n, outletName, title) {
    return [h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': 2, 'aria-valuenow': n, 'aria-label': 'Step ' + n + ' of 2' },
      h('span', { class: 'on' }), h('span', { class: n === 2 ? 'on' : '' })),
      h('p', { class: 'small quiet', text: 'Step ' + n + ' of 2, ' + outletName }), h('h1', { text: title })];
  }

  /** Camera block shared by both steps. onPhoto(photo) gets the captured frame. */
  function cameraBlock(captureLabel, overlayText, onPhoto) {
    var video = h('video', { class: 'viewfinder', autoplay: true, muted: true, playsinline: true, 'aria-label': 'Camera preview' });
    var err = h('div');
    var camera = new cam.Camera(video);
    var shutter = actionButton(captureLabel, 'Taking photo…', function () {
      err.textContent = '';
      return camera.capture().then(function (p) { camera.stop(); onPhoto(p); }, function (e) { add(err, msg('error', e.message)); });
    }, 'btn-primary btn-block btn-lg shutter');
    shutter.disabled = true;
    camera.start().then(function () { shutter.disabled = false; }, function (e) { add(err, msg('error', e.message, 'camera-error')); });
    var box = h('div', { class: 'camera' }, h('div', { class: 'frame-wrap' }, video, overlayText ? h('div', { class: 'overlay', text: overlayText() }) : null), err, shutter);
    box.stopCamera = function () { camera.stop(); };
    return box;
  }

  function fasciaStep(st) {
    var v = st.visit, attemptsLeft = st.attemptsLeft;
    var gps = new cam.Gps(updateGps);
    var gpsLine = h('p', { class: 'gps', 'data-testid': 'gps', role: 'status', text: 'Getting your location…' });
    var body = h('div', { class: 'stack' });
    var cancelArea = h('div', { class: 'stack' });
    var current = null;               // camera block
    var pending = null;               // the last captured photo + reading + key, kept for "Send again"
    function updateGps(g) {
      var r = g.reading();
      gpsLine.className = 'gps' + (r && r.accuracy <= 30 ? ' gps-good' : '');
      gpsLine.textContent = g.error ? g.error : !r ? 'Getting your location…'
        : r.accuracy <= 30 ? 'GPS ready: accurate to ±' + Math.round(r.accuracy) + ' m'
        : 'GPS weak: ±' + Math.round(r.accuracy) + ' m. Step outside or wait a moment for a better reading.';
    }
    gps.start();
    cleanup = function () { gps.stop(); if (current) current.stopCamera(); };

    function overlay() { return v.outletCode + ' ' + v.outletName; }
    function takePhoto(note) {
      body.textContent = '';
      if (note) add(body, note);
      current = cameraBlock('Take shop front photo', overlay, function (photo) {
        current = null;
        var r = gps.reading();
        pending = { photo: photo, reading: r, key: api.uuid() };
        review(null);
      });
      add(body, current);
    }
    function review(error) {
      body.textContent = '';
      var p = pending, r = p.reading;
      add(body, h('figure', { class: 'shot' }, h('img', { src: p.photo.url, alt: 'Shop front photo you just took' }),
        h('figcaption', { class: 'overlay' }, overlay(), h('br'), r ? 'GPS ' + r.lat.toFixed(6) + ', ' + r.lon.toFixed(6) + ' ±' + Math.round(r.accuracy) + ' m' : 'No GPS reading')));
      if (!r) add(body, msg('error', 'No GPS reading yet. Wait until the line above says GPS ready, then take the photo again.'));
      if (error) add(body, msg('error', error, 'send-error'));
      if (r) add(body, actionButton(error ? 'Send again' : 'Use this photo', 'Checking your location…', send, 'btn-primary btn-block btn-lg'));
      add(body, button('Retake', function () { takePhoto(); }, 'btn-secondary btn-block'));
    }
    function send() {
      var p = pending, r = p.reading;
      return api.call('submitFascia', { visitId: v.id, attemptKey: p.key, photo: p.photo.base64, captureSource: 'video_frame',
        capturedAt: p.photo.capturedAt, latitude: r.lat, longitude: r.lon, accuracy: r.accuracy, speed: r.speed,
        positionAt: r.at, clientNow: new Date().toISOString() }).then(function (res) {
        if (common(res)) return;
        if (!res.ok) {
          if (res.network) { review(res.error); return; }                     // safe to resend the same capture
          if (/No GPS attempts left|closed/i.test(res.error)) { showVisit(v.id); return; }
          takePhoto(msg('error', res.error, 'send-error'));                    // the photo itself was refused
          return;
        }
        result(res.data);
      });
    }
    function result(d) {
      var c = d.check;
      attemptsLeft = d.attemptsLeft;
      body.textContent = '';
      if (c.result === 'pass') {
        gps.stop();
        add(body, h('section', { class: 'card card-ok', role: 'status', 'data-testid': 'gps-result' },
          h('h2', { text: 'Location verified' }), h('p', { text: 'You are ' + metres(c.distanceM) + ' from the shop (GPS ±' + Math.round(c.accuracyM) + ' m).' })),
          button('Next: countertop photo', function () { showVisit(v.id); }, 'btn-primary btn-block btn-lg'));
        return;
      }
      if (c.result === 'demo_accepted') {
        gps.stop();
        var outside = c.distanceM > c.radiusM;
        add(body, h('section', { class: 'card card-demo', role: 'status', 'data-testid': 'gps-result' },
          h('p', { class: 'demo-tag', text: 'DEMO OUTLET' }),
          h('h2', { text: outside ? 'Outside the ' + c.radiusM + ' m radius' : 'Location not confirmed' }),
          h('p', { class: 'demo-distance', text: metres(c.distanceM) + ' from the registered point' }),
          h('p', { text: d.message })),
          button('Next: countertop photo', function () { showVisit(v.id); }, 'btn-primary btn-block btn-lg'));
        return;
      }
      var titles = { fail_distance: 'Too far from the shop', uncertain: 'Location not confirmed', fail_accuracy: 'GPS not accurate enough',
        fail_stale: 'Reading too old', fail_invalid: 'No usable GPS reading' };
      add(body, h('section', { class: 'card card-bad', role: 'status', 'data-testid': 'gps-result' },
        h('h2', { text: titles[c.result] || 'Not verified' }), h('p', { text: d.message }),
        c.flags && c.flags.length ? h('p', { class: 'small', text: 'Flagged: ' + c.flags.join('; ') + '.' }) : null,
        h('p', { class: 'small quiet', text: 'Every attempt and photo is kept on record. ' + (attemptsLeft ? attemptsLeft + (attemptsLeft === 1 ? ' attempt' : ' attempts') + ' left.' : 'No attempts left.') })));
      if (d.visit.status === 'gps_failed') {
        add(body, msg('error', 'This visit is closed because no attempts are left. Go to the shop and start a new visit.'),
          button('Back to home', function () { go('#/home'); }, 'btn-primary btn-block'));
        cancelArea.textContent = '';
        return;
      }
      if (attemptsLeft > 0) add(body, button('Take the photo again', function () { takePhoto(); }, 'btn-primary btn-block btn-lg'));
      if (d.canSendForReview) {
        add(body, actionButton('Send for review instead', 'Sending…', function () {
          return api.call('sendForReview', { visitId: v.id }).then(function (res) {
            if (common(res)) return;
            if (!res.ok) { add(body, msg('error', res.error)); return; }
            showVisit(v.id);
          });
        }, attemptsLeft > 0 ? 'btn-secondary btn-block' : 'btn-primary btn-block btn-lg'),
        h('p', { class: 'hint', text: 'Sending for review saves this visit, but it counts only after an authorised reviewer approves it.' }));
      }
    }
    add(cancelArea, cancelVisitButton(v), h('a', { class: 'link-center', href: '#/home', text: 'Leave and finish later' }));
    frame([stepHeader(1, v.outletName, 'Photo of the shop front'), gpsLine, body, cancelArea], null, { noTabs: true });
    if (st.lastCheck && st.lastCheck.result !== 'pass') {
      result({ check: st.lastCheck, attemptsLeft: st.attemptsLeft, canSendForReview: st.canSendForReview, visit: v,
        message: 'Your last attempt was not verified (' + st.lastCheck.result.replace('_', ' ') + (st.lastCheck.distanceM !== null ? ', ' + metres(st.lastCheck.distanceM) : '') + ').' });
    } else takePhoto();
  }

  function cancelVisitButton(v) {
    var armed = false, b = button('Cancel visit', function () {
      if (!armed) { armed = true; b.textContent = 'Tap again to cancel this visit'; setTimeout(function () { if (b.isConnected) { armed = false; b.textContent = 'Cancel visit'; } }, 5000); return; }
      b.disabled = true;
      api.call('cancelVisit', { visitId: v.id }).then(function (res) { if (common(res)) return; go('#/outlet/' + encodeURIComponent(v.outletId)); });
    }, 'btn-danger btn-block');
    return b;
  }

  function countertopStep(st) {
    var v = st.visit, observation = null, pending = null, current = null;
    var body = h('div', { class: 'stack' });
    cleanup = function () { if (current) current.stopCamera(); };
    var reviewNote = v.status === 'review_pending' ? msg('info', 'Your location will be checked by a reviewer. This visit counts only after approval.', 'review-note') : null;
    function takePhoto(note) {
      body.textContent = '';
      if (note) add(body, note);
      current = cameraBlock('Take countertop photo', null, function (photo) { current = null; pending = { photo: photo, key: api.uuid() }; answer(null); });
      add(body, current);
    }
    function answer(error) {
      body.textContent = '';
      var yes = button('Yes, it is here', function () { pick('present'); }, 'choice-yes', { 'aria-pressed': String(observation === 'present') });
      var no = button('No, it is missing', function () { pick('missing'); }, 'choice-no', { 'aria-pressed': String(observation === 'missing') });
      var note = h('textarea', { id: 'remarks', class: 'input', maxlength: 1000, rows: 3, placeholder: 'For example: shopkeeper moved it inside' });
      if (pending.remarks) note.value = pending.remarks;
      note.addEventListener('input', function () { pending.remarks = note.value; });
      var submit = actionButton(error ? 'Send again' : 'Submit visit', 'Submitting…', send, 'btn-primary btn-block btn-lg');
      submit.disabled = !observation;
      var hint = h('p', { class: 'hint center', text: 'Answer the question above to submit.' });
      hint.hidden = !!observation;
      function pick(x) { observation = x; yes.setAttribute('aria-pressed', String(x === 'present')); no.setAttribute('aria-pressed', String(x === 'missing')); submit.disabled = false; hint.hidden = true; }
      add(body, h('figure', { class: 'shot' }, h('img', { src: pending.photo.url, alt: 'Countertop photo you just took' })),
        button('Retake', function () { takePhoto(); }, 'btn-secondary btn-block'),
        h('fieldset', { class: 'stack' }, h('legend', { text: 'Is the EBM countertop at this shop?' }), h('div', { class: 'choice' }, yes, no)),
        h('div', { class: 'field' }, h('label', { for: 'remarks' }, 'Note for the admin team ', h('span', { class: 'quiet', text: '(optional)' })), note),
        error ? msg('error', error, 'send-error') : null, submit, hint);
    }
    function send() {
      return api.call('submitCountertop', { visitId: v.id, attemptKey: pending.key, photo: pending.photo.base64, captureSource: 'video_frame',
        capturedAt: pending.photo.capturedAt, observation: observation, remarks: pending.remarks || '' }).then(function (res) {
        if (common(res)) return;
        if (!res.ok) {
          if (res.network) { answer(res.error); return; }
          if (/already submitted|closed/i.test(res.error)) { showVisit(v.id); return; }
          takePhoto(msg('error', res.error, 'send-error'));
          return;
        }
        doneScreen(res.data.visit);
      });
    }
    frame([stepHeader(2, v.outletName, 'Photo of the EBM countertop'), reviewNote, body,
      h('div', { class: 'stack' }, cancelVisitButton(v), h('a', { class: 'link-center', href: '#/home', text: 'Leave and finish later' }))], null, { noTabs: true });
    takePhoto();
  }

  function doneScreen(v) {
    var ok = v.status === 'submitted' || v.status === 'approved', review = v.status === 'submitted_for_review';
    var closed = !ok && !review;
    frame([h('h1', { text: ok ? 'Visit submitted' : review ? 'Visit sent for review' : 'Visit closed' }),
      h('section', { class: 'card ' + (ok ? 'card-ok' : review ? 'card-info' : 'card-bad'), 'data-testid': 'visit-done' },
        h('h2', { text: v.outletName }), h('p', { text: v.statusText }),
        ok ? h('p', { class: 'small', text: 'This verified visit resets the outlet\'s days to 0.' }) : null,
        review ? h('p', { class: 'small', text: 'It counts once an authorised reviewer approves the location.' }) : null,
        closed ? h('p', { class: 'small', text: 'This visit does not count. Start a new visit at the shop.' }) : null,
        v.observation === 'missing' ? h('p', { class: 'small', text: 'You reported the countertop missing. The admin team has been told.' }) : null),
      button('Back to home', function () { go('#/home'); }, 'btn-primary btn-block btn-lg'),
      button('My outlets', function () { go('#/outlets'); }, 'btn-secondary btn-block')], 'home');
  }

  // ------------------------------------------------------------------ history
  var summaryRange = null;
  function showVisits() {
    var r = summaryRange || { from: pkToday(0), to: pkToday(0) };
    Promise.all([api.call('mySummary', r), api.call('myVisits', { limit: 100 })]).then(function (rs) {
      var res = rs[1];
      if (!res.ok) { loadFailed(res, showVisits); return; }
      var list = res.data.visits;
      frame([h('h1', { text: 'My visits' }), rs[0].ok ? summaryCard(rs[0].data, r) : msg('error', rs[0].error),
        h('h2', { text: 'All my recent visits' }),
        list.length ? h('ul', { class: 'list', 'data-testid': 'visit-list' }, list.map(function (v) {
          return h('li', null, h('div', { class: 'row' },
            h('div', { class: 'row-main' }, h('strong', { text: v.outletName }),
              h('span', { class: 'small quiet', text: when(v.submittedAt || v.startedAt) + (v.distanceM !== null ? ' · ' + metres(v.distanceM) + ' from shop' : '') +
                (v.observation === 'missing' ? ' · countertop missing' : '') })),
            h('span', { class: 'badge ' + (v.counts ? 'lv-normal' : v.status === 'submitted_for_review' ? 'lv-info' : 'lv-muted'), text: v.statusText })));
        })) : h('p', { class: 'quiet', text: 'No visits yet.' })], 'visits');
    });
  }

  // ------------------------------------------------------------------ team visits (TSM and above)
  /** Day-by-day summary, laid out to be screenshotted and sent to the TSM. */
  function summaryCard(d, r) {
    var pick = function (from, to) { summaryRange = { from: from, to: to }; showVisits(); };
    var fromIn = h('input', { type: 'date', value: d.from, max: pkToday(0), 'aria-label': 'From date' });
    var toIn = h('input', { type: 'date', value: d.to, max: pkToday(0), 'aria-label': 'To date' });
    var controls = h('section', { class: 'card filters no-shot' },
      h('div', { class: 'chips' },
        button('Today', function () { pick(pkToday(0), pkToday(0)); }, 'btn-sm btn-secondary'),
        button('Yesterday', function () { pick(pkToday(1), pkToday(1)); }, 'btn-sm btn-secondary'),
        button('Last 7 days', function () { pick(pkToday(6), pkToday(0)); }, 'btn-sm btn-secondary')),
      h('div', { class: 'grid-2' }, h('label', { class: 'field' }, h('span', { class: 'label', text: 'From' }), fromIn),
        h('label', { class: 'field' }, h('span', { class: 'label', text: 'To' }), toIn)),
      button('Show summary', function () { pick(fromIn.value, toIn.value); }, 'btn-primary btn-block', { 'data-testid': 'summary-apply' }));
    var fmtDay = function (iso) { return new Date(iso + 'T12:00:00+05:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }); };
    var period = d.from === d.to ? fmtDay(d.from) : fmtDay(d.from) + ' – ' + fmtDay(d.to);
    var card = h('section', { class: 'card summary-card', 'data-testid': 'visit-summary' },
      h('p', { class: 'summary-eyebrow', text: 'PG Counter Top Tracker · visit summary' }),
      h('h2', { text: d.person.name }),
      h('p', { class: 'small quiet', text: d.person.designation + ' · ' + d.person.code + (d.person.territory ? ' · ' + d.person.territory : '') }),
      h('p', { class: 'summary-period', text: period }),
      h('div', { class: 'summary-stats' },
        h('div', null, h('strong', { text: String(d.verifiedVisits) }), h('span', { text: 'verified visits' })),
        h('div', null, h('strong', { text: String(d.outlets) }), h('span', { text: 'outlets' })),
        h('div', null, h('strong', { text: String(d.daysWorked) }), h('span', { text: d.daysWorked === 1 ? 'day worked' : 'days worked' }))),
      d.days.map(function (day) {
        return h('div', { class: 'summary-day' }, h('h3', { text: fmtDay(day.date) + ' · ' + day.visits.length + (day.visits.length === 1 ? ' outlet' : ' outlets') }),
          day.visits.length ? h('ol', null, day.visits.map(function (v) {
            return h('li', null, h('strong', { text: v.outletName }), ' ', h('span', { class: 'small quiet', text: v.outletCode + ' · ' + timeOnly(v.at) +
              (v.distanceM !== null && v.distanceM !== '' ? ' · ' + metres(v.distanceM) + ' from shop' : '') + (v.observation === 'missing' ? ' · countertop missing' : '') }));
          })) : h('p', { class: 'small quiet', text: 'No verified visit.' }));
      }),
      d.otherAttempts ? h('p', { class: 'small quiet', text: d.otherAttempts + ' other attempt(s) not completed or not accepted are not counted.' }) : null,
      h('p', { class: 'summary-foot', text: 'Generated ' + when(d.generatedAt) + ' from the EBM Countertop Tracker. Only GPS-verified visits are listed.' }));
    return [controls, card, h('p', { class: 'small quiet no-shot', text: 'Take a screenshot of the summary and send it to your TSM.' })];
  }
  function timeOnly(iso) { return iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }) : ''; }

  var teamFilter = null;
  function pkToday(offsetDays) { return new Date(Date.now() + 5 * 3600000 - (offsetDays || 0) * 86400000).toISOString().slice(0, 10); }
  function showTeam() {
    var f = teamFilter || { from: pkToday(6), to: pkToday(0), employeeId: '', show: '' };
    api.call('teamVisits', f).then(function (res) {
      if (!res.ok) { loadFailed(res, showTeam); return; }
      var d = res.data;
      var lab = function (text, el) { return h('label', { class: 'field' }, h('span', { class: 'label', text: text }), el); };
      var fromIn = h('input', { type: 'date', value: d.from, max: pkToday(0), 'aria-label': 'From date' });
      var toIn = h('input', { type: 'date', value: d.to, max: pkToday(0), 'aria-label': 'To date' });
      var who = h('select', { 'aria-label': 'Person' }, h('option', { value: '', text: 'Everyone' }),
        d.choosable.map(function (p) { var o = h('option', { value: p.id, text: p.name + ' · ' + p.code }); if (p.id === f.employeeId) o.selected = true; return o; }));
      var showSel = h('select', { 'aria-label': 'Which visits' }, [['', 'All visits'], ['verified', 'Verified only'], ['other', 'Not completed / rejected']].map(function (x) {
        var o = h('option', { value: x[0], text: x[1] }); if (x[0] === (f.show || '')) o.selected = true; return o; }));
      var apply = button('Show', function () {
        teamFilter = { from: fromIn.value, to: toIn.value, employeeId: who.value, show: showSel.value }; showTeam();
      }, 'btn-primary btn-block', { 'data-testid': 'team-apply' });
      var quick = h('div', { class: 'chips' }, [['Today', 0], ['Last 3 days', 2], ['Last 7 days', 6], ['Last 30 days', 29]].map(function (q) {
        return button(q[0], function () { teamFilter = Object.assign({}, f, { from: pkToday(q[1]), to: pkToday(0) }); showTeam(); }, 'btn-sm btn-secondary');
      }));
      var summary = d.people.length ? h('ul', { class: 'list', 'data-testid': 'team-people' }, d.people.map(function (p) {
        return h('li', { class: p.verified ? '' : 'not-working' }, h('div', { class: 'row' }, h('div', { class: 'row-main' }, h('strong', { text: p.name }),
          h('span', { class: 'small quiet', text: p.designation + ' · ' + p.code })),
          p.verified ? h('span', { class: 'small', text: p.verified + ' verified · ' + p.outlets + ' outlets' + (p.total > p.verified ? ' · ' + (p.total - p.verified) + ' other' : '') })
            : h('span', { class: 'badge lv-critical', text: p.total ? 'No verified visit (' + p.total + ' tried)' : 'No visit' })));
      })) : null;
      var visits = d.visits.length ? h('ul', { class: 'list', 'data-testid': 'team-visits' }, d.visits.map(function (v) {
        return h('li', null, h('div', { class: 'row' },
          h('div', { class: 'row-main' }, h('strong', { text: v.outletName }),
            h('span', { class: 'small', text: v.employeeName + ' (' + v.designation + ')' }),
            h('span', { class: 'small quiet', text: when(v.at) + ' · ' + v.territory + (v.distanceM !== null && v.distanceM !== '' ? ' · ' + metres(v.distanceM) + ' from shop' : '') +
              (v.observation === 'missing' ? ' · countertop missing' : '') }),
            v.result ? h('span', { class: 'small', text: v.result }) : null,
            h('div', { class: 'photo-btns' },
              v.fasciaPhotoId ? button('Shop front', function () { teamPhoto(v.fasciaPhotoId, 'Shop front · ' + v.outletName); }, 'btn-sm btn-secondary') : null,
              v.countertopPhotoId ? button('Countertop', function () { teamPhoto(v.countertopPhotoId, 'Countertop · ' + v.outletName); }, 'btn-sm btn-secondary') : null)),
          h('span', { class: 'badge ' + (v.counts ? 'lv-normal' : v.status === 'submitted_for_review' ? 'lv-info' : 'lv-muted'), text: v.statusText })));
      })) : h('p', { class: 'quiet', text: 'No visits in these dates.' });
      frame([h('h1', { text: 'Team visits' }),
        h('p', { class: 'small quiet', text: 'Order bookers, supervisors and MOs at the outlets of your territory and team.' }),
        h('section', { class: 'card filters' }, quick, h('div', { class: 'grid-2' }, lab('From', fromIn), lab('To', toIn)), lab('Person', who), lab('Show', showSel), apply),
        h('h2', { text: 'By person (' + d.from + ' to ' + d.to + ')' }),
        d.notWorking ? msg('error', d.notWorking + (d.notWorking === 1 ? ' person has' : ' people have') + ' no verified visit in these dates.', 'not-working-msg') : null,
        summary || h('p', { class: 'quiet', text: 'Nobody is tagged to your outlets yet.' }),
        h('h2', { text: 'Visits (' + d.total + ')' }), d.truncated ? msg('info', 'Showing the latest 300. Narrow the dates or pick a person to see the rest.') : null, visits], 'team');
    });
  }
  function teamPhoto(photoId, title) {
    var dlg = h('dialog', { class: 'viewer', 'aria-label': title });
    var body = h('div', null, h('p', { text: 'Loading photo…' }));
    add(dlg, h('div', { class: 'viewer-head' }, h('strong', { text: title }), button('Close', function () { dlg.close(); dlg.remove(); }, 'btn-sm')), body);
    document.body.appendChild(dlg); dlg.showModal();
    api.call('photo', { photoId: photoId }).then(function (r) {
      body.textContent = '';
      if (!r.ok) { add(body, msg('error', r.error)); return; }
      add(body, h('img', { src: 'data:' + r.data.mime + ';base64,' + r.data.data, alt: title }));
    });
  }

  // ------------------------------------------------------------------ router
  function route() {
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    var hash = location.hash || '#/home', m;
    if (hash === '#/login') { showLogin(); return; }
    if (!api.getToken()) { showLogin(); return; }
    if (hash === '#/password') { showPassword(); return; }
    if (hash.indexOf('#/admin') === 0) {
      if (profile && !profile.isAdmin) { go('#/home'); return; }
      cleanup = window.EBM_ADMIN.route(hash) || null;
      return;
    }
    if (profile && profile.isAdmin) { go('#/admin/dashboard'); return; }
    if (hash === '#/home') showHome();
    else if (hash === '#/outlets') showOutlets();
    else if (hash === '#/visits') showVisits();
    else if (hash === '#/team' && profile && profile.seesTeamVisits) showTeam();
    else if ((m = /^#\/outlet\/(.+)$/.exec(hash))) showOutlet(decodeURIComponent(m[1]));
    else if ((m = /^#\/visit\/([0-9a-f-]{36})$/.exec(hash))) showVisit(m[1]);
    else go('#/home');
  }

  window.EBM_UI = { h: h, add: add, show: show, go: go, msg: msg, button: button, actionButton: actionButton, common: common,
    loadFailed: loadFailed, when: when, day: day, metres: metres, levelBadge: levelBadge, LEVEL_CLASS: LEVEL_CLASS, ROLE: ROLE,
    profile: function () { return profile; }, setProfile: function (p) { profile = p; }, signOut: signOut };

  function netState() { document.getElementById('net').hidden = navigator.onLine !== false; }
  window.addEventListener('online', netState);
  window.addEventListener('offline', netState);
  window.addEventListener('hashchange', route);
  netState();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
  // profile for the top bar, then the screen
  if (api.getToken()) {
    api.call('me').then(function (res) { if (res.ok) profile = res.data.profile; route(); });
  } else route();
})();
