// 녹화 도우미 — CDP 스크린캐스트로 실제 앱 화면을 찍어 30fps 클립(clips/<이름>/*.jpg + .mp4)으로 만든다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const FF = process.env.FFMPEG || '/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2';
const DPR = Number(process.env.DPR || 1.5);
export const BASE = process.env.BASE || 'http://localhost:3000';
export const W = 1600, H = 900;
export async function session(fn, { login = false } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  if (login) {
    await page.goto(BASE + '/app'); await page.waitForTimeout(900);
    await page.getByRole('button', { name: '교사 로그인' }).click();
    const ins = page.locator('input:visible');
    await ins.nth(0).fill('superadmin'); await ins.nth(1).fill(process.env.ADMIN_PW || 'Promo5678!');
    await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  }
  try { await fn(page, ctx); } finally { await b.close(); }
}
export async function record(page, name, actions) {
  const dir = `clips/${name}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async f => {
    const i = frames.length; frames.push(f.metadata.timestamp);
    fs.writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(f.data, 'base64'));
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
  const start = Date.now() / 1000;
  await actions();
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  let list = '';
  frames.forEach((t, i) => { const next = i + 1 < frames.length ? frames[i + 1] : end; list += `file '${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.001, next - t).toFixed(4)}\n`; });
  list += `file '${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(`${dir}/list.txt`, list);
  const w = Math.round(W * DPR / 2) * 2, h = Math.round(H * DPR / 2) * 2;
  execFileSync(FF, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', `fps=30,scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', `clips/${name}.mp4`]);
  console.log(name, frames.length, 'frames', (end - start).toFixed(1), 's');
}
