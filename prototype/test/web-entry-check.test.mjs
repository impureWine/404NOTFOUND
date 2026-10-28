import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../web-prototype/', import.meta.url));
const repoRoot = resolve(root, '..');
const localReference = /(?:href|src)=["']([^"']+)["']/g;
const external = /^(?:https?:|mailto:|tel:|data:|javascript:|#)/i;

test('all static web entry pages are present and local references resolve', async () => {
  const names = (await readdir(root)).filter(name => name.endsWith('.html')).sort();
  assert.equal(names.length, 24);
  const pages = new Set(names);
  const broken = [];
  for (const name of names) {
    const html = await readFile(join(root, name), 'utf8');
    for (const match of html.matchAll(localReference)) {
      const raw = match[1];
      if (external.test(raw) || raw.startsWith('//')) continue;
      let target;
      try {
        target = decodeURIComponent(new URL(raw, `http://prototype.local/${name}`).pathname);
      } catch {
        broken.push(`${name} -> ${raw}`);
        continue;
      }
      if (target === '/') continue;
      const resolved = resolve(root, `.${target}`);
      if (!resolved.startsWith(root)) {
        broken.push(`${name} -> ${raw}`);
        continue;
      }
      try {
        await stat(resolved);
      } catch {
        broken.push(`${name} -> ${raw}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test('day6 handoff documents the actual candidate boundaries', async () => {
  const file = join(repoRoot, 'docs', 'alpha', '程杰', 'Day6_20261028', 'Day6_程杰前端演示路径与版本说明.md');
  const text = await readFile(file, 'utf8');
  assert.match(text, /Electron 45/);
  assert.match(text, /启动失败/);
  assert.match(text, /24 个 HTML 页面/);
  assert.match(text, /12\/12/);
  assert.match(text, /25\/25/);
});
