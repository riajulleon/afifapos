import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../domain/types';
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
['orders', 'resellers', 'catalog', 'settings', 'system'].forEach((g) => keys.add(`perm.group.${g}`));
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
