// app.js — static vanilla JS Cockpit widget. Reads the watchdog's aggregate
// state.json (0644, no secrets) and renders pidmax risk, host memory, active
// alerts, and a "watchdog stale" banner. No framework, no build.

(function () {
  'use strict';

  var STATE_PATH = '/var/lib/podman-watchdog/state.json';
  var REFRESH_MS = 5000;
  var STALE_FACTOR = 3; // stale if heartbeat older than 3 x fastTickSec

  function $(id) { return document.getElementById(id); }

  function fmtBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return 'n/a';
    var gib = bytes / (1024 * 1024 * 1024);
    if (gib >= 1) return gib.toFixed(2) + ' GiB';
    return (bytes / (1024 * 1024)).toFixed(0) + ' MiB';
  }

  function fmtPct(ratio) {
    if (ratio == null || isNaN(ratio)) return '—';
    return (ratio * 100).toFixed(1) + '%';
  }

  function sevClass(sev) {
    if (sev === 'crit') return 'sev-crit';
    if (sev === 'warn') return 'sev-warn';
    if (sev === 'exempt') return 'sev-exempt';
    return 'sev-ok';
  }

  function render(state) {
    var now = Date.now();
    var fastTickSec = state.fastTickSec || 5;
    var heartbeat = state.heartbeat || state.ts || 0;
    var ageSec = (now - heartbeat) / 1000;
    var stale = ageSec > fastTickSec * STALE_FACTOR;

    var dot = $('status-dot');
    dot.className = 'dot ' + (stale ? 'dot-stale' : 'dot-ok');
    $('heartbeat').textContent = 'updated ' + Math.round(ageSec) + 's ago';
    $('stale-banner').className = 'banner' + (stale ? '' : ' banner-hidden');

    // Host memory.
    var host = state.host || {};
    var ponr = state.earlyoom ? state.earlyoom.effectiveMemKillBytes : null;
    $('host-mem').innerHTML = ''
      + kv('MemAvailable', fmtBytes(host.memAvailable))
      + kv('MemTotal', fmtBytes(host.memTotal))
      + kv('SwapFree', fmtBytes(host.swapFree))
      + kv('PSI some avg10', host.psiSomeAvg10 != null ? host.psiSomeAvg10.toFixed(1) + '%' : 'n/a')
      + kv('earlyoom kill ~', fmtBytes(ponr));

    // Container pidmax table, worst first.
    var containers = (state.containers || []).slice().sort(function (a, b) {
      var ra = a.ratio == null ? -1 : a.ratio;
      var rb = b.ratio == null ? -1 : b.ratio;
      return rb - ra;
    });
    var tbody = $('pid-rows');
    tbody.innerHTML = '';
    if (containers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">no containers</td></tr>';
    }
    containers.forEach(function (c) {
      var tr = document.createElement('tr');
      var sev = c.exempt ? 'exempt' : (c.severity || 'ok');
      tr.className = sevClass(sev);
      tr.appendChild(td(c.name || c.id.slice(0, 12)));
      tr.appendChild(td(String(c.current)));
      tr.appendChild(td(c.max == null ? 'max' : String(c.max)));
      tr.appendChild(td(c.exempt ? 'exempt' : fmtPct(c.ratio)));
      tr.appendChild(td(sev));
      tbody.appendChild(tr);
    });

    // Active alerts.
    var alerts = state.activeAlerts || [];
    var ul = $('alerts');
    ul.innerHTML = '';
    if (alerts.length === 0) {
      ul.innerHTML = '<li class="muted">none</li>';
    }
    alerts.forEach(function (a) {
      var li = document.createElement('li');
      li.className = sevClass(a.severity);
      li.textContent = '[' + (a.severity || '?').toUpperCase() + '] ' + (a.name || a.entity) + ': ' + a.msg;
      ul.appendChild(li);
    });
  }

  function kv(label, value) {
    return '<span class="k">' + label + '</span><span class="v">' + value + '</span>';
  }
  function td(text) {
    var el = document.createElement('td');
    el.textContent = text;
    return el;
  }

  function showError(msg) {
    $('status-dot').className = 'dot dot-stale';
    $('heartbeat').textContent = msg;
    $('stale-banner').className = 'banner';
  }

  // Prefer the Cockpit file API (works for the logged-in PAM session); fall back
  // to a plain fetch when the widget is opened standalone for development.
  function load() {
    if (window.cockpit && cockpit.file) {
      cockpit.file(STATE_PATH).read()
        .then(function (content) {
          if (!content) { showError('state.json empty'); return; }
          render(JSON.parse(content));
        })
        .catch(function (err) {
          showError('cannot read state.json: ' + (err && err.message ? err.message : err));
        });
    } else {
      fetch(STATE_PATH)
        .then(function (r) { return r.json(); })
        .then(render)
        .catch(function (err) { showError('cannot fetch state.json: ' + err); });
    }
  }

  load();
  setInterval(load, REFRESH_MS);
}());
