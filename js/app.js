(() => {
  const THEME_KEY = 'fishlog-theme';
  const API_BASE = '/api/catches';

  const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4',
                   '--series-5', '--series-6', '--series-7', '--series-8'];

  const root = getComputedStyle(document.documentElement);
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || root.getPropertyValue(name).trim();
  }

  let catches = [];

  // ---------- API ----------
  async function fetchCatches() {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error('Failed to load catches');
    catches = await res.json();
  }

  async function createCatch(entry) {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error('Failed to save catch');
    return res.json();
  }

  async function deleteCatch(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete catch');
  }

  async function updateCatch(id, entry) {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error('Failed to update catch');
  }

  // ---------- theme ----------
  const themeToggle = document.getElementById('themeToggle');
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) applyTheme(savedTheme);
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    render();
  });

  // ---------- tabs ----------
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  function showTab(name) {
    tabBtns.forEach(b => {
      const active = b.dataset.tab === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    });
    panels.forEach(p => p.classList.toggle('active', p.id === name));
    if (name === 'catches') renderCatchesTable();
    if (name === 'dashboard') renderDashboard();
  }
  tabBtns.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.getElementById('emptyStateCta').addEventListener('click', () => showTab('log'));

  // ---------- form ----------
  const form = document.getElementById('catchForm');
  const formMsg = document.getElementById('formMsg');
  document.getElementById('fDate').valueAsDate = new Date();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const entry = {
      species: document.getElementById('fSpecies').value.trim(),
      date: document.getElementById('fDate').value,
      weight_kg: parseFloat(document.getElementById('fWeight').value) || null,
      length_cm: parseFloat(document.getElementById('fLength').value) || null,
      location: document.getElementById('fLocation').value.trim(),
      bait: document.getElementById('fBait').value.trim(),
      notes: document.getElementById('fNotes').value.trim(),
    };
    if (!entry.species || !entry.date) return;

    await createCatch(entry);
    form.reset();
    document.getElementById('fDate').valueAsDate = new Date();
    formMsg.textContent = `Saved: ${entry.species} on ${entry.date}`;
    setTimeout(() => (formMsg.textContent = ''), 3000);
    await fetchCatches();
    updateDatalists();
    render();
  });

  function updateDatalists() {
    const species = [...new Set(catches.map(c => c.species).filter(Boolean))].sort();
    const locations = [...new Set(catches.map(c => c.location).filter(Boolean))].sort();
    document.getElementById('speciesList').innerHTML = species.map(s => `<option value="${escapeHtml(s)}">`).join('');
    document.getElementById('locationList').innerHTML = locations.map(l => `<option value="${escapeHtml(l)}">`).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    const empty = catches.length === 0;
    document.getElementById('emptyState').hidden = !empty;
    document.getElementById('dashboardContent').style.display = empty ? 'none' : '';
    if (empty) return;

    renderStatTiles();
    renderSpeciesChart();
    renderTimeChart();
    renderBestsTable();
  }

  function renderStatTiles() {
    const total = catches.length;
    const totalWeight = catches.reduce((s, c) => s + (c.weight_kg || 0), 0);
    const withWeight = catches.filter(c => c.weight_kg != null);
    const biggest = withWeight.length ? withWeight.reduce((a, b) => (b.weight_kg > a.weight_kg ? b : a)) : null;
    const uniqueSpecies = new Set(catches.map(c => c.species)).size;
    const locationCounts = {};
    catches.forEach(c => { if (c.location) locationCounts[c.location] = (locationCounts[c.location] || 0) + 1; });
    const topLocation = Object.entries(locationCounts).sort((a, b) => b[1] - a[1])[0];

    const tiles = [
      { label: 'Total catches', value: total },
      { label: 'Unique species', value: uniqueSpecies },
      { label: 'Total weight', value: totalWeight ? `${totalWeight.toFixed(1)} kg` : '—' },
      { label: 'Biggest catch', value: biggest ? `${biggest.weight_kg} kg` : '—', sub: biggest ? biggest.species : '' },
      { label: 'Top spot', value: topLocation ? topLocation[0] : '—', sub: topLocation ? `${topLocation[1]} catch${topLocation[1] === 1 ? '' : 'es'}` : '' },
    ];

    document.getElementById('statGrid').innerHTML = tiles.map(t => `
      <div class="stat-tile">
        <div class="stat-label">${t.label}</div>
        <div class="stat-value">${escapeHtml(String(t.value))}</div>
        ${t.sub ? `<div class="stat-sub">${escapeHtml(t.sub)}</div>` : ''}
      </div>
    `).join('');
  }

  function getTooltip(container) {
    let tip = container.querySelector('.chart-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'chart-tooltip';
      container.appendChild(tip);
    }
    return tip;
  }

  function showTooltip(container, tip, x, y, html) {
    tip.innerHTML = html;
    tip.style.left = x + 'px';
    tip.style.top = (y - 8) + 'px';
    tip.classList.add('visible');
  }
  function hideTooltip(tip) { tip.classList.remove('visible'); }

  function renderSpeciesChart() {
    const counts = {};
    catches.forEach(c => { counts[c.species] = (counts[c.species] || 0) + 1; });
    let entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    let bars = entries.slice(0, 7);
    const rest = entries.slice(7);
    if (rest.length) {
      const otherTotal = rest.reduce((s, [, v]) => s + v, 0);
      bars.push(['Other', otherTotal]);
    }

    const colorFor = (i, name) => name === 'Other' ? cssVar('--text-muted') : cssVar(SERIES[i % SERIES.length]);

    const width = 480, rowH = 28, padTop = 8, padBottom = 8, labelW = 110;
    const height = padTop + padBottom + bars.length * rowH;
    const maxVal = Math.max(...bars.map(b => b[1]), 1);
    const chartW = width - labelW - 40;

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Catches by species">`;
    bars.forEach(([name, val], i) => {
      const y = padTop + i * rowH;
      const barW = Math.max((val / maxVal) * chartW, 4);
      const color = colorFor(i, name);
      svg += `
        <text x="${labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="axis-label">${escapeHtml(name)}</text>
        <rect class="bar-rect" data-name="${escapeHtml(name)}" data-val="${val}"
          x="${labelW}" y="${y + 5}" width="${barW}" height="18" rx="4" ry="4" fill="${color}"></rect>
        <text x="${labelW + barW + 6}" y="${y + rowH / 2 + 4}" class="bar-label">${val}</text>
      `;
    });
    svg += `</svg>`;

    const wrap = document.getElementById('speciesChart');
    wrap.classList.add('chart-svg-wrap');
    wrap.innerHTML = svg;
    const tip = getTooltip(wrap);

    wrap.querySelectorAll('.bar-rect').forEach(rect => {
      rect.addEventListener('mouseenter', (e) => {
        const box = wrap.getBoundingClientRect();
        const r = rect.getBoundingClientRect();
        showTooltip(wrap, tip, r.left - box.left + r.width / 2, r.top - box.top,
          `<strong>${escapeHtml(rect.dataset.name)}</strong>: ${rect.dataset.val} catch${rect.dataset.val === '1' ? '' : 'es'}`);
      });
      rect.addEventListener('mouseleave', () => hideTooltip(tip));
    });

    document.getElementById('speciesLegend').innerHTML = bars.map(([name], i) => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${colorFor(i, name)}"></span>${escapeHtml(name)}
      </div>
    `).join('');
  }

  function renderTimeChart() {
    const monthCounts = {};
    catches.forEach(c => {
      if (!c.date) return;
      const key = c.date.slice(0, 7); // YYYY-MM
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    const months = Object.keys(monthCounts).sort();
    const wrap = document.getElementById('timeChart');
    wrap.classList.add('chart-svg-wrap');

    if (months.length < 2) {
      wrap.innerHTML = `<p class="stat-sub" style="padding:20px 0;">Log catches across more months to see a trend line.</p>`;
      return;
    }

    const width = 480, height = 200;
    const padL = 30, padR = 10, padT = 14, padB = 24;
    const chartW = width - padL - padR, chartH = height - padT - padB;
    const maxVal = Math.max(...months.map(m => monthCounts[m]), 1);

    const points = months.map((m, i) => {
      const x = padL + (i / (months.length - 1)) * chartW;
      const y = padT + chartH - (monthCounts[m] / maxVal) * chartH;
      return { m, x, y, v: monthCounts[m] };
    });

    const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const color = cssVar('--series-1');

    const gridLines = [0, 0.5, 1].map(f => {
      const y = padT + chartH * f;
      return `<line class="grid-line" x1="${padL}" x2="${width - padR}" y1="${y}" y2="${y}"></line>`;
    }).join('');

    const step = Math.max(1, Math.ceil(months.length / 6));
    const labels = points.filter((_, i) => i % step === 0 || i === points.length - 1).map(p =>
      `<text x="${p.x}" y="${height - 6}" text-anchor="middle" class="axis-label">${formatMonth(p.m)}</text>`
    ).join('');

    const dots = points.map(p =>
      `<circle class="line-dot" data-m="${p.m}" data-v="${p.v}" cx="${p.x}" cy="${p.y}" r="4" fill="${color}" stroke="var(--surface-1)" stroke-width="1.5"></circle>`
    ).join('');

    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Catches over time">
      ${gridLines}
      <line class="baseline" x1="${padL}" x2="${width - padR}" y1="${padT + chartH}" y2="${padT + chartH}"></line>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      ${dots}
      ${labels}
    </svg>`;

    wrap.innerHTML = svg;
    const tip = getTooltip(wrap);
    wrap.querySelectorAll('.line-dot').forEach(dot => {
      dot.addEventListener('mouseenter', () => {
        const box = wrap.getBoundingClientRect();
        const r = dot.getBoundingClientRect();
        showTooltip(wrap, tip, r.left - box.left + r.width / 2, r.top - box.top,
          `<strong>${formatMonth(dot.dataset.m)}</strong>: ${dot.dataset.v} catch${dot.dataset.v === '1' ? '' : 'es'}`);
      });
      dot.addEventListener('mouseleave', () => hideTooltip(tip));
    });
  }

  function formatMonth(key) {
    const [y, m] = key.split('-');
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  function renderBestsTable() {
    const bySpecies = {};
    catches.forEach(c => {
      const s = c.species;
      if (!bySpecies[s]) bySpecies[s] = { count: 0, heaviest: null, longest: null };
      bySpecies[s].count++;
      if (c.weight_kg != null && (!bySpecies[s].heaviest || c.weight_kg > bySpecies[s].heaviest)) bySpecies[s].heaviest = c.weight_kg;
      if (c.length_cm != null && (!bySpecies[s].longest || c.length_cm > bySpecies[s].longest)) bySpecies[s].longest = c.length_cm;
    });
    const rows = Object.entries(bySpecies).sort((a, b) => b[1].count - a[1].count);

    document.querySelector('#bestsTable tbody').innerHTML = rows.map(([species, d]) => `
      <tr>
        <td>${escapeHtml(species)}</td>
        <td>${d.heaviest != null ? d.heaviest + ' kg' : '—'}</td>
        <td>${d.longest != null ? d.longest + ' cm' : '—'}</td>
        <td>${d.count}</td>
      </tr>
    `).join('');
  }

  // ---------- edit dialog ----------
  const editDialog = document.getElementById('editDialog');
  const editForm = document.getElementById('editForm');
  document.getElementById('editCancel').addEventListener('click', () => editDialog.close());

  function openEditDialog(id) {
    const c = catches.find(c => String(c.id) === String(id));
    if (!c) return;
    document.getElementById('eId').value = c.id;
    document.getElementById('eSpecies').value = c.species || '';
    document.getElementById('eDate').value = c.date || '';
    document.getElementById('eWeight').value = c.weight_kg ?? '';
    document.getElementById('eLength').value = c.length_cm ?? '';
    document.getElementById('eLocation').value = c.location || '';
    document.getElementById('eBait').value = c.bait || '';
    document.getElementById('eNotes').value = c.notes || '';
    editDialog.showModal();
  }

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('eId').value;
    const entry = {
      species: document.getElementById('eSpecies').value.trim(),
      date: document.getElementById('eDate').value,
      weight_kg: parseFloat(document.getElementById('eWeight').value) || null,
      length_cm: parseFloat(document.getElementById('eLength').value) || null,
      location: document.getElementById('eLocation').value.trim(),
      bait: document.getElementById('eBait').value.trim(),
      notes: document.getElementById('eNotes').value.trim(),
    };
    if (!entry.species || !entry.date) return;

    await updateCatch(id, entry);
    editDialog.close();
    await fetchCatches();
    updateDatalists();
    render();
  });

  // ---------- catches table ----------
  const searchInput = document.getElementById('searchInput');
  const sortSelect = document.getElementById('sortSelect');
  searchInput.addEventListener('input', renderCatchesTable);
  sortSelect.addEventListener('change', renderCatchesTable);

  function renderCatchesTable() {
    const q = searchInput.value.trim().toLowerCase();
    let rows = catches.filter(c =>
      !q || [c.species, c.location, c.notes, c.bait].join(' ').toLowerCase().includes(q)
    );

    const sortMode = sortSelect.value;
    const sorters = {
      'date-desc': (a, b) => b.date.localeCompare(a.date),
      'date-asc': (a, b) => a.date.localeCompare(b.date),
      'weight-desc': (a, b) => (b.weight_kg || 0) - (a.weight_kg || 0),
      'length-desc': (a, b) => (b.length_cm || 0) - (a.length_cm || 0),
    };
    rows = rows.slice().sort(sorters[sortMode]);

    const tbody = document.querySelector('#catchesTable tbody');
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="stat-sub">No catches match.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => `
      <tr>
        <td>${escapeHtml(c.date)}</td>
        <td>${escapeHtml(c.species)}</td>
        <td>${c.weight_kg != null ? c.weight_kg + ' kg' : '—'}</td>
        <td>${c.length_cm != null ? c.length_cm + ' cm' : '—'}</td>
        <td>${escapeHtml(c.location) || '—'}</td>
        <td>${escapeHtml(c.bait) || '—'}</td>
        <td><button class="btn-edit" data-id="${c.id}">Edit</button></td>
        <td><button class="btn-delete" data-id="${c.id}">Delete</button></td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => openEditDialog(btn.dataset.id));
    });

    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        await deleteCatch(btn.dataset.id);
        await fetchCatches();
        updateDatalists();
        render();
      });
    });
  }

  // ---------- init ----------
  function render() {
    renderDashboard();
    renderCatchesTable();
  }

  (async () => {
    await fetchCatches();
    updateDatalists();
    render();
  })();
})();
