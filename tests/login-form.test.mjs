import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const source = app.slice(app.indexOf('/* ---------------- 로그인 ---------------- */'), app.indexOf('/* ---------------- 사이트 폐쇄 화면'));

// 교사 로그인 탭의 제출 흐름만 떼어 검증한다: 버튼 잠금, 중복 제출 차단, 성공·실패 뒤 화면 전환.
function ui({ hash = '#/login' } = {}) {
  const fields = { username: 'superadmin', password: 'ChangeMe123!' };
  const tabs = [{ dataset: { ltab: 'join' } }, { dataset: { ltab: 'account' } }];
  const submit = { disabled: false, textContent: '로그인' };
  const form = { onsubmit: null, querySelector: () => submit };
  const $app = { innerHTML: '' };
  const calls = []; let routeFn, navigates = 0, settle;
  const context = vm.createContext({
    $app, console, state: { me: null, settings: null }, location: { hash },
    esc: v => String(v ?? ''),
    route: (pattern, fn) => { routeFn = fn; },
    document: { querySelectorAll: () => tabs, getElementById: () => form },
    FormData: class { get(name) { return fields[name]; } },
    api: (...args) => { calls.push(args); return new Promise((resolve, reject) => { settle = { resolve, reject }; }); },
    navigate: () => { navigates++; },
  });
  vm.runInContext(source, context);
  routeFn();
  tabs[1].onclick(); // 교사 로그인 탭
  const tick = () => new Promise(r => setImmediate(r));
  return {
    submit, $app, calls, context,
    navigates: () => navigates,
    press: () => form.onsubmit({ preventDefault() {}, target: form }),
    succeed: async (user = { mustChangePassword: false }) => { settle.resolve({ user, settings: { site_open: true } }); await tick(); },
    fail: async message => { settle.reject(new Error(message)); await tick(); },
  };
}

test('the login button locks while the request is in flight and ignores repeated presses', async () => {
  const u = ui();
  u.press(); u.press(); u.press();
  assert.equal(u.calls.length, 1);
  assert.equal(u.submit.disabled, true);
  assert.equal(u.submit.textContent, '로그인 중…');
  await u.succeed();
  assert.equal(u.context.location.hash, '#/');
  assert.equal(vm.runInContext('state.me.mustChangePassword', u.context), false);
  assert.equal(u.navigates(), 0); // 주소가 바뀌었으니 hashchange가 그린다
});

test('a successful login on a page already at the target hash redraws instead of silently doing nothing', async () => {
  const u = ui({ hash: '#/' });
  u.press();
  await u.succeed();
  assert.equal(u.context.location.hash, '#/');
  assert.equal(u.navigates(), 1);
});

test('a forced password change goes to the password screen', async () => {
  const u = ui();
  u.press();
  await u.succeed({ mustChangePassword: true });
  assert.equal(u.context.location.hash, '#/password');
});

test('a rejected login unlocks the button and shows the server message', async () => {
  const u = ui();
  u.press();
  await u.fail('아이디 또는 비밀번호가 올바르지 않습니다.');
  assert.equal(u.submit.disabled, false);
  assert.equal(u.submit.textContent, '로그인');
  assert.match(u.$app.innerHTML, /아이디 또는 비밀번호가 올바르지 않습니다\./);
  assert.equal(u.context.location.hash, '#/login');
  u.press();
  assert.equal(u.calls.length, 2); // 다시 누르면 재시도된다
});
