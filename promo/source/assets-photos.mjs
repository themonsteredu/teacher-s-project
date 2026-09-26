import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 1200 } });
const kids = [['김하늘','🌞 아침에 강아지랑 산책했어요','#ffe29a','#7cc6ff'],['이바다','🍞 엄마랑 빵을 만들었어요','#ffd0c2','#a5e3c1'],['박숲','⚽ 친구와 축구를 했어요','#c9f2d8','#ffc46b'],['최별','📚 도서관에서 책을 읽었어요','#e4d6ff','#ffb3c7'],['정구름','🎨 그림일기를 그렸어요','#d6f0ff','#ffd66b']];
for (const [i,[n,t,c1,c2]] of kids.entries()) {
  await p.setContent(`<html><body style="margin:0;background:#d9d2c3;font-family:'WenQuanYi Zen Hei',sans-serif">
  <div style="margin:40px;height:1120px;background:#fffdf7;transform:rotate(${(i%2?-1:1)*1.2}deg);box-shadow:0 10px 30px rgba(0,0,0,.25);padding:50px;box-sizing:border-box">
  <div style="font-size:30px;font-weight:bold;border-bottom:4px solid #222;padding-bottom:14px">AI 활동지 · 나의 하루를 자료로 나타내기</div>
  <div style="font-size:26px;margin:22px 0">2학년 3반 이름: <span style="font-size:34px;color:#1a4fb5">${n}</span></div>
  <div style="height:520px;border:3px dashed #999;border-radius:20px;background:linear-gradient(160deg,${c1},${c2});display:flex;align-items:center;justify-content:center;font-size:180px">${t.split(' ')[0]}</div>
  <div style="font-size:34px;margin-top:40px;color:#1a4fb5">${t.slice(3)}</div>
  <div style="margin-top:30px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;font-size:24px">${['아침','점심','오후','저녁'].map((x,k)=>`<div style="border:2px solid #555;border-radius:10px;padding:14px;text-align:center">${x}<br><span style="font-size:40px">${'😀🍚🏃🌙'.split(/(?:)/u)[k]}</span></div>`).join('')}</div>
  </div></body></html>`);
  await p.screenshot({ path: `assets/ws${i+1}.jpg`, type: 'jpeg', quality: 85 });
}
await b.close();
