import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const focusEngine = html.match(/<script id="hub-focus-engine">([\s\S]*?)<\/script>/)?.[1] || '';

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

test('renders one calm real-product frame instead of particles or stacked windows', () => {
  assert.doesNotMatch(html, /hub-field|hub-particles|hub-particle-engine|stage-stack|stack-layer|<canvas/i);
  assert.match(html, /class="stage-focus" id="hub-stage-focus"/);
  assert.equal((html.match(/src="\/brand\/moahub-product\.jpg"/g) || []).length, 1);
  assert.match(html, /class="stage" aria-label="실제 모아허브의 초등 2학년 인공지능 융합수업 상세 화면"/);
  assert.match(html, /실제 MoaHub 화면/);
  assert.match(html, /수업 한 벌이 실제로 이렇게 모입니다/);
});

test('keeps the pointer focus dependency-free, user-driven, and motion-safe', () => {
  assert.doesNotThrow(() => new Function(focusEngine));
  assert.match(focusEngine, /IntersectionObserver/);
  assert.match(focusEngine, /classList\.add\('is-revealed'\)/);
  assert.match(focusEngine, /revealObserver\.disconnect\(\)/);
  assert.match(focusEngine, /addEventListener\('pointermove'/);
  assert.match(focusEngine, /addEventListener\('pointerleave', reset\)/);
  assert.match(focusEngine, /\(hover: hover\) and \(pointer: fine\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(focusEngine, /setInterval|setTimeout|requestAnimationFrame/);
  assert.doesNotMatch(html, /three(?:\.js)?|webgl|requestAnimationFrame|<script[^>]+src=/i);
  assert.doesNotMatch(html, /animation[^;}]*infinite/i);
  assert.match(html, /@keyframes hub-product-reveal/);
  assert.match(html, /@keyframes hub-reveal-sweep/);
  assert.match(html, /\.stage-focus\.is-revealed \.product-shot::before\{animation:hub-reveal-sweep 1\.35s/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.stage-focus,\.stage,\.product-shot::before,\.product-shot::after,\.product-shot img\{animation:none;transition:none\}/);
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
  assert.match(html, /\.stage-focus\{width:100%;max-width:680px;margin:0 auto\}/);
});
