import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Bundle the real JSX component in memory; no generated files or test-only UI.
const bundle = await build({ configFile: false, publicDir: false, logLevel: 'silent', build: {
  write: false, lib: { entry: fileURLToPath(new URL('../src/records/RecordDetail.jsx', import.meta.url)), formats: ['es'] },
  rollupOptions: { external: id => id === 'react' || id.startsWith('react/') },
} });
const js = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(item => item.type === 'chunk' && item.isEntry).code.replace(/from\s*(['"])(react(?:\/[^'"]*)?)\1/g, (_, quote, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const { RecordDetail } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const render = (kind, content) => renderToStaticMarkup(React.createElement(RecordDetail, { record: { id: 'synthetic-record', title: '已保存的测试标题', version: 1, kind, content }, onClose() {} }));

for (const [kind, content, expected] of [
  ['CONVERSATION', { messages: [{ role: 'USER', content: '测试用户正文' }, { role: 'ASSISTANT', content: '测试助手回复' }] }, ['测试用户正文', '测试助手回复']],
  ['EMOTION', { recordDate: '2026-10-29', emotionCodes: ['平静'], intensity: 0, timezoneName: 'Asia/Hong_Kong', note: '测试当天备注' }, ['2026-10-29', '平静', 'Asia/Hong_Kong', '测试当天备注', '<dd>0</dd>']],
  ['WORRY_OBJECT', { shapeCode: 'STONE', body: '测试物件描述' }, ['石头', '测试物件描述']],
  ['REHEARSAL_DRAFT', { scene: '测试排练场景', expressions: ['测试认可表达'] }, ['测试排练场景', '测试认可表达']],
]) {
  test(`history detail renders the actual title and ${kind} body`, () => {
    const html = render(kind, content);
    assert.ok(html.includes('已保存的测试标题'));
    for (const text of expected) assert.ok(html.includes(text), `Missing ${text}`);
  });
}

test('query history shows the saved question, excerpt, uncertainty and original source', () => {
  const html = render('QUERY', { question: '测试原始查询', claims: [{ id: 'claim-a', text: '测试保存摘录', status: 'UNKNOWN', evidence: [{ source: { title: '测试原始来源', url: 'https://example.org/source', publisher: 'example.org', verificationState: 'PARTIAL' } }] }] });
  for (const text of ['测试原始查询', '测试保存摘录', '未经独立核验', '测试原始来源', 'https://example.org/source']) assert.ok(html.includes(text));
});

test('deposit detail never reveals a body before active retrieval', () => {
  const html = render('DEPOSIT', { body: 'MUST_NOT_DISPLAY' });
  assert.equal(html.includes('MUST_NOT_DISPLAY'), false);
  assert.ok(html.includes('href="#deposit"')); assert.ok(html.includes('主动取出'));
});

test('history escapes saved markup and refuses executable source links', () => {
  const html = render('QUERY', { question: '<img src=x onerror=alert(1)>', claims: [{ text: '<script>test</script>', evidence: [{ source: { title: 'unsafe', url: 'javascript:alert(1)' } }] }] });
  assert.equal(html.includes('<script>'), false); assert.equal(html.includes('href="javascript:'), false);
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('&lt;img'));
});

test('missing detail content reports an explicit problem rather than a blank success panel', () => {
  const html = render('QUERY', undefined);
  assert.ok(html.includes('role="alert"')); assert.ok(html.includes('未返回正文'));
});
