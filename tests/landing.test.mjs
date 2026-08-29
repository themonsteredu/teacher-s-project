import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const stackEngine = html.match(/<script id="hub-stack-engine">([\s\S]*?)<\/script>/)?.[1] || '';

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

test('renders a real-product page stack instead of convergence particles', () => {
  assert.doesNotMatch(html, /hub-field|hub-particles|hub-particle-engine|<canvas/i);
  assert.match(html, /class="stage-stack" id="hub-stage-stack"/);
  assert.equal((html.match(/class="stack-layer/g) || []).length, 2);
  assert.ok((html.match(/src="\/brand\/moahub-product\.jpg"/g) || []).length >= 3);
  assert.match(html, /class="stage" aria-label="실제 모아허브의 초등 2학년 인공지능 융합수업 상세 화면"/);
  assert.match(html, /실제 MoaHub 화면/);
  assert.match(html, /수업 한 벌이 실제로 이렇게 모입니다/);
});

test('keeps the page shuffle dependency-free and motion-safe', () => {
  assert.doesNotThrow(() => new Function(stackEngine));
  assert.match(stackEngine, /setInterval\(cycle, 5000\)/);
  assert.match(stackEngine, /clearInterval\(timer\)/);
  assert.match(stackEngine, /classList\.toggle\('is-flipped'\)/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /max-width: 600px/);
  assert.match(html, /document\.hidden/);
  assert.doesNotMatch(html, /three(?:\.js)?|webgl|requestAnimationFrame|<script[^>]+src=/i);
  assert.doesNotMatch(html, /animation[^;}]*infinite/i);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html, /\.stage-stack,\.stack-layer,\.stage\{animation:none;transition:none\}/);
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
  assert.match(html, /\.stage-stack\{width:100%;max-width:680px;margin:0 auto\}/);
});
