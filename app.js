const state = {
  records: [],
  currentMile: null,
  minMile: null,
  maxMile: null,
  selectedAssetId: null,
};

const requiredColumns = [
  'Asset Start Mileage',
  'Asset End Mileage',
  'Structured Plant Number',
  'Asset Desc 2',
];

const ignoredTypes = new Set(['BOUNDARY: UP', 'BOUNDARY: DOWN']);
const colorByType = new Map();
const palette = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#fb7185', '#60a5fa', '#f97316', '#84cc16'];

const fileInput = document.getElementById('fileInput');
const sampleBtn = document.getElementById('sampleBtn');
const directionSelect = document.getElementById('directionSelect');
const assetTypeFilter = document.getElementById('assetTypeFilter');
const resetBtn = document.getElementById('resetBtn');
const prevBtn = document.getElementById('prevMile');
const nextBtn = document.getElementById('nextMile');
const mileLabel = document.getElementById('mileLabel');
const mileJumpInput = document.getElementById('mileJumpInput');
const jumpBtn = document.getElementById('jumpBtn');
const statusText = document.getElementById('statusText');
const summary = document.getElementById('summary');
const timeline = document.getElementById('timeline');
const progressModal = document.getElementById('progressModal');
const progressMessage = document.getElementById('progressMessage');
const progressBar = document.getElementById('progressBar');

let progressHideTimer = null;

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  showProgress('Opening file…', 10);
  try {
    const rows = await readFileRows(file);
    showProgress('Validating rows…', 60);
    await nextPaint();
    loadRows(rows, file.name);
    showProgress('Done', 100);
    hideProgressSoon();
  } catch (error) {
    setStatus(`Unable to read file: ${error?.message || 'unknown error'}`);
    progressModal.classList.add('hidden');
  }
});

sampleBtn.addEventListener('click', async () => {
  showProgress('Loading sample dataset…', 25);
  await nextPaint();
  const sampleText = `ignore row\nRoute\tIMDM\tEngineer\tSection Manager\tAsset Class Code & Desc\tItem Name Code & Desc\tEGI Code & Desc\tAsset Number\tAsset Desc 1\tAsset Desc 2\tStructured Plant Number\tMileage From\tMileage to\tTotal Yards\tStrategic Route Code & Desc\tAsset Position\tELR\tTrack ID\tAsset Start Mileage\tAsset End Mileage\tAsset Status
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659077\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2UP 019.1620:019.1660BD01\t019.1620\t019.1660\t40\tH.10\tRS\tMVN2\t\t019.1620\t019.1710\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659080\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2UP 020.1220:020.1320BD01\t020.1220\t020.1320\t100\tH.10\tRS\tMVN2\t\t020.1220\t020.1280\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659086\tLITTLEBOROUGH\tBOUNDARY: PALISADE\tMVN2DOWN 015.0060:015.0150BD01\t015.0060\t015.0150\t90\tH.10\tLS\tMVN2\t\t015.0060\t015.0120\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659088\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2DOWN 015.0170:015.0220BD01\t015.0170\t015.0220\t50\tH.10\tLS\tMVN2\t\t015.0170\t015.0220\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659115\tLITTLEBOROUGH\tBOUNDARY: UP\tMVN2UP 020.1400:020.1500BD01\t020.1400\t020.1500\t100\tH.10\tRS\tMVN2\t\t020.1400\t020.1500\tFM`;
  const rows = sampleText.split('\n').map((line) => line.split('\t'));
  showProgress('Rendering sample data…', 85);
  await nextPaint();
  loadRows(rows, 'sample dataset');
  showProgress('Done', 100);
  hideProgressSoon();
});

directionSelect.addEventListener('change', render);
assetTypeFilter.addEventListener('input', render);
resetBtn.addEventListener('click', resetFilters);
prevBtn.addEventListener('click', () => moveMile(-1));
nextBtn.addEventListener('click', () => moveMile(1));
jumpBtn.addEventListener('click', jumpToMile);
mileJumpInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    jumpToMile();
  }
});
timeline.addEventListener('click', onTimelineClick);

function onTimelineClick(event) {
  const seg = event.target.closest('.seg');
  if (!seg) return;
  state.selectedAssetId = seg.dataset.assetId;
  render();
}

function resetFilters() {
  directionSelect.value = 'ALL';
  assetTypeFilter.value = '';
  render();
}

function jumpToMile() {
  if (state.currentMile === null) return;
  const target = Number.parseInt(mileJumpInput.value, 10);
  if (!Number.isFinite(target)) {
    setStatus('Enter a valid whole mile number to jump.');
    return;
  }
  if (target < state.minMile || target > state.maxMile) {
    setStatus(`Mile must be between ${state.minMile} and ${state.maxMile}.`);
    return;
  }
  state.currentMile = target;
  render();
}

function moveMile(delta) {
  if (state.currentMile === null) return;
  const next = state.currentMile + delta;
  if (next < state.minMile || next > state.maxMile) return;
  state.currentMile = next;
  render();
}

function loadRows(rows, sourceLabel = 'file') {
  const headers = rows[1]?.map((h) => (h || '').trim()) || [];
  const missing = requiredColumns.filter((col) => !headers.includes(col));
  if (missing.length) {
    alert(`Missing required columns in row 2: ${missing.join(', ')}`);
    return;
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const parsed = rows
    .slice(2)
    .map((r, index) => {
      const type = (r[idx['Asset Desc 2']] || 'Unknown').trim();
      const start = parseMileage(r[idx['Asset Start Mileage']]);
      const end = parseMileage(r[idx['Asset End Mileage']]);
      return {
        id: `asset-${index}`,
        type,
        start,
        end,
        direction: parseDirection(r[idx['Structured Plant Number']]),
        rawPlant: (r[idx['Structured Plant Number']] || '').trim(),
        assetNumber: (r[idx['Asset Number']] || '').trim(),
        assetDesc1: (r[idx['Asset Desc 1']] || '').trim(),
        status: (r[idx['Asset Status']] || '').trim(),
      };
    })
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start)
    .filter((x) => !ignoredTypes.has(x.type.toUpperCase()));

  if (!parsed.length) {
    alert('No valid rows after filtering. Check mile columns and Asset Desc 2 values.');
    return;
  }

  state.records = parsed;
  state.minMile = Math.floor(Math.min(...parsed.map((p) => p.start)));
  state.maxMile = Math.floor(Math.max(...parsed.map((p) => p.end)));
  state.currentMile = state.minMile;
  state.selectedAssetId = parsed[0].id;

  mileJumpInput.min = String(state.minMile);
  mileJumpInput.max = String(state.maxMile);
  mileJumpInput.value = String(state.currentMile);

  setStatus(`Loaded ${parsed.length} valid records from ${sourceLabel}.`);
  render();
}

function showProgress(message, percent = 0) {
  if (progressHideTimer) {
    clearTimeout(progressHideTimer);
    progressHideTimer = null;
  }
  progressMessage.textContent = message;
  progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  progressModal.classList.remove('hidden');
}

function hideProgressSoon() {
  progressHideTimer = setTimeout(() => {
    progressModal.classList.add('hidden');
  }, 240);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function parseDirection(plant) {
  const text = (plant || '').toUpperCase();
  if (text.includes('DOWN')) return 'DOWN';
  if (text.includes('UP')) return 'UP';
  return 'UNKNOWN';
}

function parseMileage(value) {
  if (!value) return Number.NaN;
  const cleaned = String(value).trim();
  const parts = cleaned.split('.');
  if (parts.length !== 2) return Number.NaN;
  const miles = Number(parts[0]);
  const yards = Number(parts[1]);
  if (!Number.isFinite(miles) || !Number.isFinite(yards)) return Number.NaN;
  return miles + yards / 1760;
}

async function readFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split(','));
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, raw: false });
}

function getColor(type) {
  if (!colorByType.has(type)) {
    colorByType.set(type, palette[colorByType.size % palette.length]);
  }
  return colorByType.get(type);
}

function getVisibleRecords(mileStart, mileEnd) {
  const selectedDirection = directionSelect.value;
  const typeFilter = assetTypeFilter.value.trim().toLowerCase();

  return state.records.filter((record) => {
    const inDirection = selectedDirection === 'ALL' || record.direction === selectedDirection;
    const inMile = record.end > mileStart && record.start < mileEnd;
    const inType = !typeFilter || record.type.toLowerCase().includes(typeFilter);
    return inDirection && inMile && inType;
  });
}

function render() {
  if (!state.records.length || state.currentMile === null) {
    summary.innerHTML = '<p class="small">Load a file to begin.</p>';
    timeline.innerHTML = '';
    mileLabel.textContent = 'No data loaded';
    return;
  }

  const mileStart = state.currentMile;
  const mileEnd = mileStart + 1;
  const visible = getVisibleRecords(mileStart, mileEnd);

  if (state.selectedAssetId && !visible.some((record) => record.id === state.selectedAssetId)) {
    state.selectedAssetId = visible[0]?.id || null;
  }

  const selectedDirection = directionSelect.value;
  mileLabel.textContent = `Mile ${mileStart} to ${mileEnd} (${selectedDirection})`;
  mileJumpInput.value = String(state.currentMile);

  const upRows = visible.filter((r) => r.direction === 'UP');
  const downRows = visible.filter((r) => r.direction === 'DOWN');

  summary.innerHTML = buildSummaryHtml(upRows, downRows, mileStart, mileEnd, visible.length);
  timeline.innerHTML = buildTrackHtml(upRows, downRows, mileStart, mileEnd, visible);
}

function buildSummaryHtml(upRows, downRows, mileStart, mileEnd, count) {
  const upStats = calculateGapsOverlaps(upRows, mileStart, mileEnd);
  const downStats = calculateGapsOverlaps(downRows, mileStart, mileEnd);

  return `
    <div class="summary-grid">
      <article class="summary-card card-up"><h3>UP gaps</h3><p>${formatRanges(upStats.gaps)}</p></article>
      <article class="summary-card card-up"><h3>UP overlaps</h3><p>${formatRanges(upStats.overlaps)}</p></article>
      <article class="summary-card card-down"><h3>DOWN gaps</h3><p>${formatRanges(downStats.gaps)}</p></article>
      <article class="summary-card card-down"><h3>DOWN overlaps</h3><p>${formatRanges(downStats.overlaps)}</p></article>
    </div>
    <div class="small">Rows shown in mile: ${count}</div>
  `;
}

function buildTrackHtml(upRows, downRows, mileStart, mileEnd, visible) {
  const upSegs = buildLaneRowsHtml(upRows, mileStart, mileEnd, 'lane-up');
  const downSegs = buildLaneRowsHtml(downRows, mileStart, mileEnd, 'lane-down');
  const selected = visible.find((record) => record.id === state.selectedAssetId);

  const legend = [...new Set([...upRows, ...downRows].map((r) => r.type))]
    .map((type) => `<span class="type-chip" style="--chip:${getColor(type)}" title="${type}">${type}</span>`)
    .join('');

  return `
    <div class="track-legend">${legend || '<span class="small">No assets in this mile for this filter.</span>'}</div>
    <div class="timeline-layout">
      ${buildAssetPanelHtml(selected)}
      <div class="corridor">
        <div class="lane-label lane-label-up">UP side boundary</div>
        <div class="lane lane-up">${upSegs}</div>
        <div class="railway" aria-hidden="true">
          <div class="rail"></div>
          <div class="sleepers"></div>
          <div class="rail"></div>
        </div>
        <div class="lane lane-down">${downSegs}</div>
        <div class="lane-label lane-label-down">DOWN side boundary</div>
      </div>
    </div>
  `;
}

function buildAssetPanelHtml(record) {
  if (!record) {
    return `
      <aside class="asset-panel">
        <h3>Asset details</h3>
        <p class="small">Click any segment to inspect details.</p>
      </aside>
    `;
  }

  const startMileage = toMileage(record.start);
  const endMileage = toMileage(record.end);
  const mileageLabel = startMileage && endMileage ? `${startMileage} to ${endMileage}` : '—';

  return `
    <aside class="asset-panel">
      <h3>Asset details</h3>
      <dl>
        <dt>Type</dt><dd>${record.type}</dd>
        <dt>Direction</dt><dd>${record.direction}</dd>
        <dt>Mileage</dt><dd>${mileageLabel}</dd>
        <dt>Structured plant</dt><dd>${record.rawPlant || '—'}</dd>
        <dt>Asset number</dt><dd>${record.assetNumber || '—'}</dd>
        <dt>Description</dt><dd>${record.assetDesc1 || '—'}</dd>
        <dt>Status</dt><dd>${record.status || '—'}</dd>
      </dl>
    </aside>
  `;
}

function segmentHtml(record, mileStart, mileEnd, laneClass) {
  const left = ((Math.max(record.start, mileStart) - mileStart) / (mileEnd - mileStart)) * 100;
  const right = ((Math.min(record.end, mileEnd) - mileStart) / (mileEnd - mileStart)) * 100;
  const width = Math.max(0.8, right - left);
  const label = `${toMileage(record.start)}-${toMileage(record.end)}`;
  const showLabel = width > 16;
  const selectedClass = state.selectedAssetId === record.id ? 'selected' : '';
  return `<button class="seg ${laneClass} ${selectedClass}" data-asset-id="${record.id}" title="${record.type} | ${record.rawPlant}" style="left:${left}%;width:${width}%;background:${getColor(record.type)}">${showLabel ? `<span class="seg-label">${label}</span>` : ''}</button>`;
}

function buildLaneRowsHtml(records, mileStart, mileEnd, laneClass) {
  if (!records.length) return '<div class="lane-row"></div>';

  const rows = [];
  const sorted = [...records].sort((a, b) => a.start - b.start || a.end - b.end);

  for (const record of sorted) {
    const clippedStart = Math.max(record.start, mileStart);
    const clippedEnd = Math.min(record.end, mileEnd);
    const row = rows.find((laneRow) => clippedStart >= laneRow.end);
    if (row) {
      row.items.push(record);
      row.end = Math.max(row.end, clippedEnd);
    } else {
      rows.push({ end: clippedEnd, items: [record] });
    }
  }

  return rows
    .map((laneRow) => `<div class="lane-row">${laneRow.items.map((r) => segmentHtml(r, mileStart, mileEnd, laneClass)).join('')}</div>`)
    .join('');
}

function calculateGapsOverlaps(rows, mileStart, mileEnd) {
  const ranges = rows
    .map((r) => [Math.max(r.start, mileStart), Math.min(r.end, mileEnd)])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const gaps = [];
  const overlaps = [];
  let cursor = mileStart;
  let activeEnd = mileStart;

  for (const [s, e] of ranges) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);

    if (s < activeEnd) overlaps.push([s, Math.min(activeEnd, e)]);
    activeEnd = Math.max(activeEnd, e);
  }

  if (cursor < mileEnd) gaps.push([cursor, mileEnd]);
  return { gaps, overlaps };
}

function formatRanges(ranges) {
  if (!ranges.length) return 'None';
  return ranges.map(([s, e]) => `${toMileage(s)}-${toMileage(e)}`).join('; ');
}

function toMileage(decimalMile) {
  if (!Number.isFinite(decimalMile)) return '';
  const miles = Math.floor(decimalMile);
  const yards = Math.round((decimalMile - miles) * 1760);
  return `${String(miles).padStart(3, '0')}.${String(yards).padStart(4, '0')}`;
}

function setStatus(message) {
  statusText.textContent = message;
}
