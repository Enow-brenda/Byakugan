// Byakugan report behaviour. Inlined into the HTML by lib/reporter.js, so it has
// to be plain ES5-compatible script with no imports and no build step.
//
// Everything here is an enhancement: the report is fully readable with this file
// never executing. That is why the activation sequence, the layout and the graph
// fallback table are all done in CSS and HTML, and this file only adds motion,
// filtering and scoring on top.
//
// Model-written text is only ever placed with textContent, never innerHTML. The
// HTML arrives pre-escaped from the templates; nothing here re-interprets it.

(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function text(el) { return el ? String(el.textContent).trim() : ''; }

  function svg(name, attrs) {
    var node = document.createElementNS(SVG_NS, name);
    if (attrs) for (var key in attrs) if (attrs[key] != null) node.setAttribute(key, attrs[key]);
    return node;
  }

  var toastTimer = null;
  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2200);
  }

  // -- activation ----------------------------------------------------------
  // The overlay hides itself in CSS. This only adds the skip paths and makes sure
  // the element is really gone afterwards, so it cannot swallow a later click.
  (function activation() {
    var overlay = $('#activation');
    if (!overlay) return;

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      overlay.classList.add('is-done');
      document.removeEventListener('keydown', finish);
    }

    if (reduceMotion) { finish(); return; }
    overlay.addEventListener('click', finish);
    document.addEventListener('keydown', finish);
    setTimeout(finish, 3400);
  }());

  // -- theme ---------------------------------------------------------------
  (function theme() {
    var btn = $('#themeBtn');
    var root = document.documentElement;
    try {
      var saved = localStorage.getItem('byakugan-theme');
      if (saved === 'day' || saved === 'night') root.setAttribute('data-theme', saved);
    } catch (e) { /* private mode: keep the default */ }

    function label() {
      var night = root.getAttribute('data-theme') !== 'day';
      btn.setAttribute('aria-label', night ? 'Switch to the daytime theme' : 'Switch to the night theme');
    }
    label();

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'day' ? 'night' : 'day';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('byakugan-theme', next); } catch (e) { /* ignore */ }
      label();
      toast(next === 'day' ? 'Daytime Konoha' : 'Night vision');
    });
  }());

  // -- sidebar on narrow screens -------------------------------------------
  (function sidebar() {
    var rail = $('#rail');
    var scrim = $('#scrim');
    var toggle = $('#railToggle');
    if (!rail || !toggle) return;

    function setOpen(open) {
      rail.classList.toggle('is-open', open);
      if (scrim) scrim.classList.toggle('is-on', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () { setOpen(!rail.classList.contains('is-open')); });
    if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
    $$('.rail-link').forEach(function (link) {
      link.addEventListener('click', function () { if (window.innerWidth <= 980) setOpen(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });
  }());

  // -- rank progress -------------------------------------------------------
  (function progress() {
    var fill = $('#railProgress');
    if (!fill) return;
    var pct = Math.max(0, Math.min(100, Number(fill.getAttribute('data-pct')) || 0));
    setTimeout(function () { fill.style.width = pct + '%'; }, 2900);
  }());

  // -- scroll spy ----------------------------------------------------------
  (function spy() {
    var links = $$('[data-spy]');
    if (!links.length) return;
    var crumb = $('#topbarCrumb');
    var byId = {};
    var sections = [];
    links.forEach(function (link) {
      var id = link.getAttribute('data-spy');
      var target = document.getElementById(id);
      if (!target) return;
      byId[id] = link;
      sections.push(target);
    });

    function mark(id) {
      links.forEach(function (l) { l.classList.remove('is-active'); });
      var link = byId[id];
      if (link) link.classList.add('is-active');
      if (crumb) {
        var label = link && link.querySelector('.rail-link-label');
        crumb.textContent = label ? label.textContent : '';
      }
    }

    // The topmost section whose top has passed the sticky bar decides the state.
    function update() {
      var line = 90;
      var current = sections[0];
      for (var i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= line) current = sections[i];
      }
      if (current) mark(current.id);
    }

    var queued = false;
    window.addEventListener('scroll', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }, { passive: true });
    update();
  }());

  // -- chakra graph --------------------------------------------------------
  (function graph() {
    var canvas = $('#graphCanvas');
    if (!canvas) return;

    var data;
    try {
      data = JSON.parse($('#byakugan-graph').textContent || '{}');
    } catch (e) {
      canvas.innerHTML = '';
      return;
    }
    var nodes = (data && data.nodes) || [];
    if (!nodes.length) return;

    var edges = (data && data.edges) || [];
    var TYPE_COLOR = {
      module: 'var(--iris-1)',
      class: 'var(--r3)',
      function: 'var(--r2)',
      external: 'var(--chakra)'
    };

    var COL_W = 210;
    var ROW_H = 48;
    var PAD = 64;
    var SIZE = 17;

    // Column index per node, counting outward from the things nothing depends
    // on: an edge runs from an importer to what it imports, so the entry points
    // land in the first column and their libraries fan out to the right.
    //
    // This mirrors assignDepths() in lib/reporter.js on purpose. The browser
    // re-derives it so the picture can be redrawn without a server round-trip,
    // and the two must agree or a node would land in a different column than the
    // depth the table shows.
    function depths() {
      var parents = new Map();
      nodes.forEach(function (n) { parents.set(n.id, []); });
      edges.forEach(function (e) {
        if (parents.has(e.from) && parents.has(e.to)) parents.get(e.to).push(e.from);
      });

      var out = new Map();
      var walking = new Set();
      function walk(id) {
        if (out.has(id)) return out.get(id);
        if (walking.has(id)) return 0;
        walking.add(id);
        var deepest = -1;
        (parents.get(id) || []).forEach(function (parent) { deepest = Math.max(deepest, walk(parent)); });
        walking.delete(id);
        var value = deepest < 0 ? 0 : deepest + 1;
        out.set(id, value);
        return value;
      }
      nodes.forEach(function (n) { walk(n.id); });
      return out;
    }

    function layout() {
      var d = depths();
      var columns = new Map();
      nodes.forEach(function (n) {
        var col = d.get(n.id) || 0;
        if (!columns.has(col)) columns.set(col, []);
        columns.get(col).push(n);
      });
      // Busiest first inside a column: the eye lands on the important nodes.
      columns.forEach(function (list) {
        list.sort(function (a, b) { return (b.degree || 0) - (a.degree || 0); });
      });

      var keys = Array.from(columns.keys()).sort(function (a, b) { return a - b; });
      var tallest = 0;
      keys.forEach(function (k) { tallest = Math.max(tallest, columns.get(k).length); });
      var spanY = Math.max(1, tallest - 1) * ROW_H;

      keys.forEach(function (col) {
        var list = columns.get(col);
        var offset = (spanY - (list.length - 1) * ROW_H) / 2;
        list.forEach(function (n, i) {
          n.x = PAD + col * COL_W;
          n.y = PAD + offset + i * ROW_H;
        });
      });

      return {
        width: PAD * 2 + (keys.length - 1) * COL_W + SIZE,
        height: PAD * 2 + spanY + SIZE
      };
    }

    var box = layout();
    var scene = svg('svg', {
      viewBox: '0 0 ' + box.width + ' ' + box.height,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': 'Dependency graph with ' + nodes.length + ' nodes and ' + edges.length + ' edges. The table view below lists the same data.'
    });

    // The pinned node is marked in CSS with url(#nodeGlow), so the filter has to
    // live in the document. The graph svg is built here, not in a template, so
    // this defs block is built with it.
    var defs = svg('defs');
    var glow = svg('filter', { id: 'nodeGlow', x: '-80%', y: '-80%', width: '260%', height: '260%' });
    glow.appendChild(svg('feGaussianBlur', { stdDeviation: '3.2', result: 'blur' }));
    var merge = svg('feMerge');
    merge.appendChild(svg('feMergeNode', { in: 'blur' }));
    merge.appendChild(svg('feMergeNode', { in: 'SourceGraphic' }));
    glow.appendChild(merge);
    defs.appendChild(glow);
    scene.appendChild(defs);

    var root = svg('g', { class: 'scene' });
    scene.appendChild(root);

    var tip = $('#graphTip');
    var litNodes = new Set();
    var litEdges = new Set();
    var pinned = null;

    // Edges first so nodes always sit on top of their own lines.
    var edgeLayer = svg('g', { class: 'edges' });
    var pulseLayer = svg('g', { class: 'pulses' });
    var nodeLayer = svg('g', { class: 'nodes' });
    root.appendChild(edgeLayer);
    root.appendChild(pulseLayer);
    root.appendChild(nodeLayer);

    var at = new Map();
    nodes.forEach(function (n) { at.set(n.id, n); });
    var neighbours = new Map();
    nodes.forEach(function (n) { neighbours.set(n.id, new Set()); });
    edges.forEach(function (e) {
      if (!neighbours.has(e.from) || !neighbours.has(e.to)) return;
      neighbours.get(e.from).add(e.to);
      neighbours.get(e.to).add(e.from);
    });

    var KIND_COLOR = {
      imports: 'var(--iris-1)',
      calls: 'var(--r2)',
      extends: 'var(--r3)',
      implements: 'var(--r4)'
    };

    var edgeIndex = new Map();
    edges.forEach(function (e, i) {
      var a = at.get(e.from);
      var b = at.get(e.to);
      if (!a || !b) return;
      var x1 = a.x + SIZE / 2;
      var y1 = a.y;
      var x2 = b.x - SIZE / 2;
      var y2 = b.y;
      var bend = Math.max(28, (x2 - x1) / 2);
      var d = 'M' + x1 + ' ' + y1 + ' C' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + x2 + ' ' + y2;
      var path = svg('path', { class: 'gedge', d: d, stroke: KIND_COLOR[e.kind] || 'var(--iris-1)' });
      edgeLayer.appendChild(path);
      var pulse = svg('circle', { class: 'gpulse', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, r: 2 });
      var second = svg('circle', { class: 'gpulse', cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, r: 2 });
      pulseLayer.appendChild(pulse);
      pulseLayer.appendChild(second);
      edgeIndex.set(i, { path: path, pulses: [pulse, second] });
    });

    var nodeIndex = new Map();
    nodes.forEach(function (n) {
      var g = svg('g', { class: 'gnode', tabindex: '0', role: 'button' });
      g.appendChild(svg('rect', {
        class: 'gnode-shape',
        x: n.x - SIZE / 2, y: n.y - SIZE / 2, width: SIZE, height: SIZE,
        rx: n.type === 'function' ? SIZE / 2 : 4,
        fill: TYPE_COLOR[n.type] || 'var(--iris-1)',
        'fill-opacity': '0.22',
        stroke: TYPE_COLOR[n.type] || 'var(--iris-1)',
        'stroke-width': '1.7'
      }));
      var text = svg('text', { class: 'gnode-label', x: n.x + SIZE / 2 + 7, y: n.y + 3.5 });
      text.textContent = n.label;
      g.appendChild(text);
      nodeLayer.appendChild(g);
      nodeIndex.set(n.id, g);
    });

    function showTip(n, event) {
      if (!tip) return;
      tip.textContent = '';
      var name = document.createElement('div');
      name.className = 'graph-tip-name';
      name.textContent = n.label;
      tip.appendChild(name);
      [[n.type, n.file || 'no file', n.degree + ' link' + (n.degree === 1 ? '' : 's')]].forEach(function (row) {
        var line = document.createElement('div');
        line.className = 'graph-tip-row';
        var kind = document.createElement('span');
        kind.textContent = row[0];
        var val = document.createElement('span');
        val.textContent = row[1] + ' / ' + row[2];
        line.appendChild(kind);
        line.appendChild(val);
        tip.appendChild(line);
      });
      if (n.deps && n.deps.length) {
        var list = document.createElement('div');
        list.className = 'graph-tip-row';
        var text = document.createElement('span');
        text.textContent = 'flows to';
        var val = document.createElement('span');
        val.textContent = n.deps.slice(0, 3).map(function (d) { return d.label; }).join(', ')
          + (n.deps.length > 3 ? ' +' + (n.deps.length - 3) : '');
        list.appendChild(text);
        list.appendChild(val);
        tip.appendChild(list);
      }
      var rect = canvas.getBoundingClientRect();
      var x = event.clientX - rect.left + 16;
      var y = event.clientY - rect.top + 12;
      tip.style.left = Math.min(x, rect.width - 310) + 'px';
      tip.style.top = Math.min(y, rect.height - 120) + 'px';
      tip.classList.add('is-on');
    }

    function hideTip() { if (tip) tip.classList.remove('is-on'); }

    function applyFocus(id) {
      litNodes = new Set();
      litEdges = new Set();
      if (id == null) {
        canvas.classList.remove('is-focused');
      } else {
        litNodes.add(id);
        neighbours.get(id).forEach(function (other) { litNodes.add(other); });
        edges.forEach(function (e, i) {
          if (e.from === id || e.to === id) litEdges.add(i);
        });
        canvas.classList.add('is-focused');
      }
      nodeIndex.forEach(function (g, key) {
        g.classList.toggle('is-lit', litNodes.has(key));
        g.classList.toggle('is-pinned', key === pinned);
      });
      edgeIndex.forEach(function (edge, i) {
        var on = litEdges.has(i);
        edge.path.classList.toggle('is-lit', on);
        edge.pulses.forEach(function (pulse, k) {
          pulse.classList.toggle('is-lit', on && !reduceMotion);
          // Offsetting the twin pulse reads as flow rather than a blinking dot.
          if (on && !reduceMotion) pulse.style.animationDelay = (k * 0.95) + 's';
        });
      });
    }

    nodeIndex.forEach(function (g, id) {
      function enter(event) {
        applyFocus(pinned == null ? id : pinned);
        var node = at.get(id);
        if (node) showTip(node, event);
      }
      function leave() {
        applyFocus(pinned);
        hideTip();
      }
      g.addEventListener('mouseenter', enter);
      g.addEventListener('mousemove', enter);
      g.addEventListener('mouseleave', leave);
      g.addEventListener('focus', enter);
      g.addEventListener('blur', leave);
      g.addEventListener('click', function (event) {
        event.stopPropagation();
        pinned = pinned === id ? null : id;
        applyFocus(pinned);
        toast(pinned ? 'Pinned ' + (at.get(id) || {}).label : 'Unpinned');
      });
      g.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
    });

    scene.addEventListener('click', function () {
      if (pinned == null) return;
      pinned = null;
      applyFocus(null);
    });

    // -- pan and zoom -----------------------------------------------------
    var view = { x: 0, y: 0, k: 1 };
    function applyView() {
      root.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
    }
    function zoomTo(k, cx, cy) {
      var next = Math.max(0.35, Math.min(3.2, k));
      var rect = scene.getBoundingClientRect();
      var px = cx - rect.left;
      var py = cy - rect.top;
      view.x = px - (px - view.x) * (next / view.k);
      view.y = py - (py - view.y) * (next / view.k);
      view.k = next;
      applyView();
    }
    function reset() {
      view = { x: 0, y: 0, k: 1 };
      applyView();
      pinned = null;
      applyFocus(null);
    }

    var dragging = null;
    scene.addEventListener('pointerdown', function (event) {
      if (event.target.closest && event.target.closest('.gnode')) return;
      dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, vx: view.x, vy: view.y };
      scene.setPointerCapture(event.pointerId);
      scene.classList.add('is-panning');
    });
    scene.addEventListener('pointermove', function (event) {
      if (!dragging || dragging.id !== event.pointerId) return;
      view.x = dragging.vx + (event.clientX - dragging.x);
      view.y = dragging.vy + (event.clientY - dragging.y);
      applyView();
    });
    function endDrag(event) {
      if (!dragging || dragging.id !== event.pointerId) return;
      dragging = null;
      scene.classList.remove('is-panning');
    }
    scene.addEventListener('pointerup', endDrag);
    scene.addEventListener('pointercancel', endDrag);
    scene.addEventListener('wheel', function (event) {
      event.preventDefault();
      zoomTo(view.k * (event.deltaY < 0 ? 1.12 : 0.89), event.clientX, event.clientY);
    }, { passive: false });

    var resetBtn = $('#graphReset');
    if (resetBtn) resetBtn.addEventListener('click', function () { reset(); toast('View reset'); });

    canvas.appendChild(scene);

    // -- graph or table ---------------------------------------------------
    var graphBtn = $('#graphViewGraph');
    var tableBtn = $('#graphViewTable');
    var table = $('#graphTable');
    function showTable(on) {
      canvas.style.display = on ? 'none' : '';
      if (table) table.hidden = !on;
      if (graphBtn) graphBtn.setAttribute('aria-pressed', on ? 'false' : 'true');
      if (tableBtn) tableBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    if (graphBtn) graphBtn.addEventListener('click', function () { showTable(false); });
    if (tableBtn) tableBtn.addEventListener('click', function () { showTable(true); });
  }());

  // -- technique filters ---------------------------------------------------
  (function techniques() {
    var chips = $$('#techniques .chip');
    var cards = $$('#techniques .technique-card');
    var empty = $('#techniqueEmpty');
    if (!chips.length || !cards.length) return;

    function apply() {
      var wanted = chips.filter(function (c) { return c.getAttribute('aria-pressed') === 'true'; })
        .map(function (c) { return c.getAttribute('data-filter'); });
      var shown = 0;
      cards.forEach(function (card) {
        var sig = card.getAttribute('data-significance');
        var hit = wanted.length === 0 || wanted.indexOf('all') !== -1 || wanted.indexOf(sig) !== -1;
        card.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        chip.setAttribute('aria-pressed', 'true');
        apply();
      });
    });
  }());

  // -- file search and sorting ---------------------------------------------
  (function registry() {
    var table = $('#fileTable');
    var input = $('#search');
    var empty = $('#fileEmpty');
    if (!table) return;
    var body = table.tBodies[0];
    var rows = Array.prototype.slice.call(body.rows);
    var heads = $$('th.sortable', table);

    var COMPLEXITY_RANK = { low: 1, medium: 2, high: 3 };
    var sortKey = 'path';
    var sortDir = 1;

    // Column index comes from the header, not from a data attribute on the cell.
    // Keying off the header is what lets a template add or drop a column without
    // having to keep data-sort attributes in step with the th list.
    function columnIndex(key) {
      if (!table.tHead || !table.tHead.rows[0]) return 0;
      var heads = table.tHead.rows[0].cells;
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getAttribute('data-sort') === key) return i;
      }
      return 0;
    }

    function valueOf(row, key) {
      var cell = row.cells[columnIndex(key)];
      if (!cell) cell = row.cells[0];
      if (key === 'complexity') {
        // The cell holds a badge, a five-segment meter and a screen-reader
        // label, so its textContent is not the word "high". The template supplies
        // the bare value; the regex is only a fallback for a hand-written table.
        var word = String(cell.getAttribute('data-value') || '').trim().toLowerCase();
        if (!word) {
          var found = /high|medium|low/.exec(text(cell).toLowerCase());
          word = found ? found[0] : '';
        }
        return COMPLEXITY_RANK[word] || 0;
      }
      // A data-value wins over the visible text, because a cell can show a
      // formatted number ("1,024") while the sort needs the raw one.
      var raw = cell.getAttribute('data-value') || cell.textContent;
      if (key === 'lines') return Number(String(raw).replace(/[^0-9.-]/g, '')) || 0;
      // Case-insensitive: file paths are not code points, and "README.md"
      // sorting after "package.json" reads as a bug to anyone who has seen a
      // directory listing.
      return String(raw).trim().toLowerCase();
    }

    function resort() {
      rows.sort(function (a, b) {
        var x = valueOf(a, sortKey);
        var y = valueOf(b, sortKey);
        if (x < y) return -1 * sortDir;
        if (x > y) return 1 * sortDir;
        return 0;
      });
      rows.forEach(function (row) { body.appendChild(row); });
      heads.forEach(function (h) {
        h.classList.remove('asc', 'desc');
        if (h.getAttribute('data-sort') === sortKey) {
          h.classList.add(sortDir === 1 ? 'asc' : 'desc');
        }
      });
    }

    heads.forEach(function (head) {
      head.addEventListener('click', function () {
        var key = head.getAttribute('data-sort');
        if (key === sortKey) sortDir = -sortDir;
        else { sortKey = key; sortDir = 1; }
        resort();
      });
      head.tabIndex = 0;
      head.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          head.click();
        }
      });
    });

    function applySearch() {
      var term = (input && input.value ? input.value : '').trim().toLowerCase();
      var shown = 0;
      rows.forEach(function (row) {
        var hit = term === '' || row.textContent.toLowerCase().indexOf(term) !== -1;
        row.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    if (input) input.addEventListener('input', applySearch);

    // "/" focuses the filter, the way every code tool does it.
    document.addEventListener('keydown', function (event) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    });

    resort();
  }());

  // -- copy buttons --------------------------------------------------------
  (function copying() {
    document.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('.copy-btn');
      if (!btn) return;
      var value = btn.getAttribute('data-copy') || '';
      if (!navigator.clipboard) { toast('Copy is unavailable here'); return; }
      navigator.clipboard.writeText(value).then(function () {
        toast('Copied ' + value);
      }, function () {
        toast('Copy was blocked');
      });
    });
  }());

  // -- the dojo ------------------------------------------------------------
  (function dojo() {
    var items = $$('.quiz-item');
    var scored = items.filter(function (item) { return item.querySelector('.quiz-options'); });
    if (!scored.length) return;

    var totalEl = $('#dojoTotal');
    var scoreEl = $('#dojoScore');
    var fillEl = $('#dojoFill');
    var streakEl = $('#dojoStreak');
    var stamp = $('#dojoStamp');
    var rankEl = $('#dojoRank');
    var verdictEl = $('#dojoVerdict');
    if (totalEl) totalEl.textContent = scored.length;

    var score = 0;
    var streak = 0;
    var best = 0;
    var done = 0;

    function progress() {
      if (scoreEl) scoreEl.textContent = score;
      if (fillEl) fillEl.style.width = (scored.length ? (score / scored.length) * 100 : 0) + '%';
      if (streakEl) streakEl.textContent = best > 1 ? 'Best run ' + best : '';
    }

    function verdict() {
      if (!stamp) return;
      var ratio = score / scored.length;
      var line = ratio === 1
        ? 'Every answer correct. The Byakugan sees through this codebase now.'
        : ratio >= 0.8
          ? 'Strong showing. The weak points are the last ones standing.'
          : ratio >= 0.5
            ? 'Half the scroll is legible. The rest is worth another pass.'
            : 'The village is still unfamiliar. Read the dossier, then return.';
      if (verdictEl) verdictEl.textContent = line;
      stamp.classList.add('is-on');
    }

    scored.forEach(function (item) {
      var want = (item.getAttribute('data-correct') || '').trim().toUpperCase();
      var opts = $$('.quiz-opt', item);
      var feedback = $('.quiz-feedback', item);

      function choose(opt) {
        if (item.classList.contains('is-answered')) return;
        var letter = (opt.getAttribute('data-letter') || '').trim().toUpperCase();
        item.classList.add('is-answered');
        done++;
        opts.forEach(function (other) {
          other.tabIndex = -1;
          var pick = (other.getAttribute('data-letter') || '').trim().toUpperCase();
          if (pick === want) other.classList.add('selected-correct');
          else if (other === opt) other.classList.add('selected-wrong');
        });
        if (letter === want) { score++; streak++; best = Math.max(best, streak); }
        else streak = 0;
        if (feedback) feedback.style.display = 'block';
        progress();
        if (done === scored.length) verdict();
      }

      opts.forEach(function (opt) {
        opt.addEventListener('click', function () { choose(opt); });
        opt.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(opt);
          }
        });
      });
    });

    progress();
  }());

  // -- command palette -----------------------------------------------------
  (function palette() {
    var box = $('#palette');
    var input = $('#paletteInput');
    var list = $('#paletteList');
    var emptyMsg = $('#paletteEmpty');
    var btn = $('#paletteBtn');
    if (!box || !input || !list) return;

    var commands = [
      { label: 'Back to top', hint: 'home', run: function () { window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); } },
      { label: 'Switch theme', hint: 'night / day', run: function () { var b = $('#themeBtn'); if (b) b.click(); } },
      { label: 'Show graph as table', hint: 'chakra', run: function () { var b = $('#graphViewTable'); if (b) b.click(); } },
      { label: 'Show graph as graph', hint: 'chakra', run: function () { var b = $('#graphViewGraph'); if (b) b.click(); } },
      { label: 'Reset graph view', hint: 'chakra', run: function () { var b = $('#graphReset'); if (b) b.click(); } },
      { label: 'Print or save as PDF', hint: 'ctrl P', run: function () { window.print(); } }
    ];

    var sections = $$('.rail-link').map(function (link) {
      var label = link.querySelector('.rail-link-label');
      return {
        label: label ? label.textContent : link.textContent,
        hint: 'section',
        run: function () {
          var target = document.getElementById(link.getAttribute('data-spy'));
          if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      };
    });

    var items = sections.concat(commands);
    var filtered = items.slice();
    var selected = 0;

    function render() {
      list.textContent = '';
      filtered.forEach(function (item, i) {
        var li = document.createElement('li');
        li.className = 'palette-item' + (i === selected ? ' is-sel' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', i === selected ? 'true' : 'false');
        var text = document.createElement('span');
        text.textContent = item.label;
        var hint = document.createElement('small');
        hint.textContent = item.hint;
        li.appendChild(text);
        li.appendChild(hint);
        li.addEventListener('click', function () { close(); item.run(); });
        list.appendChild(li);
      });
      if (emptyMsg) emptyMsg.style.display = filtered.length ? 'none' : 'block';
    }

    function filter() {
      var term = input.value.trim().toLowerCase();
      filtered = items.filter(function (item) {
        return term === '' || item.label.toLowerCase().indexOf(term) !== -1;
      });
      selected = 0;
      render();
    }

    function open() {
      box.classList.add('is-on');
      input.value = '';
      filter();
      input.focus();
    }
    function close() {
      box.classList.remove('is-on');
      if (btn) btn.focus();
    }

    function move(delta) {
      if (!filtered.length) return;
      selected = (selected + delta + filtered.length) % filtered.length;
      render();
      var sel = list.children[selected];
      if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
    }

    if (btn) btn.addEventListener('click', open);
    box.addEventListener('click', function (event) { if (event.target === box) close(); });
    input.addEventListener('input', filter);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        var pick = filtered[selected];
        if (pick) { close(); pick.run(); }
      } else if (event.key === 'Escape') { event.preventDefault(); close(); }
    });

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        box.classList.contains('is-on') ? close() : open();
      }
    });
  }());
}());
