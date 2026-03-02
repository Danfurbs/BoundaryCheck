const state = {
  records: [],
  currentMile: null,
  minMile: null,
  maxMile: null,
};

const requiredColumns = [
  'Asset Start Mileage',
  'Asset End Mileage',
  'Structured Plant Number',
  'Asset Desc 2',
];

const colorByType = new Map();
const palette = ['#38bdf8', '#fbbf24', '#c084fc', '#34d399', '#fb7185', '#60a5fa', '#f97316', '#22c55e'];

const fileInput = document.getElementById('fileInput');
const sampleBtn = document.getElementById('sampleBtn');
const directionSelect = document.getElementById('directionSelect');
const prevBtn = document.getElementById('prevMile');
const nextBtn = document.getElementById('nextMile');
const mileLabel = document.getElementById('mileLabel');
const summary = document.getElementById('summary');
const timeline = document.getElementById('timeline');

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const rows = await readFileRows(file);
  loadRows(rows);
});

sampleBtn.addEventListener('click', () => {
  const sampleText = `ignore row\nRoute\tIMDM\tEngineer\tSection Manager\tAsset Class Code & Desc\tItem Name Code & Desc\tEGI Code & Desc\tAsset Number\tAsset Desc 1\tAsset Desc 2\tStructured Plant Number\tMileage From\tMileage to\tTotal Yards\tStrategic Route Code & Desc\tAsset Position\tELR\tTrack ID\tAsset Start Mileage\tAsset End Mileage\tAsset Status
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659077\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2UP 019.1620:019.1660BD01\t019.1620\t019.1660\t40\tH.10\tRS\tMVN2\t\t019.1620\t019.1710\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659080\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2UP 020.1220:020.1320BD01\t020.1220\t020.1320\t100\tH.10\tRS\tMVN2\t\t020.1220\t020.1280\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659082\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2UP 022.1100:022.1150BD01\t022.1100\t022.1150\t50\tH.10\tRS\tMVN2\t\t022.1220\t022.1320\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659086\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2DOWN 015.0060:015.0150BD01\t015.0060\t015.0150\t90\tH.10\tLS\tMVN2\t\t015.0060\t015.0120\tFM
LNW North\tDB:IMDM Lancs and Cumbria\tDB07\tDB:Blackburn\tBD\tBD100\tBD100RTK0001\t17659088\tLITTLEBOROUGH\tBOUNDARY: DRY STONE WALL\tMVN2DOWN 015.0170:015.0220BD01\t015.0170\t015.0220\t50\tH.10\tLS\tMVN2\t\t015.0170\t015.0220\tFM`;
  const rows = sampleText.split('\n').map((line) => line.split('\t'));
  loadRows(rows);
});

[directionSelect, prevBtn, nextBtn].forEach((el) => el.addEventListener('click', render));
directionSelect.addEventListener('change', render);
prevBtn.addEventListener('click', () => moveMile(-1));
nextBtn.addEventListener('click', () => moveMile(1));

function moveMile(delta) {
  if (state.currentMile === null) return;
  const next = state.currentMile + delta;
  if (next < state.minMile || next > state.maxMile) return;
  state.currentMile = next;
  render();
}

function loadRows(rows) {
  const headers = rows[1]?.map((h) => (h || '').trim()) || [];
  const missing = requiredColumns.filter((col) => !headers.includes(col));
  if (missing.length) {
    alert(`Missing required columns in row 2: ${missing.join(', ')}`);
    return;
  }

  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const parsed = rows.slice(2).map((r) => ({
    type: (r[idx['Asset Desc 2']] || 'Unknown').trim(),
    start: parseMileage(r[idx['Asset Start Mileage']]),
    end: parseMileage(r[idx['Asset End Mileage']]),
    direction: parseDirection(r[idx['Structured Plant Number']]),
    rawPlant: (r[idx['Structured Plant Number']] || '').trim(),
  })).filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start);

  state.records = parsed;
  state.minMile = Math.floor(Math.min(...parsed.map((p) => p.start)));
  state.maxMile = Math.floor(Math.max(...parsed.map((p) => p.end)));
  state.currentMile = state.minMile;
  render();
}

function parseDirection(plant) {
  const text = (plant || '').toUpperCase();
  if (text.includes('DOWN')) return 'DOWN';
  if (text.includes('UP')) return 'UP';
  return 'UNKNOWN';
}

function parseMileage(value) {
  if (!value) return NaN;
  const cleaned = String(value).trim();
  const parts = cleaned.split('.');
  if (parts.length !== 2) return NaN;
  const miles = Number(parts[0]);
  const yards = Number(parts[1]);
  if (!Number.isFinite(miles) || !Number.isFinite(yards)) return NaN;
  return miles + yards / 1760;
}

async function readFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return text.split(/\r?\n/).filter(Boolean).map((line) => line.split(','));
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);
  const firstSheet = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, raw: false });
}

function getColor(type) {
  if (!colorByType.has(type)) colorByType.set(type, palette[colorByType.size % palette.length]);
  return colorByType.get(type);
}

function render() {
  if (!state.records.length) {
    timeline.innerHTML = '<p class="small">Load a file to display coverage.</p>';
    summary.innerHTML = '';
    return;
  }

  const dir = directionSelect.value;
  const start = state.currentMile;
  const end = start + 1;

  const visible = state.records.filter((r) =>
    (dir === 'ALL' || r.direction === dir) && r.end > start && r.start < end
  );

  mileLabel.textContent = `Mile ${start} to ${start + 1} (${dir})`;
  const gapAndOverlap = calculateGapsOverlaps(visible, start, end);

  summary.innerHTML = `
    <div class="legend">
      <span class="badge gap">Gaps: ${formatRanges(gapAndOverlap.gaps)}</span>
      <span class="badge overlap">Overlaps: ${formatRanges(gapAndOverlap.overlaps)}</span>
    </div>
    <div class="small">Rows shown: ${visible.length}</div>
  `;

  const byType = new Map();
  visible.forEach((row) => {
    if (!byType.has(row.type)) byType.set(row.type, []);
    byType.get(row.type).push(row);
  });

  const rowsHtml = [...byType.entries()].map(([type, rows]) => {
    const segs = rows.map((r) => {
      const left = ((Math.max(r.start, start) - start) / (end - start)) * 100;
      const right = ((Math.min(r.end, end) - start) / (end - start)) * 100;
      const width = Math.max(0.7, right - left);
      return `<div class="seg" title="${r.rawPlant} (${r.direction})" style="left:${left}%;width:${width}%;background:${getColor(type)}"></div>`;
    }).join('');

    return `<div class="row"><div>${type}</div><div class="track">${segs}</div></div>`;
  }).join('');

  timeline.innerHTML = rowsHtml || '<p class="small">No assets in this mile for selected direction.</p>';
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
  const miles = Math.floor(decimalMile);
  const yards = Math.round((decimalMile - miles) * 1760);
  return `${String(miles).padStart(3, '0')}.${String(yards).padStart(4, '0')}`;
}
