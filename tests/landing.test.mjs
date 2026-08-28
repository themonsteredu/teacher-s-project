import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

test('keeps the public landing contract and destinations', () => {
  assert.match(html, /<h1>수업에 쓸 것들을 모아,<br><em>링크 하나<\/em>로 나눕니다\.<\/h1>/);
  for (const id of ['what', 'board', 'control', 'start']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /href="\/app#\/login"/);
  assert.match(html, /href="https:\/\/moakit\.ai"/);
  assert.match(html, /사업자등록번호 443-05-03835/);
  assert.match(html, /if \(h\.indexOf\('#\/'\) === 0\) location\.replace\('\/app' \+ h\)/);
});

test('renders a decorative static connectivity field', () => {
  assert.match(html, /class="hub-field" aria-hidden="true"/);
  assert.ok((html.match(/class="trace"/g) || []).length >= 8);
  assert.ok((html.match(/pathLength="1"/g) || []).length >= 8);
  assert.match(html, /role="img" aria-label="초등 2학년 AI 수업을 찾아/);
  assert.match(html, /수업자료 찾기/);
  assert.match(html, /찾은 자료를 수업 한 벌로 연결/);
});

test('stays dependency-free, finite, and motion-safe', () => {
  assert.doesNotMatch(html, /<canvas/i);
  assert.doesNotMatch(html, /three(?:\.js)?|webgl|requestAnimationFrame/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /animation[^;}]*infinite/i);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.hub-field \.trace\{stroke-dashoffset:0;animation:none\}/);
  assert.match(html, /\.stage\{animation:none\}/);
});

test('keeps the story before the product visualization on mobile', () => {
  assert.doesNotMatch(html, /\.stage\s*\{[^}]*order\s*:\s*-1/);
  assert.match(html, /@media\(max-width:900px\)/);
  assert.match(html, /\.hero \.wrap\{grid-template-columns:1fr;min-height:auto\}/);
});
