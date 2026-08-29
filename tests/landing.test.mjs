import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const field = html.match(/<div class="hub-field" aria-hidden="true">([\s\S]*?)<\/div>/)?.[1] || '';
const particleEngine = html.match(/<script id="hub-particle-engine">([\s\S]*?)<\/script>/)?.[1] || '';

test('keeps the public landing contract and destinations', () => {
  assert.match(html, /<h1>수업에 쓸 것들을 모아, <em>링크 하나<\/em>로 나눕니다\.<\/h1>/);
  assert.doesNotMatch(html, /<h1>[\s\S]*?<br>/);
  for (const id of ['what', 'board', 'control', 'start']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /href="\/app#\/login"/);
  assert.match(html, /href="https:\/\/moakit\.ai"/);
  assert.match(html, /사업자등록번호 443-05-03835/);
  assert.match(html, /font-family:'S-Core Dream'/);
  assert.match(html, /\/fonts\/SCDreamRegular\.woff2/);
  assert.match(html, /if \(h\.indexOf\('#\/'\) === 0\) location\.replace\('\/app' \+ h\)/);
});

test('renders a decorative line-free particle convergence field', () => {
  assert.match(html, /class="hub-field" aria-hidden="true"/);
  assert.match(field, /<canvas class="hub-particles" aria-hidden="true"><\/canvas>/);
  assert.doesNotMatch(field, /<svg|<path|<line|class="trace"|pathLength/i);
  assert.match(html, /var sources = \[\[\.08,\.22\]/);
  assert.match(html, /var target = \[\.43,\.53\]/);
  assert.match(html, /class="stage" aria-label="실제 모아허브의 초등 2학년 인공지능 융합수업 상세 화면"/);
  assert.match(html, /src="\/brand\/moahub-product\.jpg"/);
  assert.match(html, /실제 MoaHub 화면/);
  assert.match(html, /수업 한 벌이 실제로 이렇게 모입니다/);
});

test('stays dependency-free, line-free, and motion-safe', () => {
  assert.doesNotThrow(() => new Function(particleEngine));
  assert.match(html, /requestAnimationFrame\(tick\)/);
  assert.match(html, /cancelAnimationFrame\(frame\)/);
  assert.match(html, /ResizeObserver/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /document\.hidden/);
  assert.doesNotMatch(html, /three(?:\.js)?|webgl|<script[^>]+src=/i);
  assert.doesNotMatch(particleEngine, /\b(?:lineTo|moveTo|stroke|strokeStyle|bezierCurveTo|quadraticCurveTo)\b/i);
  assert.doesNotMatch(html, /animation[^;}]*infinite/i);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.hub-particles\{opacity:\.76\}/);
  assert.match(html, /\.stage\{animation:none\}/);
});

test('uses terracotta for one primary action only', () => {
  assert.equal((html.match(/class="btn btn-solid lg"/g) || []).length, 1);
  assert.match(html, /class="btn btn-teal sm" href="\/app#\/login">로그인<\/a>/);
  assert.doesNotMatch(html, /btn-accent/);
  assert.doesNotMatch(html, /\.btn-line:hover\{[^}]*accent/);
});

test('keeps the story before the product visualization on mobile', () => {
  assert.doesNotMatch(html, /\.stage\s*\{[^}]*order\s*:\s*-1/);
  assert.match(html, /@media\(max-width:900px\)/);
  assert.match(html, /\.hero \.wrap\{grid-template-columns:1fr;min-height:auto\}/);
});
