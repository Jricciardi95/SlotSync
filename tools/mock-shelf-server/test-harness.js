#!/usr/bin/env node
/* eslint-disable no-console */
const BASE_URL = process.env.MOCK_SHELF_BASE_URL || 'http://127.0.0.1:8787';

const tests = [
  { name: 'status', path: '/status', validate: (j) => j && j.ok === true && typeof j.mode === 'string' },
  { name: 'slot-1', path: '/slot?num=1', validate: (j) => j && j.ok === true && j.slot === 1 },
  { name: 'slot-2', path: '/slot?num=2', validate: (j) => j && j.ok === true && j.slot === 2 },
  { name: 'slot-12', path: '/slot?num=12', validate: (j) => j && j.ok === true && j.slot === 12 },
  { name: 'blink-12', path: '/blink?num=12', validate: (j) => j && j.ok === true && j.slot === 12 },
  { name: 'slots-1-3-5', path: '/slots?nums=1,3,5', validate: (j) => j && j.ok === true && Number(j.count) === 3 },
  {
    name: 'brightness-120',
    path: '/brightness?value=120',
    validate: (j) => j && j.ok === true && Number(j.brightness) === 120,
  },
];

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, raw: text };
}

async function main() {
  console.log(`Mock shelf test target: ${BASE_URL}`);
  console.log('---');

  // Reachability probe
  try {
    await fetchJson('/status');
  } catch (e) {
    console.error('FAIL  server-reachable');
    console.error(`      Cannot reach mock shelf server at ${BASE_URL}`);
    console.error('      Start it with: npm run mock:shelf');
    process.exit(1);
  }

  let failed = 0;
  for (const t of tests) {
    try {
      const out = await fetchJson(t.path);
      const valid = out.ok && t.validate(out.json);
      if (valid) {
        console.log(`PASS  ${t.name}`);
      } else {
        failed += 1;
        console.log(`FAIL  ${t.name}`);
        console.log(`      GET ${t.path} -> HTTP ${out.status}`);
        console.log(`      body: ${out.raw.slice(0, 180)}`);
      }
    } catch (e) {
      failed += 1;
      console.log(`FAIL  ${t.name}`);
      console.log(`      ${e.message || e}`);
    }
  }

  console.log('---');
  if (failed === 0) {
    console.log('PASS  mock shelf server responds correctly.');
    process.exit(0);
  } else {
    console.log(`FAIL  ${failed} test(s) failed.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FAIL  test-harness');
  console.error(e);
  process.exit(1);
});
