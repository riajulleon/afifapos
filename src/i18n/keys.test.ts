import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANGE_PRESETS } from '../components/DateRange';
import { buildReport, REPORT_TYPES } from '../domain/reports';
import { EMAIL_TRIGGERS, PAYMENT_KINDS, PERMISSIONS } from '../domain/types';
import { en } from './en';
import { it as itDict } from './it';

type Dict = { [k: string]: string | Dict };

function has(dict: Dict, key: string): boolean {
  const segs = key.split('.');
  let node: string | Dict = dict;
  for (const s of segs.slice(0, -1)) {
    if (typeof node !== 'object' || !(s in node)) return false;
    node = node[s];
  }
  if (typeof node !== 'object') return false;
  const last = segs.at(-1)!;
  return typeof node[last] === 'string' || typeof node[`${last}_other`] === 'string';
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' || e.name === 'mock' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

// Static keys used in code, plus the keys built from lists at runtime.
const keys = new Set<string>();
for (const f of sourceFiles(path.resolve(__dirname, '..'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  for (const m of s.matchAll(/\bL\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
}
PERMISSIONS.forEach((p) => keys.add(`perm.${p.replace('.', '_')}`));
['orders', 'resellers', 'catalog', 'sales', 'settings', 'system'].forEach((g) => keys.add(`perm.group.${g}`));
PAYMENT_KINDS.forEach((k) => keys.add(`admin.pay.kind.${k}`));
// Reports: every column, KPI and chart key a report can produce.
const empty = { orders: [], users: [], products: [], categories: [], commissions: [], payouts: [], from: '2026-09-01', to: '2026-09-30' };
REPORT_TYPES.forEach((type) => {
  keys.add(`rep.type.${type}`);
  keys.add(`rep.desc.${type}`);
  const r = buildReport(type, empty);
  r.columns.forEach((c) => keys.add(`rep.col.${c.key}`));
  r.kpis.forEach((k) => keys.add(`rep.kpi.${k.key}`));
  r.charts.forEach((c) => keys.add(`rep.chart.${c.key}`));
});
['day', 'week', 'month'].forEach((g) => keys.add(`rep.grain.${g}`));
['online', 'pos', 'invoiced', 'collected', 'paid', 'payable', 'pending'].forEach((s) => keys.add(`rep.series.${s}`));
RANGE_PRESETS.forEach((p) => keys.add(`range.${p}`));
[...EMAIL_TRIGGERS, 'campaign', 'test'].forEach((k) => keys.add(`mail.trigger.${k}`));
EMAIL_TRIGGERS.forEach((k) => keys.add(`mail.when.${k}`));
['queued', 'sent', 'delivered', 'opened', 'bounced', 'failed'].forEach((s) => keys.add(`mail.status.${s}`));
['log', 'templates', 'campaigns', 'setup'].forEach((s) => keys.add(`mail.tab.${s}`));
['heading', 'text', 'button', 'image', 'divider', 'spacer', 'order'].forEach((s) => keys.add(`mail.block.${s}`));
['all', 'city', 'poc', 'selected'].forEach((s) => keys.add(`mail.aud.${s}`));
['pending', 'payable', 'paid', 'void'].forEach((s) => keys.add(`com.status.${s}`));
['paid', 'delivered'].forEach((s) => keys.add(`com.when.${s}`));
['walkin', 'reseller'].forEach((s) => keys.add(`pos.${s}`));
keys.add('admin.settings.tab.pos');
['users', 'roles'].forEach((x) => keys.add(`staff.tab.${x}`));
['all', 'today', '7', '30', '90', 'custom'].forEach((x) => keys.add(`orders2.preset.${x}`));
['ready', 'warning', 'error'].forEach((x) => keys.add(`imp.status.${x}`));

describe('translations', () => {
  it('English has every key the code uses', () => {
    expect([...keys].filter((k) => !has(en as unknown as Dict, k)).sort()).toEqual([]);
  });
  it('Italian has every key the code uses', () => {
    expect([...keys].filter((k) => !has(itDict as unknown as Dict, k)).sort()).toEqual([]);
  });
});
