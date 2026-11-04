const V={ start:document.getElementById('startView'), quiz:document.getElementById('quizView'),
         answer:document.getElementById('answerView'), end:document.getElementById('endView'),
         activity:document.getElementById('activityView'), saved:document.getElementById('savedView') };
const starsBox=document.getElementById('stars');
let idx=0, score=0, soundOn=true, audioCtx=null;

function beep(t){ if(!soundOn)return; try{ audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.connect(g);g.connect(audioCtx.destination);
  o.frequency.value=t==='ok'?880:240; g.gain.setValueAtTime(.18,audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.35); o.start();o.stop(audioCtx.currentTime+.35);
  if(t==='ok'){ const o2=audioCtx.createOscillator(),g2=audioCtx.createGain(); o2.connect(g2);g2.connect(audioCtx.destination);
    o2.frequency.value=1320; g2.gain.setValueAtTime(.15,audioCtx.currentTime+.12);
    g2.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.5); o2.start(audioCtx.currentTime+.12);o2.stop(audioCtx.currentTime+.5);} }catch(e){} }
function say(t){ if(!soundOn)return; try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.lang='ko-KR'; u.rate=.95; speechSynthesis.speak(u);}catch(e){} }
function show(v){ Object.values(V).forEach(x=>x.classList.add('hide')); v.classList.remove('hide'); }
function buildStars(){ starsBox.innerHTML=''; QUIZ.forEach(()=>{ const s=document.createElement('span'); s.className='star'; s.textContent='⭐'; starsBox.appendChild(s); }); }
function fillStar(i){ const s=starsBox.children[i]; if(s)s.classList.add('on'); }
function showQuestion(){ const q=QUIZ[idx]; const em=document.getElementById('qEmoji');
  em.textContent=q.emoji; em.classList.remove('pop'); void em.offsetWidth; em.classList.add('pop');
  document.getElementById('qName').textContent=q.name; show(V.quiz); say(q.name+'. 이건 똑똑한 에이 아이 물건일까요?'); }
function answer(c){ const q=QUIZ[idx]; const ok=(c==='ai')===q.ai;
  const mas=document.getElementById('aMascot'),ver=document.getElementById('aVerdict'),why=document.getElementById('aWhy');
  if(ok){ score++; mas.textContent='🎉'; ver.textContent='정답이에요!'; ver.style.color='#0F6B59'; fillStar(idx); beep('ok'); confetti(); }
  else{ mas.textContent='🙂'; ver.textContent='아쉬워요, 알아볼까요?'; ver.style.color='#D99A2B'; beep('no'); }
  mas.classList.remove('pop'); void mas.offsetWidth; mas.classList.add('pop');
  why.textContent=(q.ai?'이건 AI 물건! ':'이건 그냥 물건! ')+q.why; show(V.answer);
  say((ok?'정답이에요! ':'아쉬워요. ')+why.textContent); }
function next(){ idx++; if(idx<QUIZ.length) showQuestion(); else showEnd(); }
function showEnd(){ document.getElementById('endScore').textContent=QUIZ.length+'개 중 '+score+'개 맞혔어요';
  const t=document.getElementById('endTitle'); t.textContent = score===QUIZ.length?'완벽해요! 최고!':score>=QUIZ.length-3?'참 잘했어요!':'다시 도전해 볼까요?';
  show(V.end); say(t.textContent+'. '+QUIZ.length+'개 중 '+score+'개 맞혔어요.'); for(let i=0;i<20;i++) setTimeout(confetti,i*90); }
function confetti(){ const ch=['🎉','⭐','✨','🎊','🟡','🟢']; const c=document.createElement('div');
  c.className='confetti'; c.textContent=ch[Math.random()*ch.length|0]; c.style.left=Math.random()*100+'vw';
  c.style.animationDuration=(1.6+Math.random()*1.4)+'s'; document.body.appendChild(c); setTimeout(()=>c.remove(),3200); }
function start(){ idx=0; score=0; buildStars(); starsBox.classList.remove('hide'); showQuestion(); }

/* ===== 마무리 활동: 우리 집 AI 찾기 + 저장 ===== */
let lastCard={name:'',items:[]};
function goActivity(){ starsBox.classList.add('hide'); show(V.activity); say('우리 집에서 본 AI를 적어 봐요.'); }
function collectItems(){ return [...document.querySelectorAll('.airow')].map(r=>r.value.trim()).filter(Boolean); }
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function drawCard(name,items){
  const cv=document.getElementById('cardCanvas'), ctx=cv.getContext('2d'), W=cv.width, H=cv.height;
  const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#149079'); g.addColorStop(1,'#0C5647');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  roundRect(ctx,44,44,W-88,H-88,30); ctx.fillStyle='#FCFCFA'; ctx.fill();
  ctx.textAlign='center'; ctx.fillStyle='#0F6B59'; ctx.font="700 54px Maplestory, sans-serif";
  ctx.fillText('우리 집 AI 지도', W/2, 140);
  ctx.fillStyle='#F4B740'; roundRect(ctx,W/2-72,158,144,9,5); ctx.fill();
  let y=245;
  if(name){ ctx.fillStyle='#61716B'; ctx.font="700 32px Maplestory, sans-serif"; ctx.fillText(name+' 어린이', W/2, 215); y=290; }
  ctx.textAlign='left'; ctx.font="700 38px Maplestory, sans-serif";
  items.slice(0,4).forEach((it,i)=>{ ctx.fillStyle='#F4B740'; ctx.beginPath(); ctx.arc(160,y-13,11,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#1E2B28'; ctx.fillText((i+1)+'.  '+it, 192, y); y+=76; });
  ctx.textAlign='center'; ctx.fillStyle='#AEB8B2'; ctx.font="700 24px Maplestory, sans-serif";
  ctx.fillText('더몬스터 · AI 수업', W/2, H-72);
  return cv;
}
function downloadCard(){ const cv=document.getElementById('cardCanvas');
  cv.toBlob(b=>{ if(!b) return; const a=document.createElement('a'); a.href=URL.createObjectURL(b);
    a.download='우리집AI.png'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000); }); }
async function saveActivity(){
  const name=document.getElementById('nameField').value.trim();
  const items=collectItems();
  if(items.length===0){ say('우리 집 AI를 하나 이상 적어 주세요.'); const f=document.querySelector('.airow'); if(f) f.focus(); return; }
  try{ localStorage.setItem('homeAI_'+Date.now(), JSON.stringify({name,items,date:new Date().toISOString()})); }catch(e){}
  lastCard={name,items};
  try{ await document.fonts.ready; }catch(e){}
  drawCard(name,items); downloadCard();
  document.getElementById('savedMsg').textContent=(name?name+' 어린이가 ':'')+'AI '+items.length+'개를 찾았어요!';
  starsBox.classList.add('hide'); show(V.saved);
  say('저장했어요! 우리 집 AI를 '+items.length+'개나 찾았어요. 참 잘했어요!');
  confetti(); for(let i=0;i<10;i++) setTimeout(confetti,i*100);
}
function goHome(){ starsBox.classList.add('hide'); show(V.start); }

document.getElementById('toActivityBtn').onclick=goActivity;
document.getElementById('saveBtn').onclick=saveActivity;
document.getElementById('downloadBtn').onclick=()=>{ drawCard(lastCard.name,lastCard.items); downloadCard(); };
document.getElementById('homeBtn').onclick=goHome;

document.getElementById('startBtn').onclick=()=>{ try{new (window.AudioContext||window.webkitAudioContext)();}catch(e){} start(); };
document.getElementById('againBtn').onclick=start;
document.getElementById('nextBtn').onclick=next;
document.querySelectorAll('.btn').forEach(b=>b.onclick=()=>answer(b.dataset.ans));
document.getElementById('soundBtn').onclick=function(){ soundOn=!soundOn; this.textContent=soundOn?'🔊':'🔇'; if(!soundOn) speechSynthesis.cancel(); };
