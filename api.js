/* Talking to the Apps Script back end.
 * Requests are POSTed as text/plain so the browser sends them directly (Apps Script cannot answer
 * a CORS preflight). Google answers with a redirect to googleusercontent.com, which fetch follows.
 */
(function () {
  'use strict';
  var TOKEN_KEY = 'ebm.token';
  var TIMEOUT_MS = 90000;

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ } }

  /** Result: {ok:true,data} | {ok:false,error,code,network?:true}. Never throws. */
  function call(action, payload) {
    if (/REPLACE_WITH/.test(window.EBM_CONFIG.API_URL)) {
      return Promise.resolve({ ok: false, code: 503, error: 'This copy of the app is not connected yet: put the Apps Script web-app address into config.js.' });
    }
    busy(1);
    var body = Object.assign({}, payload || {}, { action: action, token: getToken() });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(window.EBM_CONFIG.API_URL, {
      method: 'POST', redirect: 'follow', cache: 'no-store', credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var json;
        try { json = JSON.parse(text); } catch (e) { json = null; }
        if (!json || typeof json.ok !== 'boolean') {
          return { ok: false, network: true, code: 502, error: 'The system did not answer properly. Try again in a minute. Nothing you already sent is lost.' };
        }
        if (!json.ok && json.code === 401) setToken('');
        return json;
      });
    }, function () {
      return { ok: false, network: true, code: 0, error: networkMessage(action) };
    }).finally(function () { if (timer) clearTimeout(timer); busy(-1); });
  }

  /** A thin moving bar at the top while the app waits for the server. */
  var pending = 0;
  function busy(d) {
    pending = Math.max(0, pending + d);
    var bar = document.getElementById('busy');
    if (!bar) { bar = document.createElement('div'); bar.id = 'busy'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Loading'); document.body.appendChild(bar); }
    bar.hidden = pending === 0;
  }

  /** What to tell the user when a request got no answer: depends on what they were doing. */
  function networkMessage(action) {
    var offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (action === 'submitFascia' || action === 'submitCountertop') {
      return offline ? 'No connection. Move to a place with mobile signal and tap Send again. It will not be counted twice.'
        : 'The connection was too slow to confirm this was saved. Tap Send again. It will not be counted twice.';
    }
    if (action === 'startVisit') {
      return (offline ? 'No connection. ' : 'The connection was too slow. ') + 'Tap Start visit again; it will not start a second visit.';
    }
    return offline ? 'No connection. Move to a place with mobile signal and try again.' : 'The system could not be reached. Check your connection and try again.';
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  window.EBM_API = { call: call, getToken: getToken, setToken: setToken, uuid: uuid };
})();
