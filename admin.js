/* EBM Countertop Tracker - administration (Phase G4). Uses the helpers from app.js (window.EBM_UI). */
(function () {
  'use strict';
  var api = window.EBM_API;
  var U, h, add, msg, button, actionButton;
  function ui() { U = window.EBM_UI; h = U.h; add = U.add; msg = U.msg; button = U.button; actionButton = U.actionButton; }

  var LEVELS = [['', 'Any'], ['any_overdue', 'Overdue or worse'], ['normal', 'Normal (0–2 days)'], ['overdue', 'Overdue (3–4 days)'], ['high_priority', 'High priority (5–6 days)'], ['critical', 'Critical (7+ days)'], ['not_live', 'Not live yet']];
  var COUNTERTOP = [['', 'Any'], ['present', 'Present'], ['missing', 'Missing'], ['unclear', 'Photo unclear'], ['pending', 'Pending manual verification'], ['not_checked', 'Not checked yet']];
  var PLANOGRAM = [['', 'Any'], ['correct', 'Correct'], ['incorrect', 'Incorrect'], ['unclear', 'Photo unclear'], ['not_applicable', 'Not applicable'], ['pending', 'Pending manual verification'], ['not_checked', 'Not checked yet']];
  var DESIG = [['ORDER_BOOKER', 'Order Booker'], ['SUPERVISOR', 'Supervisor'], ['MO', 'MO'], ['TSM', 'TSM'], ['ASM', 'ASM'], ['AMTM', 'AMTM'], ['RSM', 'RSM'], ['SYSTEM_ADMIN', 'System Administrator']];
  var NAV = [
    ['Monitor', [['dashboard', 'Dashboard'], ['outlets', 'Outlets'], ['reports', 'Reports']]],
    ['Review', [['location', 'Location reviews'], ['compliance', 'Compliance'], ['planogram-errors', 'Planogram errors'], ['missing', 'Missing countertops'], ['far', 'Far from radius']]],
    ['Set up', [['people', 'People'], ['settings', 'Settings'], ['reference', 'Planogram reference'], ['audit', 'Audit log']]]
  ];
  var badges = {};

  // ------------------------------------------------------------------ frame and small parts
  function frame(current, content) {
    var p = U.profile() || {};
    var nav = h('nav', { class: 'admin-nav', 'aria-label': 'Administration' }, h('ul', null, NAV.map(function (g) {
      return h('li', { class: 'nav-group' }, h('span', { class: 'nav-label', text: g[0] }), h('ul', null, g[1].map(function (it) {
        var n = badges[it[0]];
        return h('li', null, h('a', { href: '#/admin/' + it[0], 'aria-current': current === it[0] ? 'page' : null }, it[1], n ? h('span', { class: 'count', text: String(n) }) : null));
      })));
    })));
    U.show([h('header', { class: 'topbar' }, h('div', { class: 'topbar-inner wide' },
      h('img', { class: 'topbar-logo', src: 'ebm-logo.png', alt: 'EBM' }),
      h('div', { class: 'topbar-text' }, h('div', { class: 'who', text: 'EBM Countertop Tracker' }), h('div', { class: 'role', text: 'Administration · ' + (p.name || '') + ' · ' + (p.code || '') })),
      button('Sign out', U.signOut, 'btn-ghost', { 'data-testid': 'sign-out' }))), nav, h('main', { class: 'page admin-page' }, content)]);
  }
  function call(action, payload) { return api.call(action, payload || {}); }
  /** Load data, then draw; failures get the shared error screen. */
  function load(action, payload, draw, current) {
    return call(action, payload).then(function (res) {
      if (!res.ok) { if (U.common(res)) return; frame(current, [h('h1', { text: 'Could not load this page' }), msg('error', res.error, 'load-error'), button('Try again', function () { load(action, payload, draw, current); }, 'btn-primary')]); return; }
      draw(res.data);
    });
  }
  function select(id, options, value, extra) {
    return h('select', Object.assign({ id: id, name: id, class: 'input' }, extra || {}), options.map(function (o) {
      return h('option', { value: o[0], selected: String(o[0]) === String(value || '') ? true : null }, o[1]);
    }));
  }
  function field(label, control, hint) {
    return h('div', { class: 'field' }, h('label', { for: control.id, text: label }), control, hint ? h('p', { class: 'hint', text: hint }) : null);
  }
  function input(id, value, extra) { return h('input', Object.assign({ id: id, name: id, class: 'input', value: value === null || value === undefined ? '' : value }, extra || {})); }
  /** A form whose submit runs an API call and shows the answer in place. */
  function form(fields, label, run, opts) {
    opts = opts || {};
    var out = h('div', { class: 'form-out', 'aria-live': 'polite' });
    var submit = h('button', { type: 'submit', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') }, label);
    var f = h('form', { class: 'stack ' + (opts.cls || ''), novalidate: true, onsubmit: function (e) {
      e.preventDefault();
      if (submit.disabled) return;
      out.textContent = '';
      submit.disabled = true;
      Promise.resolve(run(f)).then(function (r) {
        submit.disabled = false;
        if (!r) return;
        if (U.common(r)) return;
        if (!r.ok) { add(out, msg('error', r.error)); return; }
        if (opts.done) opts.done(r.data, out); else add(out, msg('ok', opts.ok || 'Saved.'));
      });
    } }, fields, h('div', { class: 'form-actions' }, submit), out);
    return f;
  }
  function val(f, name) { var el = f.elements[name]; return el ? el.value.trim() : ''; }
  var dtf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  function when(iso) { return iso ? dtf.format(new Date(iso)) : ''; }
  function card(title, body, extra) { return h('section', Object.assign({ class: 'card' }, extra || {}), title ? h('h2', { text: title }) : null, body); }
  function table(columns, rows, opts) {
    opts = opts || {};
    return h('div', { class: 'table-wrap' }, h('table', { class: 'data', 'data-testid': opts.testid },
      h('thead', null, h('tr', null, columns.map(function (c) { return h('th', { scope: 'col', text: c.label }); }))),
      h('tbody', null, rows.length ? rows.map(function (r) { return h('tr', null, columns.map(function (c) {
        var v = c.render ? c.render(r) : r[c.key];
        return h('td', { class: c.num ? 'num' : null }, v === null || v === undefined ? '' : v);
      })); }) : h('tr', null, h('td', { colspan: columns.length, class: 'empty', text: opts.empty || 'Nothing to show.' })))));
  }
  function badge(level, text) { return h('span', { class: 'badge ' + (U.LEVEL_CLASS[level] || 'lv-muted'), text: text }); }

  /** Photo viewer: photos load only when asked (they are large). */
  function photoButton(photoId, label) {
    if (!photoId) return h('span', { class: 'quiet small', text: '—' });
    return button('View', function () { viewPhoto(photoId, label); }, 'btn-sm', { 'aria-label': 'View ' + (label || 'photo') });
  }
  function viewPhoto(photoId, title) {
    var dlg = h('dialog', { class: 'viewer', 'aria-label': title || 'Photo' });
    var body = h('div', null, h('p', { text: 'Loading photo…' }));
    add(dlg, h('div', { class: 'viewer-head' }, h('strong', { text: title || 'Photo' }), button('Close', function () { dlg.close(); dlg.remove(); }, 'btn-sm')), body);
    document.body.appendChild(dlg); dlg.showModal();
    call('photo', { photoId: photoId }).then(function (r) {
      body.textContent = '';
      if (!r.ok) { add(body, msg('error', r.error)); return; }
      add(body, h('img', { src: 'data:' + r.data.mime + ';base64,' + r.data.data, alt: title || 'Photo' }));
    });
  }
  function photoInto(el, photoId, alt) {
    if (!photoId) { add(el, h('p', { class: 'quiet', text: 'No photo.' })); return; }
    add(el, h('p', { class: 'quiet small', text: 'Loading photo…' }));
    call('photo', { photoId: photoId }).then(function (r) {
      el.textContent = '';
      add(el, r.ok ? h('img', { class: 'evidence', src: 'data:' + r.data.mime + ';base64,' + r.data.data, alt: alt, 'data-testid': 'photo-' + photoId }) : msg('error', r.error));
    });
  }
  function mapLink(lat, lon, label) {
    return h('a', { href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(lat + ',' + lon), target: '_blank', rel: 'noopener noreferrer', text: label || (lat + ', ' + lon) });
  }

  // ------------------------------------------------------------------ dashboard
  function dashboard() {
    var timer = null;
    function draw(d) {
      var k = d.kpis;
      badges = { location: d.queues.locationReviews, far: d.queues.farReviews, compliance: d.queues.compliance, missing: d.queues.missingOpen };
      var eng = d.engine, stale = !eng || eng.minutesAgo > 75;
      var kpi = function (label, value, cls, href, testid) {
        return h(href ? 'a' : 'div', { class: 'kpi ' + (cls || ''), href: href || null, 'data-testid': testid }, h('span', { class: 'kpi-label', text: label }), h('b', { class: 'num', text: value === null ? '–' : String(value) }));
      };
      frame('dashboard', [
        h('div', { class: 'page-head' }, h('h1', { text: 'Dashboard' }),
          h('p', { class: 'small ' + (stale ? 'text-bad' : 'quiet'), 'data-testid': 'engine', text: eng ? 'Alert history recalculated ' + eng.minutesAgo + ' min ago' + (stale ? ' — the scheduler may have stopped. Tell IT.' : '') : 'The alert engine has not run yet.' })),
        d.live ? null : msg('info', 'Monitoring has not started: set the go-live moment in Settings. Until then no outlet ages.', 'not-live'),
        h('div', { class: 'kpis', 'data-testid': 'kpis' },
          kpi('Deployed countertops', k.deployed, '', '#/admin/outlets', 'kpi-deployed'),
          kpi('Visited today', k.visitedToday, '', null, 'kpi-today'),
          kpi('Visited in the last 3 days', k.visitedLast3Days, '', null, 'kpi-3days'),
          kpi('Overdue for a visit', k.overdue, k.overdue ? 'kpi-bad' : 'kpi-good', '#/admin/outlets?level=any_overdue', 'kpi-overdue'),
          kpi('Missing countertops', k.missing, k.missing ? 'kpi-bad' : '', '#/admin/missing', 'kpi-missing'),
          kpi('Planogram compliance', k.compliancePct === null ? null : k.compliancePct + '%', '', null, 'kpi-compliance'),
          kpi('Planogram errors', k.planogramErrors, k.planogramErrors ? 'kpi-bad' : '', '#/admin/planogram-errors', 'kpi-errors'),
          kpi('Pending manual verifications', k.pendingVerifications, k.pendingVerifications ? 'kpi-warn' : '', '#/admin/compliance', 'kpi-pending')),
        h('div', { class: 'bands', 'data-testid': 'bands' }, [['normal', 'Normal'], ['overdue', 'Overdue'], ['high_priority', 'High priority'], ['critical', 'Critical']].map(function (b) {
          return h('a', { class: 'band ' + U.LEVEL_CLASS[b[0]], href: '#/admin/outlets?level=' + b[0] }, h('b', { class: 'num', text: String(k.levels[b[0]] || 0) }), ' ' + b[1]);
        })),
        card('Overdue alerts (' + d.alerts.length + ')', table([
          { label: 'Outlet', render: function (r) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(r.id), text: r.name }); } },
          { label: 'Code', key: 'code' }, { label: 'Territory', key: 'territory' },
          { label: 'Last verified visit', render: function (r) { return r.lastVisitAt ? when(r.lastVisitAt) + (r.lastVisitBy ? ' · ' + r.lastVisitBy : '') : 'None since go-live'; } },
          { label: 'Days', key: 'days', num: true }, { label: 'Status', render: function (r) { return badge(r.level, r.levelText); } },
          { label: 'Responsible', render: function (r) { return [['Order booker', r.orderBooker], ['Supervisor', r.supervisor], ['TSM', r.tsm], ['ASM', r.asm], ['AMTM', r.amtm], ['RSM', r.rsm]].filter(function (x) { return x[1]; }).map(function (x) { return x[0] + ': ' + x[1]; }).join(' · '); } }
        ], d.alerts, { testid: 'alerts', empty: d.live ? 'No outlet is overdue.' : 'Monitoring has not started.' }))
      ]);
    }
    load('adminDashboard', {}, draw, 'dashboard');
    timer = setInterval(function () { if (document.visibilityState === 'visible') call('adminDashboard').then(function (r) { if (r.ok && location.hash === '#/admin/dashboard') draw(r.data); }); }, 60000);
    return function () { clearInterval(timer); };
  }

  // ------------------------------------------------------------------ outlet monitoring
  var monitorFilters = {};
  function outlets(query) {
    var q = new URLSearchParams(query || '');
    if (q.get('level')) monitorFilters = { level: q.get('level') };
    load('adminMonitor', { filters: monitorFilters }, function (d) {
      var o = d.options, f = monitorFilters;
      var opts = function (list) { return [['', 'Any']].concat(list.map(function (x) { return [x.id, x.name]; })); };
      var filterForm = h('form', { class: 'filters', 'aria-label': 'Filters', onsubmit: function (e) {
        e.preventDefault();
        var x = {};
        ['region', 'territory', 'tsm', 'asm', 'amtm', 'rsm', 'employee', 'outlet', 'level', 'countertop', 'planogram', 'lastVisitFrom', 'lastVisitTo'].forEach(function (k) { var v = val(filterForm, k); if (v) x[k] = v; });
        monitorFilters = x; outlets();
      } },
        field('Region', select('region', [['', 'Any']].concat(o.regions.map(function (r) { return [r, r]; })), f.region), o.regions.length ? null : 'No regions yet (Settings).'),
        field('Territory', select('territory', [['', 'Any']].concat(o.territories.map(function (t) { return [t, t]; })), f.territory)),
        field('TSM', select('tsm', opts(o.tsm), f.tsm)), field('ASM', select('asm', opts(o.asm), f.asm)),
        field('AMTM', select('amtm', opts(o.amtm), f.amtm)), field('RSM', select('rsm', opts(o.rsm), f.rsm)),
        field('Employee', select('employee', opts(o.employees), f.employee)),
        field('Outlet name or code', input('outlet', f.outlet, { type: 'search' })),
        field('Visit status', select('level', LEVELS, f.level)),
        field('Countertop', select('countertop', COUNTERTOP, f.countertop)), field('Planogram', select('planogram', PLANOGRAM, f.planogram)),
        field('Last visit from', input('lastVisitFrom', f.lastVisitFrom, { type: 'date' })), field('Last visit to', input('lastVisitTo', f.lastVisitTo, { type: 'date' })),
        h('div', { class: 'filter-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Apply filters'),
          button('Clear', function () { monitorFilters = {}; outlets(); }, 'btn-secondary')));
      var cols = [
        { label: 'Outlet', render: function (r) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(r.id), text: r.name }); } },
        { label: 'Code', key: 'code' }, { label: 'Territory', key: 'territory' },
        { label: 'Lat, Lon', render: function (r) { return mapLink(r.lat, r.lon); } },
        { label: 'Last visit', render: function (r) { return when(r.lastVisitAt); } }, { label: 'Last visited by', key: 'lastVisitBy' },
        { label: 'Days', key: 'days', num: true }, { label: 'Visit status', render: function (r) { return badge(r.level, r.levelText); } },
        { label: 'Countertop', key: 'countertopText' }, { label: 'Planogram', key: 'planogramText' }, { label: 'GPS verification', key: 'gpsStatus' },
        { label: 'Shop front', render: function (r) { return photoButton(r.fasciaPhotoId, 'Shop front · ' + r.name); } },
        { label: 'Countertop photo', render: function (r) { return photoButton(r.countertopPhotoId, 'Countertop · ' + r.name); } }
      ];
      var xcols = [{ key: 'code', label: 'Outlet code' }, { key: 'id', label: 'Ref' }, { key: 'name', label: 'Outlet' }, { key: 'territory', label: 'Territory' }, { key: 'region', label: 'Region' },
        { key: 'lat', label: 'Latitude' }, { key: 'lon', label: 'Longitude' }, { key: 'lastVisitAt', label: 'Last verified visit', type: 'datetime' }, { key: 'lastVisitBy', label: 'Last visited by' },
        { key: 'days', label: 'Days since visit', type: 'int' }, { key: 'levelText', label: 'Visit status' }, { key: 'countertopText', label: 'Countertop' },
        { key: 'planogramText', label: 'Planogram' }, { key: 'gpsStatus', label: 'GPS verification' }, { key: 'orderBooker', label: 'Order booker' },
        { key: 'tsm', label: 'TSM' }, { key: 'asm', label: 'ASM' }, { key: 'amtm', label: 'AMTM' }, { key: 'rsm', label: 'RSM' }];
      frame('outlets', [
        h('div', { class: 'page-head' }, h('h1', { text: 'Outlets' }), h('div', { class: 'head-actions' },
          h('a', { class: 'btn btn-secondary', href: '#/admin/outlet-new', text: 'Add outlet' }),
          button('Download Excel', function () {
            window.EBM_XLSX.download(window.EBM_XLSX.build({ title: 'Outlet monitoring', columns: xcols, rows: d.rows,
              info: [['Generated', when(new Date().toISOString())], ['Filters', JSON.stringify(monitorFilters)], ['Outlets', d.rows.length]] }), 'outlet-monitoring.xlsx');
          }, 'btn-secondary', { 'data-testid': 'monitor-excel' }))),
        h('details', { class: 'card', open: true }, h('summary', { text: 'Filters' }), filterForm),
        h('p', { class: 'small quiet', 'data-testid': 'result-count' }, h('b', { text: String(d.rows.length) }), ' outlets, longest without a verified visit first.'),
        table(cols, d.rows, { testid: 'monitor', empty: 'No outlet matches these filters.' })]);
    }, 'outlets');
  }

  // ------------------------------------------------------------------ one outlet
  function outlet(id) {
    load('adminOutlet', { outletId: id }, function (d) {
      var o = d.outlet, raw = d.raw;
      var details = form([
        field('Name', input('name', raw.name)), field('Territory', select('territory', d.territories.map(function (t) { return [t, t]; }), raw.territory)),
        field('Town', input('town', raw.town)),
        field('Outlet status', select('status', [['active', 'Active'], ['inactive', 'Inactive'], ['closed', 'Closed']], raw.status)),
        field('Deployment', select('deploymentStatus', [['deployed', 'Deployed'], ['pending_deployment', 'Pending deployment'], ['removed', 'Removed'], ['not_deployed', 'Not deployed'], ['demo', 'Demo (not monitored)']], raw.deploymentStatus)),
        field('Deployed on', input('deploymentDate', raw.deploymentDate, { type: 'date' }))
      ], 'Save details', function (f) {
        return call('adminUpdateOutlet', { id: raw.id, name: val(f, 'name'), territory: val(f, 'territory'), town: val(f, 'town'), status: val(f, 'status'),
          deploymentStatus: val(f, 'deploymentStatus'), deploymentDate: val(f, 'deploymentDate') });
      }, { ok: 'Outlet details saved.', cls: 'grid-2' });
      var coords = form([
        field('New latitude', input('lat', '', { inputmode: 'decimal', placeholder: raw.lat })), field('New longitude', input('lon', '', { inputmode: 'decimal', placeholder: raw.lon })),
        field('Reason and source of the reading', h('textarea', { id: 'coordReason', name: 'coordReason', class: 'input', rows: 2 }), 'Only with a GPS reading taken at the shop. The old position is kept.')
      ], 'Correct coordinates', function (f) {
        return call('adminCorrectCoordinates', { id: raw.id, lat: val(f, 'lat'), lon: val(f, 'lon'), reason: val(f, 'coordReason') });
      }, { done: function () { outlet(id); } });
      frame('outlets', [
        h('a', { class: 'back', href: '#/admin/outlets', text: 'Back to outlets' }),
        h('div', { class: 'page-head' }, h('div', null, h('h1', { text: o.name }), h('p', { class: 'quiet', text: [o.code, o.id, o.territory, o.region].filter(Boolean).join(' · ') })),
          badge(o.level, o.days === null ? o.levelText : o.days + ' days · ' + o.levelText)),
        h('div', { class: 'grid-3' },
          card('Status', h('dl', { class: 'kv' },
            h('dt', { text: 'Last verified visit' }), h('dd', { text: o.lastVisitAt ? when(o.lastVisitAt) + ' · ' + o.lastVisitBy : 'None' }),
            h('dt', { text: 'Verification' }), h('dd', { text: o.gpsStatus }),
            h('dt', { text: 'Countertop' }), h('dd', { text: o.countertopText }), h('dt', { text: 'Planogram' }), h('dd', { text: o.planogramText }),
            h('dt', { text: 'Missing case' }), h('dd', { text: o.missingCase || 'None' }))),
          card('Location', [h('p', null, mapLink(o.lat, o.lon)), h('p', { class: 'small quiet', text: 'Deployment: ' + o.deploymentStatus + (o.deploymentDate ? ' since ' + o.deploymentDate : '') })]),
          card('Responsible', h('dl', { class: 'kv' }, [['Order booker', o.orderBooker], ['Supervisor', o.supervisor], ['TSM', o.tsm], ['ASM', o.asm], ['MO', o.mo], ['AMTM', o.amtm], ['RSM', o.rsm]]
            .filter(function (x) { return x[1]; }).map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: x[1] })]; })))),
        card('Visit history (' + d.visits.length + ')', d.visits.length ? h('div', { class: 'stack', 'data-testid': 'visit-history' }, d.visits.map(function (v) { return visitBlock(v, function () { outlet(id); }); })) : h('p', { class: 'quiet', text: 'No visits yet.' })),
        h('div', { class: 'grid-2' }, card('Edit outlet details', details), card('Correct coordinates', coords)),
        card('Coordinate history', table([{ label: 'When', render: function (r) { return when(r.at); } }, { label: 'From', key: 'from' }, { label: 'To', key: 'to' }, { label: 'Reason', key: 'reason' }, { label: 'By', key: 'by' }],
          d.coordinateHistory, { testid: 'coordinate-history', empty: 'Original coordinates from the outlet master.' }))
      ]);
    }, 'outlets');
  }
  /** One visit with all its evidence, decisions and the reject / reverse actions. */
  function visitBlock(v, refresh) {
    var photos = h('div', { class: 'photo-row' }, v.photos.map(function (p) {
      var chk = v.checks.filter(function (c) { return c.id === p.gpsCheckId; })[0];
      return photoButton(p.id, (p.type === 'fascia' ? 'Shop front' + (chk ? ' (attempt ' + chk.attemptNo + ')' : '') : 'Countertop') + ' · ' + when(p.capturedAt));
    }));
    var dec = v.assessments.length ? v.assessments[v.assessments.length - 1] : null;
    var counts = v.status === 'submitted' || v.status === 'approved';
    var actions = h('div', { class: 'stack' });
    if (counts) add(actions, form([field('Reason for rejecting this visit', h('textarea', { id: 'rej-' + v.id, name: 'reason', class: 'input', rows: 2 }))], 'Reject this visit',
      function (f) { return call('adminRejectVisit', { visitId: v.id, reason: val(f, 'reason') }); }, { danger: true, done: refresh }));
    if (v.status === 'rejected') add(actions, form([field('Reason for reversing the rejection', h('textarea', { id: 'rev-' + v.id, name: 'reason', class: 'input', rows: 2 }))], 'Reverse the rejection',
      function (f) { return call('adminReverseRejection', { visitId: v.id, reason: val(f, 'reason') }); }, { done: refresh }));
    return h('details', { class: 'visit', 'data-testid': 'visit' },
      h('summary', null, h('strong', { text: when(v.submittedAt || v.startedAt) }), ' · ' + v.employee.name + ' (' + (U.ROLE[(v.employee.designation || '').toLowerCase()] || v.employee.designation) + ') · ',
        h('span', { class: 'badge ' + (counts ? 'lv-normal' : v.status === 'submitted_for_review' ? 'lv-info' : 'lv-muted'), text: v.statusText }),
        v.distanceM !== null ? ' · ' + Math.round(v.distanceM) + ' m' : ''),
      table([{ label: 'Attempt', key: 'attemptNo', num: true }, { label: 'GPS', render: function (c) { return c.lat ? mapLink(c.lat, c.lon) : '—'; } },
        { label: 'Distance (m)', render: function (c) { return c.distanceM === null ? '' : Math.round(c.distanceM); }, num: true },
        { label: 'Accuracy (m)', render: function (c) { return c.accuracyM === null ? '' : Math.round(c.accuracyM); }, num: true },
        { label: 'Result', key: 'result' }, { label: 'Flags', render: function (c) { return c.flags.join('; '); } }, { label: 'Reading time', render: function (c) { return when(c.positionAt); } }], v.checks),
      photos,
      h('dl', { class: 'kv' }, h('dt', { text: 'Countertop (field)' }), h('dd', { text: v.observation || '—' }),
        h('dt', { text: 'Field note' }), h('dd', { text: v.remarks || '—' }),
        h('dt', { text: 'Decision' }), h('dd', null, dec ? [dec.presence + ' / ' + dec.planogram + (dec.remarks ? ' — ' + dec.remarks : '') + (dec.method === 'automatic' ? ' (automatic, AI) ' : ' (manual) '),
          h('a', { href: '#/admin/compliance/' + v.id, text: 'Correct this result' })] : counts ? h('a', { href: '#/admin/compliance/' + v.id, text: 'Pending manual verification: decide' }) : '—')),
      v.reviews.length ? table([{ label: 'When', render: function (r) { return when(r.at); } }, { label: 'Action', key: 'action' }, { label: 'From', key: 'fromStatus' }, { label: 'To', key: 'toStatus' }, { label: 'Reason', key: 'reason' }, { label: 'By', key: 'by' }], v.reviews) : null,
      actions);
  }

  function outletNew() {
    load('adminSettings', {}, function (d) {
      frame('outlets', [h('a', { class: 'back', href: '#/admin/outlets', text: 'Back to outlets' }), h('h1', { text: 'Add outlet' }),
        msg('info', 'For a new countertop deployment. Coordinates must come from a GPS reading taken at the shop.'),
        card(null, form([
          field('Outlet (store) code', input('code', '')), field('Outlet name', input('name', '')),
          field('Territory', select('territory', d.territories.map(function (t) { return [t.name, t.name]; }), '')), field('Town', input('town', '')),
          field('Latitude', input('lat', '', { inputmode: 'decimal' })), field('Longitude', input('lon', '', { inputmode: 'decimal' })),
          field('Deployed on', input('deploymentDate', '', { type: 'date' })), field('Asset tag', input('assetTag', '')),
          field('Source of the coordinates', h('textarea', { id: 'reason', name: 'reason', class: 'input', rows: 2 }))
        ], 'Add outlet', function (f) {
          return call('adminCreateOutlet', { code: val(f, 'code'), name: val(f, 'name'), territory: val(f, 'territory'), town: val(f, 'town'), lat: val(f, 'lat'), lon: val(f, 'lon'),
            deploymentDate: val(f, 'deploymentDate'), assetTag: val(f, 'assetTag'), reason: val(f, 'reason') });
        }, { cls: 'grid-2', done: function (data) { U.go('#/admin/outlet/' + encodeURIComponent(data.outlet.id)); } }))]);
    }, 'outlets');
  }

  // ------------------------------------------------------------------ reviews
  function locationReviews() {
    load('adminLocationReviews', {}, function (d) {
      badges.location = d.visits.length;
      frame('location', [h('h1', { text: 'Location reviews' }),
        h('p', { class: 'quiet', text: 'Visits whose GPS could not prove they were inside the radius (weak GPS). Approve only if the shop-front photo clearly shows this shop. A reason is always required. Visits clearly outside the radius are under Far from radius.' }),
        d.visits.length ? h('div', { class: 'stack', 'data-testid': 'location-queue' }, d.visits.map(function (v) {
          var shot = h('div', { class: 'photo-box' });
          var fascia = v.photos.filter(function (p) { return p.type === 'fascia'; }).pop();
          photoInto(shot, fascia && fascia.id, 'Shop front of ' + v.outlet.name);
          return card(v.outlet.name + ' · ' + v.outlet.code, [
            h('p', { class: 'small', text: v.employee.name + ' · submitted ' + when(v.submittedAt) + ' · registered point ' }, mapLink(v.outlet.lat, v.outlet.lon)),
            h('div', { class: 'grid-2' }, shot, table([{ label: '#', key: 'attemptNo' }, { label: 'Distance', render: function (c) { return Math.round(c.distanceM) + ' m'; } },
              { label: '±', render: function (c) { return Math.round(c.accuracyM) + ' m'; } }, { label: 'Result', key: 'result' }, { label: 'Flags', render: function (c) { return c.flags.join('; '); } }], v.checks)),
            form([field('Reason', h('textarea', { id: 'lr-' + v.id, name: 'reason', class: 'input', rows: 2 })),
              h('fieldset', { class: 'inline' }, h('legend', { text: 'Decision' }),
                h('label', null, h('input', { type: 'radio', name: 'decision', value: 'approve' }), ' Approve: it is this shop'),
                h('label', null, h('input', { type: 'radio', name: 'decision', value: 'reject' }), ' Reject'))],
              'Save decision', function (f) {
                var dec = f.querySelector('input[name=decision]:checked');
                return call('adminDecideLocation', { visitId: v.id, decision: dec ? dec.value : '', reason: val(f, 'reason') });
              }, { done: function () { locationReviews(); } })
          ], { 'data-testid': 'location-item' });
        })) : msg('ok', 'No visit is waiting for a location review.', 'location-empty')]);
    }, 'location');
  }

  // ------------------------------------------------------------------ far from radius (14 Nov 2026)
  function farFromRadius() {
    load('adminLocationReviews', { far: true }, function (d) {
      badges.far = d.visits.length;
      var m = function (x) { return x === null || x === undefined || x === '' ? '–' : (x >= 1000 ? (Math.round(x / 100) / 10) + ' km' : Math.round(x) + ' m'); };
      var waiting = d.visits.length ? h('div', { class: 'stack', 'data-testid': 'far-queue' }, d.visits.map(function (v) {
        var shot = h('div', { class: 'photo-box' }), counter = h('div', { class: 'photo-box' });
        var fascia = v.photos.filter(function (p) { return p.type === 'fascia'; }).pop(), ct = v.photos.filter(function (p) { return p.type === 'countertop'; }).pop();
        photoInto(shot, fascia && fascia.id, 'Shop front of ' + v.outlet.name);
        photoInto(counter, ct && ct.id, 'Countertop at ' + v.outlet.name);
        var g = v.checks.filter(function (c) { return c.result === 'far_accepted'; }).pop() || v.checks[v.checks.length - 1] || {};
        return card(v.outlet.name + ' · ' + v.outlet.code + ' · ' + (v.outlet.territory || ''), [
          h('p', { class: 'far-distance', text: m(v.distanceM) + ' from the saved shop location (GPS ±' + Math.round(g.accuracyM || 0) + ' m)' }),
          h('p', { class: 'small' }, v.employee.name + ' · submitted ' + when(v.submittedAt) + ' · saved location ', mapLink(v.outlet.lat, v.outlet.lon),
            ' · on-site reading ', g.lat ? mapLink(g.lat, g.lon, Number(g.lat).toFixed(7) + ', ' + Number(g.lon).toFixed(7)) : '–'),
          h('div', { class: 'grid-2' }, shot, counter),
          form([field('Reason', h('textarea', { id: 'fr-' + v.id, name: 'reason', class: 'input', rows: 2 })),
            h('fieldset', { class: 'far-decision' }, h('legend', { text: 'Decision' }),
              h('label', null, h('input', { type: 'radio', name: 'decision', value: 'fix' }), ' Approve, and move the saved shop location to this on-site reading (the coordinates were wrong)'),
              h('label', null, h('input', { type: 'radio', name: 'decision', value: 'approve' }), ' Approve only: it is this shop (keep the saved location)'),
              h('label', null, h('input', { type: 'radio', name: 'decision', value: 'reject' }), ' Reject: not at this shop'))],
            'Save decision', function (f) {
              var dec = f.querySelector('input[name=decision]:checked'), dv = dec ? dec.value : '';
              return call('adminDecideLocation', { visitId: v.id, decision: dv === 'fix' ? 'approve' : dv, fixCoordinates: dv === 'fix', reason: val(f, 'reason') });
            }, { done: function () { farFromRadius(); } })
        ], { 'data-testid': 'far-item' });
      })) : msg('ok', 'No far-from-radius visit is waiting for a decision.', 'far-empty');
      var outletsTable = d.outlets.length ? table([
        { label: 'Outlet', render: function (r) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(r.outletId), text: r.name }); } },
        { label: 'Code', key: 'code' }, { label: 'Territory', key: 'territory' },
        { label: 'Far visits', key: 'farVisits' }, { label: 'Waiting', key: 'waiting' },
        { label: 'Last distance', render: function (r) { return m(r.last.distanceM); } },
        { label: 'Last visit', render: function (r) { return when(r.last.at) + ' · ' + r.last.by; } },
        { label: 'Saved location', render: function (r) { return mapLink(r.lat, r.lon); } },
        { label: 'Last on-site reading', render: function (r) { return r.last.lat ? mapLink(r.last.lat, r.last.lon, Number(r.last.lat).toFixed(7) + ', ' + Number(r.last.lon).toFixed(7)) : '–'; } },
        { label: 'Coordinates', render: function (r) { return r.coordinatesCorrectedAt ? h('span', { class: 'badge lv-normal', text: 'Corrected ' + when(r.coordinatesCorrectedAt) }) : h('span', { class: 'badge lv-critical', text: 'Check / fix' }); } }
      ], d.outlets) : msg('ok', 'No outlet has had a visit outside the radius.');
      frame('far', [h('h1', { text: 'Far from radius' }),
        h('p', { class: 'quiet', text: 'Visits submitted from more than ' + d.radiusM + ' m from the saved shop location. They are kept as evidence and count only after you approve them. Many far visits at one outlet usually mean its saved coordinates are wrong.' }),
        h('h2', { text: 'Waiting for a decision (' + d.visits.length + ')' }), waiting,
        h('h2', { text: 'Outlets with far visits (' + d.outlets.length + ')' }), h('div', { 'data-testid': 'far-outlets' }, outletsTable)]);
    }, 'far');
  }

  function compliance(tab) {
    load('adminComplianceQueue', { tab: tab || 'pending' }, function (d) {
      if (!tab || tab === 'pending') badges.compliance = d.visits.length;
      frame('compliance', [h('h1', { text: 'Compliance' }),
        d.reference ? h('p', { class: 'quiet', text: 'Judged against planogram reference version ' + d.reference.version + '.' }) : msg('error', 'No approved planogram reference yet. Upload and approve one under Set up › Planogram reference.', 'no-reference'),
        d.waitingLocationReview ? msg('info', d.waitingLocationReview + ' visit(s) must have their location approved first (Location reviews).') : null,
        d.ai && d.ai.enabled ? msg('ok', 'Automatic check (AI) is on: correct and incorrect planograms are decided automatically. Listed here: visits the AI is not sure about' +
          (d.ai.checking ? ', and at the bottom ' + d.ai.checking + ' visit(s) the AI is still checking (it runs every 5 minutes).' : '.'), 'ai-on') : msg('info', 'Automatic check (AI) is off: every visit needs a decision here.', 'ai-off'),
        h('nav', { class: 'tabs' }, h('a', { href: '#/admin/compliance', 'aria-current': tab !== 'decided' ? 'page' : null, text: 'Waiting for a decision' }),
          h('a', { href: '#/admin/compliance?tab=decided', 'aria-current': tab === 'decided' ? 'page' : null, text: 'Decided' })),
        table([{ label: 'Visit', render: function (r) { return h('a', { href: '#/admin/compliance/' + r.visitId, text: when(r.submittedAt) }); } },
          { label: 'Outlet', render: function (r) { return r.outletName + ' · ' + r.outletCode; } }, { label: 'Territory', key: 'territory' }, { label: 'By', key: 'employee' },
          { label: 'Field answer', key: 'observation' }, { label: 'Result', key: 'complianceText' },
          tab === 'decided' ? { label: 'Decided', render: function (r) { return r.decision ? when(r.decision.at) + ' · ' + r.decision.by : ''; } }
            : { label: 'Why it needs you', render: function (r) { return r.aiNote || '—'; } }],
        d.visits, { testid: 'compliance-queue', empty: tab === 'decided' ? 'Nothing decided yet.' : 'No visit is waiting for a decision.' })]);
    }, 'compliance');
  }
  function complianceDecide(visitId) {
    Promise.all([call('adminVisit', { visitId: visitId }), call('adminReferenceImage', {})]).then(function (rs) {
      var r = rs[0], ref = rs[1];
      if (!r.ok) { if (!U.common(r)) frame('compliance', [msg('error', r.error)]); return; }
      var v = r.data.visit, ct = v.photos.filter(function (p) { return p.type === 'countertop'; })[0];
      var photo = h('div', { class: 'photo-box' }); photoInto(photo, ct && ct.id, 'Countertop photo from this visit');
      var refBox = h('div', { class: 'photo-box' }, ref.ok ? [h('img', { class: 'evidence', src: 'data:' + ref.data.mime + ';base64,' + ref.data.data, alt: 'Approved planogram reference', 'data-testid': 'reference-image' }),
        h('p', { class: 'small', text: 'Version ' + ref.data.version + ': ' + ref.data.description })] : msg('error', ref.error));
      var last = v.assessments.length ? v.assessments[v.assessments.length - 1] : null;
      var option = function (value, label) { return h('label', { class: 'option' }, h('input', { type: 'radio', name: 'outcome', value: value }), ' ' + label); };
      var f = form([h('fieldset', { class: 'stack' }, h('legend', { text: 'Result' }),
          option('present|correct', 'Countertop present, planogram correct'), option('present|correct|low', 'Countertop present, low stock'),
          option('present|incorrect', 'Countertop present, planogram incorrect'),
          option('missing|not_applicable', 'Countertop missing'), option('unclear|unclear', 'Photo unclear')),
        field('Remarks' + (last ? ' (required: you are correcting an earlier result)' : ' (optional)'), h('textarea', { id: 'remarks', name: 'remarks', class: 'input', rows: 2 }))],
        last ? 'Correct the result' : 'Save result', function (fm) {
          var o = fm.querySelector('input[name=outcome]:checked');
          if (!o) return Promise.resolve({ ok: false, error: 'Choose a result.' });
          var p = o.value.split('|');
          if (p[2] === 'low' && !val(fm, 'remarks')) return Promise.resolve({ ok: false, error: 'Write which SKUs are short in Remarks (e.g. Piper\'s Gold Cup: top shelf empty).' });
          return call('adminDecideCompliance', { visitId: v.id, presence: p[0], planogram: p[1], stock: p[2] || '', remarks: val(fm, 'remarks') });
        }, { done: function (data, out) { add(out, msg('ok', 'Saved: ' + data.complianceText + '.', 'decision-saved')); } });
      frame('compliance', [h('a', { class: 'back', href: '#/admin/compliance', text: 'Back to compliance' }),
        h('h1', { text: v.outlet.name + ' · ' + when(v.submittedAt) }),
        h('p', { class: 'quiet', text: v.employee.name + ' · ' + v.statusText + ' · field answer: countertop ' + (v.observation || '—') + (v.remarks ? ' · note: ' + v.remarks : '') }),
        last ? msg('info', 'Current result: ' + last.presence + ' / ' + last.planogram + (last.stock === 'low' ? ' / low stock' : '') + (last.remarks ? ' — ' + last.remarks : '') + (last.method === 'automatic' ? ' (automatic check, AI).' : ' (manual decision).'), 'current-decision') : msg('info', 'Pending manual verification: the automatic check could not decide this visit, or it is switched off.'),
        h('div', { class: 'grid-2' }, card('Countertop photo', photo), card('Approved planogram reference', refBox)),
        card('Decision', f)]);
    });
  }

  function planogramErrors() {
    Promise.all([call('adminMonitor', { filters: { planogram: 'incorrect' } }), call('adminMonitor', { filters: { stock: 'low' } })]).then(function (rs) {
      if (!rs[0].ok) { if (!U.common(rs[0])) frame('planogram-errors', [msg('error', rs[0].error)]); return; }
      var d = rs[0].data, low = rs[1].ok ? rs[1].data.rows : [];
      frame('planogram-errors', [h('h1', { text: 'Planogram errors' }),
        h('p', { class: 'quiet', text: 'Outlets whose latest decided visit found the planogram incorrect, with what is wrong. Open the photo to see it. An outlet leaves this list when a later visit is decided correct; to correct a wrong automatic result, open the outlet and use Compliance.' }),
        table([{ label: 'Outlet', render: function (r) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(r.id), text: r.name }); } }, { label: 'Code', key: 'code' },
          { label: 'Territory', key: 'territory' }, { label: 'Last verified visit', render: function (r) { return when(r.lastVisitAt) + ' · ' + r.lastVisitBy; } },
          { label: 'What is wrong', render: function (r) { return h('span', { class: 'plano-note', text: (r.planogramNote || '—') + (r.decisionMethod === 'automatic' ? '' : ' (manual decision)') }); } },
          { label: 'Countertop photo', render: function (r) { return photoButton(r.countertopPhotoId, 'Countertop · ' + r.name); } }, { label: 'Order booker', key: 'orderBooker' }, { label: 'TSM', key: 'tsm' }],
        d.rows, { testid: 'planogram-errors', empty: 'No planogram errors.' }),
        h('h2', { text: 'Low stock (' + low.length + ')' }),
        h('p', { class: 'quiet', text: 'Outlets whose latest visit found some SKUs short or empty. Low stock does not fail the planogram; refill these.' }),
        table([{ label: 'Outlet', render: function (r) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(r.id), text: r.name }); } }, { label: 'Code', key: 'code' },
          { label: 'Territory', key: 'territory' }, { label: 'Last verified visit', render: function (r) { return when(r.lastVisitAt) + ' · ' + r.lastVisitBy; } },
          { label: 'SKUs short', render: function (r) { return h('span', { class: 'stock-note', text: r.stockNote || 'Low stock' }); } },
          { label: 'Planogram', key: 'planogramText' },
          { label: 'Countertop photo', render: function (r) { return photoButton(r.countertopPhotoId, 'Countertop · ' + r.name); } }, { label: 'Order booker', key: 'orderBooker' }],
        low, { testid: 'low-stock', empty: 'No low stock reported.' })]);
    });
  }

  function missing(tab) {
    load('adminMissingCases', { tab: tab || 'open' }, function (d) {
      var closed = tab === 'closed';
      if (!closed) badges.missing = d.cases.filter(function (c) { return c.status === 'open'; }).length;
      frame('missing', [h('h1', { text: 'Missing countertops' }),
        h('p', { class: 'quiet', text: 'Cases open when field staff report a countertop missing on a counted visit, or a photo review finds none. Confirm, then close once the countertop is back or the report was wrong.' }),
        h('nav', { class: 'tabs' }, h('a', { href: '#/admin/missing', 'aria-current': closed ? null : 'page', text: 'Open' }), h('a', { href: '#/admin/missing?tab=closed', 'aria-current': closed ? 'page' : null, text: 'Closed' })),
        d.cases.length ? h('div', { class: 'stack', 'data-testid': 'missing-cases' }, d.cases.map(function (c) {
          return card(null, [h('div', { class: 'page-head' }, h('h2', null, h('a', { href: '#/admin/outlet/' + encodeURIComponent(c.outlet.id), text: c.outlet.name })), h('span', { class: 'badge lv-' + (c.status === 'open' ? 'critical' : c.status === 'confirmed' ? 'high' : 'muted'), text: c.status })),
            h('p', { class: 'small', text: c.outlet.code + ' · ' + c.outlet.territory + ' · ' + c.source + ' · opened ' + when(c.openedAt) + (c.visit ? ' · visit by ' + c.visit.by : '') }),
            c.notes ? h('p', { class: 'small', text: 'Notes: ' + c.notes }) : null,
            closed ? null : form([h('div', { class: 'grid-2' },
              field('Action', select('st-' + c.id, [['', 'Choose…']].concat(c.status === 'open' ? [['confirmed', 'Confirm missing']] : []).concat([['resolved', 'Close: countertop back in place'], ['false_alarm', 'Close: false alarm']]), '', { name: 'status', 'aria-label': 'Action' })),
              field('Notes', input('nt-' + c.id, '', { name: 'notes' })))], 'Save', function (f) {
              return call('adminMissingCase', { id: c.id, status: f.elements.status.value, notes: f.elements.notes.value.trim() });
            }, { done: function () { missing(tab); } })], { 'data-testid': 'missing-case' });
        })) : msg('ok', closed ? 'No closed cases.' : 'No open missing-countertop cases.')]);
    }, 'missing');
  }

  // ------------------------------------------------------------------ people
  function people() {
    load('adminEmployees', {}, function (d) {
      var q = h('input', { id: 'pq', type: 'search', class: 'input', placeholder: 'Name or code', oninput: draw });
      var dsel = select('pd', [['', 'All designations']].concat(DESIG), '', { onchange: draw });
      var holder = h('div');
      function draw() {
        var t = q.value.trim().toLowerCase(), ds = dsel.value;
        holder.textContent = '';
        add(holder, table([{ label: 'Code', render: function (e) { return h('a', { href: '#/admin/person/' + e.id, text: e.code }); } }, { label: 'Name', key: 'name' },
          { label: 'Designation', render: function (e) { return (DESIG.filter(function (x) { return x[0] === e.designation; })[0] || [0, e.designation])[1]; } },
          { label: 'Territory', key: 'territory' }, { label: 'Status', key: 'status' }, { label: 'Login', render: function (e) { return e.hasLogin ? (e.mustChangePassword ? 'Temporary password' : 'Yes') : 'Not created'; } }],
          d.employees.filter(function (e) { return (!t || e.name.toLowerCase().indexOf(t) >= 0 || e.code.toLowerCase().indexOf(t) >= 0) && (!ds || e.designation === ds); }), { testid: 'people' }));
      }
      draw();
      frame('people', [h('h1', { text: 'People' }),
        h('details', { class: 'card' }, h('summary', { text: 'Add an employee' }), form([
          field('Employee code', input('code', '', { autocapitalize: 'characters' })), field('Full name', input('name', '')),
          field('Designation', select('designation', DESIG, 'ORDER_BOOKER')), field('Territory', input('territory', '')), field('Phone', input('phone', '', { type: 'tel' }))
        ], 'Add employee', function (f) {
          return call('adminCreateEmployee', { code: val(f, 'code'), name: val(f, 'name'), designation: val(f, 'designation'), territory: val(f, 'territory'), phone: val(f, 'phone') });
        }, { cls: 'grid-2', done: function (data) { U.go('#/admin/person/' + data.employee.id); } })),
        h('div', { class: 'grid-2' }, field('Search', q), field('Designation', dsel)), holder]);
    }, 'people');
  }
  function person(id) {
    Promise.all([call('adminEmployees'), call('adminAssignments', { employeeId: id }), call('adminMonitor', { filters: { monitoredOnly: false } })]).then(function (rs) {
      for (var i = 0; i < rs.length; i++) if (!rs[i].ok) { if (!U.common(rs[i])) frame('people', [msg('error', rs[i].error)]); return; }
      var all = rs[0].data.employees, e = all.filter(function (x) { return x.id === id; })[0];
      if (!e) { frame('people', [msg('error', 'Employee not found.')]); return; }
      var assigns = rs[1].data.assignments, outletsAll = rs[2].data.rows;
      var mgr = function (line) { var m = e.managers.filter(function (x) { return x.line === line; })[0]; return m ? m.managerId : ''; };
      var others = [['', 'No one']].concat(all.filter(function (x) { return x.id !== e.id && x.status === 'active' && x.designation !== 'SYSTEM_ADMIN'; }).map(function (x) { return [x.id, x.name + ' (' + x.code + ', ' + x.designation + ')']; }));
      var loginOut = h('div', { 'data-testid': 'login-panel' });
      var loginBtn = actionButton(e.hasLogin ? 'Reset password' : 'Create login', 'Working…', function () {
        return call('adminResetPassword', { id: e.id }).then(function (r) {
          loginOut.textContent = '';
          if (!r.ok) { add(loginOut, msg('error', r.error)); return; }
          add(loginOut, msg('ok', (r.data.created ? 'Login created.' : 'Password reset.') + ' Temporary password: ' + r.data.temporaryPassword + ' — give it to ' + e.code + ' in person; it is shown only once and must be changed at first sign-in.', 'temp-password'));
        });
      }, 'btn-primary');
      var assignable = outletsAll.filter(function (o) { return !assigns.some(function (a) { return a.outletId === o.id; }); });
      var multi = h('select', { id: 'assign', name: 'assign', class: 'input', multiple: true, size: 8 }, assignable.map(function (o) { return h('option', { value: o.id }, o.name + ' (' + o.code + ', ' + o.territory + ')'); }));
      frame('people', [h('a', { class: 'back', href: '#/admin/people', text: 'Back to people' }),
        h('div', { class: 'page-head' }, h('div', null, h('h1', { text: e.name }), h('p', { class: 'quiet', text: e.code + ' · ' + e.designation })), h('span', { class: 'badge ' + (e.status === 'active' ? 'lv-normal' : 'lv-critical'), text: e.status })),
        h('div', { class: 'grid-2' },
          card('Details', form([field('Full name', input('name', e.name)), field('Designation', select('designation', DESIG, e.designation)),
            field('Territory', input('territory', e.territory)), field('Phone', input('phone', e.phone, { type: 'tel' })),
            field('Status', select('status', [['active', 'Active'], ['suspended', 'Suspended'], ['left', 'Left the company']], e.status), 'Suspended or Left blocks the login at once and signs the person out.')],
            'Save details', function (f) { return call('adminUpdateEmployee', { id: e.id, name: val(f, 'name'), designation: val(f, 'designation'), territory: val(f, 'territory'), phone: val(f, 'phone'), status: val(f, 'status') }); }, { ok: 'Details saved.' })),
          h('div', { class: 'stack' },
            card('Login', [h('p', { class: 'small', text: e.hasLogin ? (e.mustChangePassword ? 'Has a temporary password; must choose a new one at next sign-in.' : 'Has a login.') + ' Signs in with code ' + e.code + '.' : 'No login yet.' }), loginBtn, loginOut]),
            card('Reports to', [form([field('Sales line', select('salesMgr', others, mgr('sales')))], 'Save', function (f) { return call('adminSetManager', { employeeId: e.id, managerId: val(f, 'salesMgr'), line: 'sales' }); }, { ok: 'Reporting line saved.' }),
              form([field('Trade marketing line', select('tmMgr', others, mgr('trade_marketing')))], 'Save', function (f) { return call('adminSetManager', { employeeId: e.id, managerId: val(f, 'tmMgr'), line: 'trade_marketing' }); }, { ok: 'Reporting line saved.' })]))),
        e.designation === 'SYSTEM_ADMIN' ? null : card('Outlets (' + assigns.length + ')', [
          h('p', { class: 'small quiet', text: 'Outlets assigned directly. Managers also see every outlet of the people who report to them.' }),
          table([{ label: 'Outlet', render: function (a) { return h('a', { href: '#/admin/outlet/' + encodeURIComponent(a.outletId), text: a.outletName }); } }, { label: 'Code', key: 'outletCode' },
            { label: 'Territory', key: 'territory' }, { label: 'Role', key: 'role' },
            { label: '', render: function (a) { return actionButton('End', 'Ending…', function () { return call('adminEndAssignment', { assignmentId: a.id }).then(function (r) { if (r.ok) person(id); }); }, 'btn-sm'); } }],
            assigns, { testid: 'assignments', empty: 'No outlets assigned.' }),
          form([field('Assign more outlets (hold Ctrl to choose several)', multi)], 'Assign selected outlets', function (f) {
            return call('adminAssignOutlets', { employeeId: e.id, outletIds: Array.prototype.map.call(f.elements.assign.selectedOptions, function (o) { return o.value; }) });
          }, { done: function () { person(id); } })]),
        h('p', { class: 'small quiet' }, 'Every change here is recorded in the ', h('a', { href: '#/admin/audit?record=' + e.id, text: 'audit log' }), '.')]);
    });
  }

  // ------------------------------------------------------------------ settings, reference, audit
  function settings() {
    load('adminSettings', {}, function (d) {
      var s = d.settings;
      var goLive = s.go_live_at ? new Date(Date.parse(s.go_live_at) + 5 * 3600000).toISOString().slice(0, 16) : '';
      frame('settings', [h('h1', { text: 'Settings' }),
        card('Go-live', [h('p', { class: 'small', 'data-testid': 'go-live-now', text: s.go_live_at ? 'Monitoring started ' + when(s.go_live_at) + '. Outlets never visited since then age from that moment.' : 'Not set: nothing ages and no alerts are raised.' }),
          form([field('Go-live (Pakistan time)', input('goLive', goLive, { type: 'datetime-local' })),
            h('label', { class: 'option' }, h('input', { type: 'checkbox', name: 'confirm' }), ' I understand this decides from when every outlet ages.')],
          'Save go-live', function (f) {
            var v = val(f, 'goLive');
            return call('adminSetGoLive', { goLiveAt: v ? v + ':00+05:00' : '', confirm: f.elements.confirm.checked });
          }, { done: function () { settings(); } })], { 'data-testid': 'go-live' }),
        card('Regions and territories', [table([{ label: 'Territory', key: 'name' }, { label: 'Region', render: function (t) {
            return form([h('div', { class: 'inline-form' }, input('rg-' + t.id, t.region, { name: 'region', 'aria-label': 'Region of ' + t.name, list: 'regions-list' }))], 'Save', function (f) {
              return call('adminSetRegion', { territory: t.name, region: f.elements.region.value.trim() });
            }, { ok: 'Saved.', cls: 'row-form' });
          } }, { label: 'Go-live (this territory)', render: function (t) {
            var cur = t.goLiveAt ? new Date(Date.parse(t.goLiveAt) + 5 * 3600000).toISOString().slice(0, 16) : '';
            return form([h('p', { class: 'small', 'data-testid': 'territory-live-' + t.name, text: t.goLiveAt ? 'Live since ' + when(t.goLiveAt) : s.go_live_at ? 'Uses the go-live above' : 'Not live' }),
              h('div', { class: 'inline-form' }, input('tl-' + t.id, cur, { name: 'tlive', type: 'datetime-local', 'aria-label': 'Go-live of ' + t.name })),
              h('label', { class: 'option small' }, h('input', { type: 'checkbox', name: 'tconfirm', 'aria-label': 'Confirm go-live of ' + t.name }), ' Confirm')],
              'Set go-live', function (f) {
                var v = f.elements.tlive.value;
                return call('adminSetTerritoryGoLive', { territory: t.name, goLiveAt: v ? v + ':00+05:00' : '', confirm: f.elements.tconfirm.checked });
              }, { done: function () { settings(); }, cls: 'row-form' });
          } }], d.territories, { testid: 'regions' }),
          h('p', { class: 'small quiet', text: 'A territory with its own go-live starts ageing from that moment; the others follow the go-live above (or stay not live).' }),
          h('datalist', { id: 'regions-list' }, Array.from(new Set(d.territories.map(function (t) { return t.region; }).filter(Boolean))).map(function (r) { return h('option', { value: r }); })),
          form([h('div', { class: 'grid-2' }, field('New territory', input('newTerritory', '')), field('Its region', input('newRegion', '')))], 'Add territory', function (f) {
            return call('adminAddTerritory', { name: val(f, 'newTerritory'), region: val(f, 'newRegion') });
          }, { done: function () { settings(); } })]),
        card('Verification rules (read-only)', h('dl', { class: 'kv' },
          [['Geofence radius', s.geofence_radius_m + ' m'], ['Best GPS accuracy that can pass automatically', s.gps_max_accuracy_m + ' m'], ['Worst usable accuracy (review)', s.gps_review_max_accuracy_m + ' m'],
            ['GPS attempts per visit', s.max_gps_attempts], ['Photo must be taken within', Math.round(s.photo_max_age_seconds / 60) + ' minutes'],
            ['Overdue / High priority / Critical', s.alert_overdue_days + ' / ' + s.alert_high_priority_days + ' / ' + s.alert_critical_days + ' days'],
            ['Login lockout', s.login_max_failures + ' wrong passwords → ' + s.login_lockout_minutes + ' minutes'], ['Signed in until', s.session_never_expires === true ? 'the person taps Sign out (or their password is reset / login suspended)' : Math.round(s.session_idle_minutes / 60) + ' hours unused']]
            .map(function (x) { return [h('dt', { text: x[0] }), h('dd', { text: String(x[1]) })]; }))),
        h('p', { class: 'small quiet', text: 'Changing a verification rule is a reviewed technical change (it changes what counts as a visit).' })]);
    }, 'settings');
  }
  function reference() {
    load('adminReferences', {}, function (d) {
      var file = h('input', { id: 'refFile', name: 'refFile', type: 'file', accept: 'image/png,image/jpeg', class: 'input' });
      var preview = h('div', { class: 'photo-box' });
      call('adminReferenceImage', {}).then(function (r) {
        add(preview, r.ok ? [h('img', { class: 'evidence', src: 'data:' + r.data.mime + ';base64,' + r.data.data, alt: 'Approved planogram reference' }), h('p', { class: 'small', text: 'Version ' + r.data.version + ': ' + r.data.description })] : msg('info', 'No approved reference yet.'));
      });
      frame('reference', [h('h1', { text: 'Planogram reference' }),
        h('div', { class: 'grid-2' }, card('Approved reference in use', preview),
          card('Upload a new version', form([field('Reference image (PNG or JPEG)', file),
            field('Shelf-by-shelf description (products only)', h('textarea', { id: 'refDesc', name: 'refDesc', class: 'input', rows: 3 }))], 'Upload as draft', function (f) {
            var fl = file.files[0];
            if (!fl) return Promise.resolve({ ok: false, error: 'Choose the reference image.' });
            return new Promise(function (resolve) { var rd = new FileReader(); rd.onload = function () { resolve(String(rd.result).split(',')[1]); }; rd.readAsDataURL(fl); })
              .then(function (b64) { return call('adminUploadReference', { image: b64, description: val(f, 'refDesc') }); });
          }, { done: function () { reference(); } }))),
        card('Versions', table([{ label: 'Version', key: 'version', num: true }, { label: 'Status', key: 'status' }, { label: 'Description', key: 'description' },
          { label: 'Uploaded', render: function (r) { return when(r.createdAt) + ' · ' + (r.createdBy || ''); } },
          { label: 'Approved', render: function (r) { return r.approvedAt ? when(r.approvedAt) + ' · ' + (r.approvedBy || '') : ''; } },
          { label: '', render: function (r) { return r.status === 'draft' ? actionButton('Approve', 'Approving…', function () { return call('adminApproveReference', { id: r.id }).then(function () { reference(); }); }, 'btn-sm') : ''; } }],
          d.references, { testid: 'references', empty: 'No reference uploaded yet.' }))]);
    }, 'reference');
  }
  function audit(query) {
    var rec = new URLSearchParams(query || '').get('record') || '';
    load('adminAudit', { entityId: rec, limit: 300 }, function (d) {
      frame('audit', [h('h1', { text: 'Audit log' }), h('p', { class: 'quiet', text: 'Every change, with who and when. It cannot be edited or deleted.' + (rec ? ' Showing one record.' : '') }),
        table([{ label: 'When', render: function (a) { return when(a.at); } }, { label: 'Who', key: 'actor' }, { label: 'Action', key: 'action' }, { label: 'Record', render: function (a) { return a.entity + ' ' + a.entityId; } },
          { label: 'Details', render: function (a) { return a.details ? h('code', { class: 'small', text: JSON.stringify(a.details).slice(0, 300) }) : ''; } }], d.audit, { testid: 'audit' })]);
    }, 'audit');
  }

  // ------------------------------------------------------------------ reports
  function reports() {
    load('adminReports', {}, function (d) {
      frame('reports', [h('h1', { text: 'Reports' }), h('p', { class: 'quiet', text: 'Each report opens with filters, then downloads as Excel or prints / saves as PDF.' }),
        h('ol', { class: 'report-list', 'data-testid': 'report-list' }, d.reports.map(function (r) {
          return h('li', null, h('a', { href: '#/admin/report/' + r.id }, h('strong', { text: r.title })), h('p', { class: 'small quiet', text: r.description + (r.asOfNow ? ' (as of now)' : '') }));
        }))]);
    }, 'reports');
  }
  var lastFilters = {};
  function reportPage(id, query, printMode) {
    var q = new URLSearchParams(query || '');
    var filters = {};
    ['from', 'to', 'region', 'territory', 'designation', 'outlet'].forEach(function (k) { if (q.get(k)) filters[k] = q.get(k); });
    Promise.all([call('adminReport', { id: id, filters: filters }), call('adminMonitor', { filters: { monitoredOnly: false } })]).then(function (rs) {
      var r = rs[0];
      if (!r.ok) { if (!U.common(r)) frame('reports', [h('a', { class: 'back', href: '#/admin/reports', text: 'Back to reports' }), msg('error', r.error, 'report-error')]); return; }
      var rep = r.data, opt = rs[1].ok ? rs[1].data.options : { regions: [], territories: [] }, outletRows = rs[1].ok ? rs[1].data.rows : [];
      var fmt = function (c, v) {
        if (v === null || v === undefined || v === '') return '';
        if (c.type === 'datetime') return when(v);
        if (c.type === 'num') return String(Math.round(Number(v) * 10) / 10);
        return String(v);
      };
      var cols = rep.columns.map(function (c) { return { label: c.label, num: c.type === 'int' || c.type === 'num', render: function (row) { return fmt(c, row[c.key]); } }; });
      var filterText = Object.keys(rep.filters).filter(function (k) { return rep.filters[k]; }).map(function (k) { return k + ': ' + rep.filters[k]; }).join(', ') || 'none';
      var summary = h('dl', { class: 'kv summary', 'data-testid': 'report-summary' }, rep.summary.map(function (s) { return [h('dt', { text: s.label }), h('dd', { class: 'num', text: String(s.value) })]; }));
      var recon = rep.reconciliation ? card('Check against the dashboard', table([{ label: 'Check', key: 'check' }, { label: 'Report', key: 'report', num: true }, { label: 'Dashboard', key: 'dashboard', num: true },
        { label: '', render: function (x) { return h('span', { class: 'badge ' + (x.matches ? 'lv-normal' : 'lv-critical'), text: x.matches ? 'OK' : 'Differs' }); } }], rep.reconciliation, { testid: 'reconciliation' })) : null;
      var head = [h('h1', { text: rep.report.no + '. ' + rep.report.title }), h('p', { class: 'quiet', text: rep.report.description }),
        h('p', { class: 'small', 'data-testid': 'report-meta', text: 'Generated ' + when(rep.generatedAt) + ' · Filters: ' + filterText + ' · ' + rep.rows.length + ' rows' + (rep.report.asOfNow ? ' · As of now (date range not used)' : rep.report.dateMeaning ? ' · Dates mean: ' + rep.report.dateMeaning : '') }),
        rep.note ? msg('info', rep.note) : null];
      if (printMode) {
        U.show(h('main', { class: 'print-page' }, h('div', { class: 'no-print' }, button('Print or save as PDF', function () { window.print(); }, 'btn-primary'), ' ', h('a', { href: '#/admin/report/' + id + (query ? '?' + query : ''), text: 'Back' })),
          h('p', { class: 'small', text: 'EBM Countertop Tracker' }), head, summary, table(cols, rep.rows, { testid: 'report-table' }), recon));
        return;
      }
      var defs = rep.report;
      var fform = h('form', { class: 'filters', onsubmit: function (e) {
        e.preventDefault();
        var p = new URLSearchParams();
        ['from', 'to', 'region', 'territory', 'designation', 'outlet'].forEach(function (k) { var v = fform.elements[k] && fform.elements[k].value; if (v) p.set(k, v); });
        U.go('#/admin/report/' + id + (p.toString() ? '?' + p.toString() : ''));
      } },
        defs.asOfNow ? null : [field('From', input('from', filters.from, { type: 'date' })), field('To', input('to', filters.to, { type: 'date' }))],
        field('Region', select('region', [['', 'Any']].concat(opt.regions.map(function (x) { return [x, x]; })), filters.region)),
        field('Territory', select('territory', [['', 'Any']].concat(opt.territories.map(function (x) { return [x, x]; })), filters.territory)),
        defs.asOfNow ? null : field('Designation of the visiting employee', select('designation', [['', 'Any']].concat(DESIG.slice(0, 7)), filters.designation)),
        field('Outlet', select('outlet', [['', 'Any']].concat(outletRows.map(function (o) { return [o.id, o.name + ' (' + o.code + ')']; })), filters.outlet)),
        h('div', { class: 'filter-actions' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Run report')));
      frame('reports', [h('a', { class: 'back', href: '#/admin/reports', text: 'Back to reports' }), head,
        h('details', { class: 'card', open: true }, h('summary', { text: 'Filters' }), fform),
        h('div', { class: 'head-actions' },
          button('Download Excel', function () {
            var info = [['Report', rep.report.no + '. ' + rep.report.title], ['Description', rep.report.description], ['Generated (Pakistan time)', when(rep.generatedAt)],
              ['Filters', filterText], ['Rows', rep.rows.length]].concat(rep.summary.map(function (s) { return [s.label, s.value]; }));
            if (rep.reconciliation) rep.reconciliation.forEach(function (x) { info.push([x.check, x.report + ' / ' + x.dashboard + (x.matches ? ' OK' : ' DIFFERS')]); });
            window.EBM_XLSX.download(window.EBM_XLSX.build({ title: rep.report.title, columns: rep.columns, rows: rep.rows, info: info }), 'ebm-' + rep.report.id + '-' + rep.generatedAt.slice(0, 10) + '.xlsx');
          }, 'btn-primary', { 'data-testid': 'report-excel' }),
          h('a', { class: 'btn btn-secondary', href: '#/admin/report-print/' + id + (query ? '?' + query : ''), 'data-testid': 'report-print', text: 'Print / save as PDF' })),
        card('Summary', summary), recon, table(cols, rep.rows, { testid: 'report-table', empty: 'No rows for these filters.' })]);
    });
  }

  // ------------------------------------------------------------------ router
  function route(hash) {
    ui();
    var m = /^#\/admin\/([^/?]+)(?:\/([^?]+))?(?:\?(.*))?$/.exec(hash) || [];
    var page = m[1] || 'dashboard', arg = m[2] ? decodeURIComponent(m[2]) : '', query = m[3] || '';
    var tab = new URLSearchParams(query).get('tab');
    switch (page) {
      case 'dashboard': return dashboard();
      case 'outlets': outlets(query); break;
      case 'outlet': outlet(arg); break;
      case 'outlet-new': outletNew(); break;
      case 'location': locationReviews(); break;
      case 'compliance': if (arg) complianceDecide(arg); else compliance(tab); break;
      case 'planogram-errors': planogramErrors(); break;
      case 'missing': missing(tab); break;
      case 'far': farFromRadius(); break;
      case 'people': people(); break;
      case 'person': person(arg); break;
      case 'settings': settings(); break;
      case 'reference': reference(); break;
      case 'audit': audit(query); break;
      case 'reports': reports(); break;
      case 'report': reportPage(arg, query, false); break;
      case 'report-print': reportPage(arg, query, true); break;
      default: U.go('#/admin/dashboard');
    }
    return null;
  }
  window.EBM_ADMIN = { route: route };
})();
