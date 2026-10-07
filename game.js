// ===== Настройки =====
const ROUND_SIZE = 30;  // сколько загадок в одной игре
const TIME = 30;        // секунд на загадку
const SOLVE = 100;      // очков за правильный ответ
const PER_SEC = 3;      // очков за каждую оставшуюся секунду
const GAME_URL = "";    // ссылка на игру — добавляется к результату при копировании, например "https://username.github.io/emoji-zagadki/"

// ===== Сравнение ответов =====
function norm(s){
  return s.toLowerCase().replace(/ё/g,"е")
    .replace(/[^a-zа-я0-9]+/g," ").trim().replace(/\s+/g," ");
}
function lev(a,b){
  const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){
    const cur=[i];
    for(let j=1;j<=n;j++){
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    prev=cur;
  }
  return prev[n];
}
// "exact" | "close" | null
function check(input, r){
  const x=norm(input); if(!x) return null;
  const xs=x.replace(/ /g,"");
  let best=null;
  for(const v of [r.a,...(r.alt||[])]){
    const y=norm(v), ys=y.replace(/ /g,"");
    if(x===y||xs===ys) return "exact";
    const d=lev(xs,ys);
    const allowed = ys.length<=4?0 : ys.length<=7?1 : Math.floor(ys.length*0.2);
    if(d<=allowed) best="close";
  }
  return best;
}
function hintFor(a){
  return a.split(/\s+/).map(w=>{
    const letters=[...w];
    let first=true;
    return letters.map(ch=>{
      if(/[a-zа-яё0-9]/i.test(ch)){ if(first){first=false;return ch.toUpperCase();} return "_"; }
      return ch;
    }).join("");
  }).join("  ");
}
function plural(n,[one,few,many]){
  const a=Math.abs(n)%100,b=a%10;
  if(a>10&&a<20) return many; if(b>1&&b<5) return few; if(b===1) return one; return many;
}
const PTS=["очко","очка","очков"];

// ===== Хранилище рекорда =====
function getBest(){ try{return parseInt(localStorage.getItem("ez_best")||"0",10)||0;}catch(e){return 0;} }
function setBest(v){ try{localStorage.setItem("ez_best",String(v));}catch(e){} }

// ===== Состояние =====
const $=id=>document.getElementById(id);
let mode="classic";   // "classic" | "duel"
let deck=[], idx=0, score=0, left=TIME, tick=null, done=false, hintUsed=false, results=[];

function show(id){ ["start","game","end","duelIntro","duelEnd"].forEach(s=>$(s).classList.toggle("hidden",s!==id)); window.scrollTo(0,0); }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

function renderBest(){
  const b=getBest();
  $("bestStart").textContent = b ? `Твой рекорд: ${b} ${plural(b,PTS)}` : "";
}

function startGame(){
  deck=shuffle(BANK.slice()).slice(0,Math.min(ROUND_SIZE,BANK.length));
  idx=0; score=0; results=[];
  mode="classic"; setClassicUI();
  show("game"); loadRiddle();
}

function loadRiddle(){
  const r=deck[idx];
  done=false; hintUsed=false; left=TIME;
  $("counter").textContent=`Загадка ${idx+1} из ${deck.length}`;
  $("bar").style.width=`${(idx/deck.length)*100}%`;
  $("cat").textContent=r.c;
  $("puzzle").textContent=r.e;
  $("hint").textContent="";
  $("answer").value=""; $("answer").disabled=false; $("sendBtn").disabled=false;
  $("tools").classList.remove("hidden"); $("hintBtn").disabled=false;
  ["msg","reveal","nextBtn"].forEach(id=>$(id).classList.add("hidden"));
  $("nextBtn").textContent = idx===deck.length-1 ? "Узнать результат" : "Следующая загадка";
  renderTimer();
  clearInterval(tick);
  tick=setInterval(()=>{ left--; renderTimer(); if(left<=0) finish(null,"timeout"); },1000);
  $("answer").focus({preventScroll:true});
}

function setClassicUI(){
  $("hintBtn").classList.remove("hidden");
  $("hint").classList.remove("hidden");
  $("skipBtn").disabled=false;
  $("skipBtn").innerHTML='<span class="emo">🏳️</span>Сдаюсь';
}

function renderTimer(){
  $("timer").innerHTML=`<span class="emo">⏱</span> ${Math.max(0,left)} с`;
  $("timer").classList.toggle("low",left<=5);
}

function showMsg(text,kind){
  const m=$("msg"); m.className=`msg ${kind} pop`; m.textContent=text;
}

function submit(){
  if(done) return;
  const val=$("answer").value;
  if(!val.trim()) return;
  const res=check(val,deck[idx]);
  if(res){ finish(res,"solved"); return; }
  showMsg("Не то. Попробуй другую формулировку","bad");
  const f=$("form"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
  $("answer").select();
}

function finish(res,how){
  if(done) return;
  done=true; clearInterval(tick);
  $("answer").disabled=true; $("sendBtn").disabled=true;
  $("tools").classList.add("hidden");
  const r=deck[idx];
  if(how==="solved"){
    const solve = hintUsed ? SOLVE/2 : SOLVE;
    const speed = Math.max(0,left)*PER_SEC;
    const total = solve+speed;
    score+=total;
    const head = res==="exact" ? "Верно!" : "Почти, засчитано!";
    showMsg(`🎉 ${head} +${total} ${plural(total,PTS)} (${solve} за ответ + ${speed} за скорость)`,"ok");
    results.push(hintUsed?"💡":"✅");
  } else if(how==="timeout"){
    showMsg("⏰ Время вышло","bad"); results.push("⏰");
  } else {
    showMsg("Ничего, следующая получится","bad"); results.push("❌");
  }
  const rv=$("reveal"); rv.innerHTML=""; 
  const s=document.createElement("span"); s.className="emo"; s.textContent="✨ ";
  rv.append(s, document.createTextNode(r.a));
  rv.classList.remove("hidden"); rv.classList.add("pop");
  $("nextBtn").classList.remove("hidden");
  $("nextBtn").focus({preventScroll:true});
}

function next(){
  idx++;
  if(idx>=deck.length) endGame(); else loadRiddle();
}

function endGame(){
  clearInterval(tick);
  const solved=results.filter(x=>x==="✅"||x==="💡").length;
  const prev=getBest(), record=score>prev;
  if(record) setBest(score);
  $("endScore").textContent=score;
  $("endTitle").textContent = record ? "Новый рекорд!" : "Игра окончена";
  $("endEmoji").textContent = solved>=deck.length*0.8 ? "🏆" : solved>=deck.length*0.5 ? "🎯" : "🌱";
  $("endSub").textContent = `${plural(score,PTS).replace(/^./,c=>c.toUpperCase())} набрано. Отгадано ${solved} из ${deck.length}.` + (prev&&!record?` Рекорд: ${prev}.`:"");
  const rc=$("recap"); rc.innerHTML="";
  results.forEach(x=>{const s=document.createElement("span"); s.textContent=x; rc.append(s);});
  show("end");
}

function toast(t){
  const el=$("toast"); el.textContent=t; el.classList.remove("hidden");
  clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.add("hidden"),2200);
}

async function copyText(text, okMsg){
  try{ await navigator.clipboard.writeText(text); toast(okMsg); return; }
  catch(e){
    const ta=document.createElement("textarea"); ta.value=text; ta.setAttribute("readonly","");
    ta.style.position="fixed"; ta.style.opacity="0"; document.body.append(ta); ta.select();
    try{ document.execCommand("copy"); toast(okMsg); }catch(_){ toast("Не удалось скопировать"); }
    ta.remove();
  }
}

async function share(){
  const solved=results.filter(x=>x==="✅"||x==="💡").length;
  const rows=[]; for(let i=0;i<results.length;i+=10) rows.push(results.slice(i,i+10).join(""));
  const text=`Эмодзи-загадки 🧩\n${score} ${plural(score,PTS)}, отгадано ${solved} из ${results.length}\n${rows.join("\n")}` + (GAME_URL ? `\n${GAME_URL}` : "");
  copyText(text,"Результат скопирован");
}

// ===== События =====
$("playBtn").onclick=startGame;
$("againBtn").onclick=startGame;
$("shareBtn").onclick=share;
$("form").addEventListener("submit",e=>{e.preventDefault(); mode==="duel" ? duelSubmit() : submit();});
$("nextBtn").onclick=next;
$("skipBtn").onclick=()=>{ mode==="duel" ? duelSkip() : finish(null,"skip"); };
$("hintBtn").onclick=()=>{
  if(done||hintUsed) return;
  hintUsed=true; $("hint").textContent=hintFor(deck[idx].a); $("hintBtn").disabled=true;
  $("answer").focus({preventScroll:true});
};
$("backBtn").onclick=()=>{
  if(confirm("Выйти в меню? Текущая игра не сохранится.")){ clearInterval(tick); stopDuel(); goMenu(); }
};
document.addEventListener("keydown",e=>{
  if(e.key==="Enter" && mode==="classic" && done && !$("game").classList.contains("hidden") && document.activeElement!==$("nextBtn")){ e.preventDefault(); next(); }
});
function goMenu(){ renderBest(); renderDuelButton(); show("start"); }
renderBest();
