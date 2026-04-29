#!/usr/bin/env node
/* eslint-disable no-console */
const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.MOCK_SHELF_PORT || 8787);
const ODD_LED_COUNT = Number(process.env.MOCK_SHELF_ODD_LED_COUNT || 30);
const EVEN_LED_COUNT = Number(process.env.MOCK_SHELF_EVEN_LED_COUNT || 30);
const REVERSE_ODD = process.env.MOCK_SHELF_REVERSE_ODD === 'true';
const REVERSE_EVEN = process.env.MOCK_SHELF_REVERSE_EVEN === 'true';
const ODD_OFFSET = Number(process.env.MOCK_SHELF_ODD_OFFSET || 0);
const EVEN_OFFSET = Number(process.env.MOCK_SHELF_EVEN_OFFSET || 0);

const state = {
  mode: 'idle',
  selectedSlot: null,
  selectedSlots: [],
  brightness: 120,
  idle: { r: 0, g: 0, b: 30 },
  selectedColor: { r: 255, g: 255, b: 255 },
  musicReactive: false,
  firmware: 'mock-shelf-1.0.0',
  startedAt: Date.now(),
  blinkSlot: null,
};

function maxSlot() {
  return ODD_LED_COUNT + EVEN_LED_COUNT;
}

function clampByte(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseSlot(raw) {
  const slot = Number(raw);
  if (!Number.isFinite(slot) || slot < 1 || slot > maxSlot()) return null;
  return Math.round(slot);
}

function logicalToPhysical(slot) {
  const odd = slot % 2 === 1;
  const strip = odd ? 'odd' : 'even';
  const logicalIndex = odd ? Math.floor((slot - 1) / 2) : Math.floor((slot - 2) / 2);
  const ledCount = odd ? ODD_LED_COUNT : EVEN_LED_COUNT;
  const reverse = odd ? REVERSE_ODD : REVERSE_EVEN;
  const offset = odd ? ODD_OFFSET : EVEN_OFFSET;
  const maybeReversed = reverse ? ledCount - 1 - logicalIndex : logicalIndex;
  const physicalIndex = maybeReversed + offset;
  return { slot, strip, logicalIndex, physicalIndex, reverse, offset, ledCount };
}

function logMapping(slot) {
  const m = logicalToPhysical(slot);
  console.log(
    `[mock-shelf] slot ${m.slot} -> ${m.strip} strip LED logical=${m.logicalIndex} physical=${m.physicalIndex}` +
      ` (count=${m.ledCount}, reverse=${m.reverse}, offset=${m.offset})`
  );
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function okJson(extra = {}) {
  return {
    ok: true,
    mode: state.mode,
    slot: state.selectedSlot ?? undefined,
    count: state.selectedSlots.length || undefined,
    brightness: state.brightness,
    ...extra,
  };
}

function statusJson() {
  return {
    ok: true,
    mode: state.mode,
    selected_slot: state.selectedSlot ?? undefined,
    multi_count: state.selectedSlots.length || undefined,
    multi_slots: state.selectedSlots.length ? state.selectedSlots : undefined,
    max_slot: maxSlot(),
    brightness: state.brightness,
    uptime_ms: Date.now() - state.startedAt,
    idle: state.idle,
    selected_color: state.selectedColor,
    music_reactive: state.musicReactive,
    firmware: state.firmware,
  };
}

function htmlVisual() {
  const total = maxSlot();
  const cells = [];
  for (let slot = 1; slot <= total; slot++) {
    const m = logicalToPhysical(slot);
    const active = state.selectedSlots.includes(slot);
    const blinking = state.blinkSlot === slot;
    const classes = [
      'slot',
      active ? 'active' : '',
      blinking ? 'blink' : '',
      m.strip === 'odd' ? 'odd' : 'even',
    ]
      .filter(Boolean)
      .join(' ');
    cells.push(
      `<div class="${classes}" title="slot ${slot} -> ${m.strip} strip LED ${m.physicalIndex}">
        <div class="slot-num">${slot}</div>
        <div class="slot-meta">${m.strip}#${m.physicalIndex}</div>
      </div>`
    );
  }
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Mock Shelf Visual</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; background:#111; color:#eee; }
    .meta { margin-bottom: 12px; font-size: 14px; color:#bbb; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill,minmax(78px,1fr)); gap:8px; }
    .slot { border:1px solid #333; border-radius:8px; padding:8px; background:#1b1b1b; text-align:center; }
    .slot.odd { border-color:#5f7; }
    .slot.even { border-color:#7af; }
    .slot.active { background:#2d3b2d; box-shadow: 0 0 0 1px #7f7 inset; }
    .slot.blink { animation: bl 0.8s steps(1,end) infinite; }
    .slot-num { font-weight:700; font-size:16px; }
    .slot-meta { font-size:11px; opacity:.8; margin-top:4px; }
    @keyframes bl { 50% { background:#663; box-shadow: 0 0 0 1px #ff6 inset; } }
    code { background:#222; padding:2px 4px; border-radius:4px; }
  </style>
</head>
<body>
  <h2>Mock Shelf Visual</h2>
  <div class="meta">
    mode=<code>${state.mode}</code>,
    selected=${state.selectedSlots.join(',') || '-'},
    brightness=${state.brightness},
    oddCount=${ODD_LED_COUNT}, evenCount=${EVEN_LED_COUNT},
    reverseOdd=${String(REVERSE_ODD)}, reverseEven=${String(REVERSE_EVEN)}
  </div>
  <div class="grid">${cells.join('')}</div>
  <script>setTimeout(() => location.reload(), 1000);</script>
</body>
</html>`;
}

function applySingleSlot(slot) {
  state.mode = 'slot';
  state.selectedSlot = slot;
  state.selectedSlots = [slot];
  state.blinkSlot = null;
  logMapping(slot);
}

function applySlots(slots) {
  state.mode = 'slots';
  state.selectedSlot = slots[0] || null;
  state.selectedSlots = slots;
  state.blinkSlot = null;
  slots.forEach(logMapping);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (req.method !== 'GET') {
    return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  if (path === '/visual') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(htmlVisual());
    return;
  }

  if (path === '/status') return json(res, 200, statusJson());

  if (path === '/idle') {
    state.mode = 'idle';
    state.selectedSlot = null;
    state.selectedSlots = [];
    state.blinkSlot = null;
    return json(res, 200, okJson());
  }

  if (path === '/clear') {
    state.mode = 'clear';
    state.selectedSlot = null;
    state.selectedSlots = [];
    state.blinkSlot = null;
    return json(res, 200, okJson());
  }

  if (path === '/demo') {
    state.mode = 'demo';
    state.selectedSlot = null;
    state.selectedSlots = [];
    state.blinkSlot = null;
    return json(res, 200, okJson());
  }

  if (path === '/slot') {
    const slot = parseSlot(url.searchParams.get('num'));
    if (!slot) return json(res, 400, { ok: false, error: 'INVALID_SLOT' });
    applySingleSlot(slot);
    return json(res, 200, okJson({ slot }));
  }

  if (path === '/slots') {
    const raw = (url.searchParams.get('nums') || '').trim();
    if (!raw) return json(res, 400, { ok: false, error: 'INVALID_SLOTS' });
    const slots = [...new Set(raw.split(',').map(parseSlot).filter(Boolean))];
    if (!slots.length) return json(res, 400, { ok: false, error: 'INVALID_SLOTS' });
    applySlots(slots);
    return json(res, 200, okJson({ count: slots.length }));
  }

  if (path === '/blink') {
    const slot = parseSlot(url.searchParams.get('num'));
    if (!slot) return json(res, 400, { ok: false, error: 'INVALID_SLOT' });
    state.mode = 'blink';
    state.selectedSlot = slot;
    state.selectedSlots = [slot];
    state.blinkSlot = slot;
    logMapping(slot);
    return json(res, 200, okJson({ slot }));
  }

  if (path === '/brightness') {
    state.brightness = clampByte(url.searchParams.get('value'), state.brightness);
    return json(res, 200, okJson({ brightness: state.brightness }));
  }

  if (path === '/idlecolor') {
    state.idle = {
      r: clampByte(url.searchParams.get('r'), state.idle.r),
      g: clampByte(url.searchParams.get('g'), state.idle.g),
      b: clampByte(url.searchParams.get('b'), state.idle.b),
    };
    return json(res, 200, okJson());
  }

  if (path === '/selectedcolor') {
    state.selectedColor = {
      r: clampByte(url.searchParams.get('r'), state.selectedColor.r),
      g: clampByte(url.searchParams.get('g'), state.selectedColor.g),
      b: clampByte(url.searchParams.get('b'), state.selectedColor.b),
    };
    return json(res, 200, okJson());
  }

  return json(res, 404, { ok: false, error: 'NOT_FOUND' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[mock-shelf] listening on http://localhost:${PORT}`);
  console.log(`[mock-shelf] visual: http://localhost:${PORT}/visual`);
  console.log(
    `[mock-shelf] mapping: slot1->odd LED0, slot2->even LED0, slot12->even LED5` +
      ` | oddCount=${ODD_LED_COUNT}, evenCount=${EVEN_LED_COUNT}, reverseOdd=${REVERSE_ODD}, reverseEven=${REVERSE_EVEN}`
  );
});
