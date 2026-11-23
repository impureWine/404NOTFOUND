import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const bundle = await build({ configFile: false, publicDir: false, logLevel: 'silent', build: {
  write: false, lib: { entry: fileURLToPath(new URL('../src/live/Search.jsx', import.meta.url)), formats: ['es'] },
  rollupOptions: { external: id => id === 'react' || id.startsWith('react/') },
} });
const js = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk' && item.isEntry).code.replace(/from\s*(['"])(react(?:\/[^'"]*)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { SearchResults } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('search results show uncertainty and source freshness without making unsafe links executable', () => {
  const html = renderToStaticMarkup(React.createElement(SearchResults, { result: {
    partial: true,
    hasConflict: true,
    uncertaintyNote: '来源摘录未经独立事实核验。',
    sources: [
      { id: 'current', title: '当前来源', url: 'https://example.org/current', snippet: '有摘要', publisher: '示例机构', sourceTier: 'S2', quality: 'CURRENT', publishedAt: '2026-11-16T00:00:00.000Z', retrievedAt: '2026-11-17T00:00:00.000Z', verificationState: 'VERIFIED' },
      { id: 'empty', title: '无摘要来源', url: 'https://example.org/empty', snippet: '', publisher: null, sourceTier: 'SX', quality: 'UNKNOWN', publishedAt: null, retrievedAt: '2026-11-17T00:00:00.000Z', verificationState: 'PARTIAL' },
      { id: 'unsafe', title: '不可执行来源', url: 'javascript:alert(1)', snippet: '不应变成链接', publisher: null, sourceTier: 'S4', quality: 'STALE', publishedAt: null, retrievedAt: null, verificationState: 'UNAVAILABLE' },
    ],
  } }));
  for (const text of ['不确定性：来源摘录未经独立事实核验。', '来源存在冲突', '二级来源', '来源级别未核定', '时效正常', '时效未知', '可能已过时', '发布时间：', '获取时间（北京时间）', '来源未提供可用摘录，请查看原网页。', '不可执行来源（来源链接不可用）']) assert.ok(html.includes(text), `Missing ${text}`);
  assert.equal(html.includes('href="javascript:'), false);
});
