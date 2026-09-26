// 장면별 녹화: node go.mjs <home|program|newclass|student|fill|teacher|print>
// 로컬 서버(더미 DB + 가짜 저장소)에서 실행한다. 학생 이름·활동지는 모두 가상 데이터다.
import { session, record, BASE } from './rec.mjs';
const w = ms => new Promise(r => setTimeout(r, ms));
const which = process.argv[2];

// 녹화에는 마우스 커서가 찍히지 않으므로 화면 위에 가짜 커서를 그린다
const CURSOR = () => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;z-index:2147483647;pointer-events:none;transition:transform .12s;background:url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27><path d=%27M3 2l7 19 2.6-7.4L20 11z%27 fill=%27%23111%27 stroke=%27white%27 stroke-width=%271.6%27 stroke-linejoin=%27round%27/></svg>") no-repeat;opacity:0';
    document.documentElement.appendChild(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; c.style.opacity = 1; }, true);
    addEventListener('mousedown', () => { c.style.transform = 'scale(.8)'; }, true);
    addEventListener('mouseup', () => { c.style.transform = ''; }, true);
  });
};
async function prep(page) { await page.context().addInitScript(CURSOR); }
async function glide(page, loc, { click = true, pause = 350 } = {}) {
  await loc.scrollIntoViewIfNeeded();
  const bx = await loc.boundingBox();
  await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 22 });
  await w(pause);
  if (click) await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
}
async function type(loc, text, delay = 110) { await loc.click(); await loc.pressSequentially(text, { delay }); }
async function smoothScroll(page, dy, ms = 1400) {
  const n = Math.round(ms / 16);
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy / n); await w(16); }
}
async function joinAsStudent(page) {
  await page.goto(BASE + '/app'); await w(900);
  await page.locator('input:visible').first().fill('AI2026');
  await page.getByRole('button', { name: '보드 입장하기' }).click(); await w(1500);
}

if (which === 'home') await session(async p => {
  await prep(p); await p.goto(BASE + '/app#/'); await w(1500); await p.mouse.move(800, 600);
  await record(p, 'home', async () => {
    await w(900);
    await glide(p, p.locator('.deck-card').nth(1), { click: false }); await w(700);
    await glide(p, p.locator('summary', { hasText: '초등학교' }).first()); await w(900);
    await glide(p, p.getByRole('link', { name: /열기/ }).nth(1)); await w(2200);
  });
}, { login: true });

if (which === 'program') await session(async p => {
  await prep(p); await p.goto(BASE + '/app#/program/2'); await w(1800); await p.mouse.move(900, 500);
  await record(p, 'program', async () => {
    await w(800);
    await glide(p, p.locator('.lesson-nav-list button').nth(2)); await w(1400);
    await glide(p, p.getByText('수업 실행').locator('visible=true').first()); await w(2200);
    for (let i = 0; i < 3; i++) { await glide(p, p.frameLocator('iframe').last().getByRole('button', { name: '다음' }).last(), { pause: 200 }); await w(1300); }
  });
}, { login: true });

if (which === 'newclass') await session(async p => {
  await prep(p); await p.goto(BASE + '/app#/myclass'); await w(1500); await p.mouse.move(900, 500);
  await record(p, 'newclass', async () => {
    await w(600);
    await glide(p, p.locator('#mc-new')); await w(900);
    await p.selectOption('#nc-prog', '2'); await w(300);
    await type(p.locator('#nc-title'), '2학년 3반 · 나의 하루 AI', 90); await w(250);
    await type(p.locator('#nc-code'), 'AI2026', 130); await w(250);
    await type(p.locator('#nc-roster'), '김하늘\n이바다\n박숲\n최별\n정구름\n한햇살', 45); await w(500);
    await glide(p, p.locator('#nc-save')); await w(3200);
  });
}, { login: true });

if (which === 'student') await session(async p => {
  await prep(p); await p.goto(BASE + '/app'); await w(1200); await p.mouse.move(800, 700);
  await record(p, 'student', async () => {
    await w(600);
    await type(p.locator('input:visible').first(), 'AI2026', 170); await w(300);
    await glide(p, p.getByRole('button', { name: '보드 입장하기' })); await w(2200);
    await glide(p, p.getByRole('button', { name: '활동 결과물 제출하기 →' })); await w(1000);
    await p.setInputFiles('#sc-file-input', 'assets/ws1.jpg'); await w(900);
    await type(p.locator('#sc-name'), '김하늘', 120);
    await type(p.locator('#sc-title'), '나의 아침 하루', 100);
    await type(p.locator('#sc-content'), '아침에 강아지랑 산책했어요.', 70); await w(300);
    await glide(p, p.getByRole('button', { name: '제출하기', exact: true })); await w(2600);
  });
});

// 녹화 없이 나머지 학생 제출을 채운다
if (which === 'fill') {
  const kids = [['이바다', '빵 만들기', '엄마랑 빵을 만들었어요.', 2], ['박숲', '축구한 날', '친구와 축구를 했어요.', 3], ['최별', '도서관 가는 날', '도서관에서 책을 읽었어요.', 4]];
  for (const [n, t, c, i] of kids) await session(async p => {
    await joinAsStudent(p);
    await p.getByRole('button', { name: '활동 결과물 제출하기 →' }).click(); await w(900);
    await p.setInputFiles('#sc-file-input', `assets/ws${i}.jpg`); await w(600);
    await p.fill('#sc-name', n); await p.fill('#sc-title', t); await p.fill('#sc-content', c);
    await p.getByRole('button', { name: '제출하기', exact: true }).click(); await w(2200);
  });
}

if (which === 'teacher') await session(async p => {
  await prep(p); await p.goto(BASE + '/app#/myclass'); await w(1200);
  const id = await p.evaluate(async () => (await (await fetch('/api/my-boards')).json()).boards?.[0]?.id);
  await p.goto(BASE + `/app#/boardview/${id || 1}`); await w(2200); await p.mouse.move(1000, 420);
  await record(p, 'teacher', async () => {
    await w(1600);
    await glide(p, p.locator('.sb-code-card ~ .card').first().getByText('제출한 학생').first(), { click: false }); await w(900);
    await p.evaluate(() => { const el = document.querySelector('.sb-viewbar'); window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 90, behavior: 'smooth' }); }); await w(2200);
    await glide(p, p.locator('[data-postview=student]')); await w(2600);
  });
}, { login: true });

if (which === 'print') await session(async p => {
  await prep(p); await p.goto(BASE + '/worksheet-headers.html'); await w(1800); await p.mouse.move(900, 500);
  await record(p, 'print', async () => {
    await w(700);
    const sel = p.locator('select').first();
    await glide(p, sel, { click: false });
    const opt = await sel.locator('option').filter({ hasText: '보성' }).first().getAttribute('value');
    await sel.selectOption(opt); await w(1100);
    await glide(p, p.getByRole('link', { name: /학생용 인쇄/ }).nth(2), { click: false }); await w(1400);
  });
}, { login: true });

// 정지 화면: 학교 머리글이 붙은 인쇄용 활동지, 랜딩 첫 화면
if (which === 'stills') {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 820, height: 1100 }, deviceScaleFactor: 2 });
  await p.goto(BASE + '/lessons/초1-인공지능/3차시-학생용.html?school=boseong'); await w(1500);
  await p.emulateMedia({ media: 'print' }); await w(600);
  await p.screenshot({ path: 'assets/print-sheet.jpg', type: 'jpeg', quality: 92 });
  const q = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.5 });
  await q.goto(BASE + '/'); await w(1800);
  await q.screenshot({ path: 'assets/landing.jpg', type: 'jpeg', quality: 90 });
  await b.close();
}
