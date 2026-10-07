// ===== Дуэль по ссылке =====
// Первый игрок играет минуту и получает ссылку-вызов. В ссылке зашиты номер набора
// загадок (seed), его результат и имя. Соперник по ссылке получает те же загадки
// в том же порядке, а в конце видит, кто победил.
//
// Важно: порядок загадок зависит от содержимого riddles.js. Если изменить банк
// загадок, старые ссылки-вызовы дадут сопернику другой набор.

const DUEL_TIME = 60;     // секунд на всю дуэль
const SKIP_PENALTY = 5;   // сколько секунд отнимает пропуск
const RIDDLES = ["загадка","загадки","загадок"];

let duel = null;          // состояние текущей дуэли
let invite = null;        // вызов, пришедший по ссылке: {seed, score, name, sig}
let duelTick = null, countdownTimer = null;

// --- Детерминированное перемешивание: одинаковый seed → одинаковый порядок ---
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function seededDeck(seed){
  const r = mulberry32(seed), a = BANK.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function newSeed(){
  try{ return crypto.getRandomValues(new Uint32Array(1))[0]; }
  catch(e){ return Math.floor(Math.random()*4294967296); }
}

// --- Подпись ссылки: защищает от случайной правки результата вручную ---
function sign(seed, score, name){
  let h = 2166136261;
  for(const ch of `${seed}|${score}|${name}|emoji-zagadki`){
    h ^= ch.codePointAt(0); h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0,5);
}
function baseUrl(){ return location.href.split(/[?#]/)[0]; }
function makeLink(seed, score, name){
  const p = new URLSearchParams();
  p.set("duel", `${seed.toString(36)}.${score}.${sign(seed,score,name)}`);
  if(name) p.set("from", name);
  return `${baseUrl()}?${p.toString()}`;
}
function readInvite(){
  const p = new URLSearchParams(location.search);
  const raw = p.get("duel"); if(!raw) return null;
  const name = (p.get("from") || "").slice(0,20);
  const [s36, sc, sig] = raw.split(".");
  const seed = parseInt(s36, 36), score = parseInt(sc, 10);
  if(!Number.isFinite(seed) || !Number.isFinite(score) || score < 0 || sig !== sign(seed, score, name)) return "bad";
  return {seed, score, name, sig};
}
function clearInviteFromUrl(){
  try{ history.replaceState(null, "", baseUrl()); }catch(e){}
}

// --- Имя игрока и сыгранные дуэли (в браузере) ---
function getName(){ try{ return localStorage.getItem("ez_name") || ""; }catch(e){ return ""; } }
function setName(v){ try{ localStorage.setItem("ez_name", v); }catch(e){} }
function playedKey(inv){ return `ez_duel_${inv.seed.toString(36)}_${inv.score}_${inv.sig}`; }
function getPlayed(inv){
  try{ const v = localStorage.getItem(playedKey(inv)); return v === null ? null : parseInt(v,10); }catch(e){ return null; }
}
function setPlayed(inv, score){ try{ localStorage.setItem(playedKey(inv), String(score)); }catch(e){} }

// --- Экран перед дуэлью ---
function renderDuelButton(){
  $("duelBtn").innerHTML = invite
    ? '<span class="emo">⚔️</span> Принять вызов'
    : '<span class="emo">⚔️</span> Дуэль с другом';
}

function openDuelIntro(){
  if(invite){
    const already = getPlayed(invite);
    if(already !== null){ showDuelResult(already, true); return; }
    $("duelTitle").textContent = invite.name ? `${invite.name} вызывает тебя на дуэль` : "Тебя вызывают на дуэль";
    $("duelLead").textContent = `Результат соперника: ${invite.score} ${plural(invite.score,RIDDLES)} за минуту. Отгадай больше, чтобы победить.`;
    $("duelSame").textContent = "У тебя будут те же загадки, что у соперника";
    $("duelStartBtn").textContent = "Принять вызов";
  } else {
    $("duelTitle").textContent = "Дуэль с другом";
    $("duelLead").textContent = "Сыграй минуту, а потом отправь ссылку другу. Кто отгадает больше, тот и победил.";
    $("duelSame").textContent = "Другу достанутся те же загадки в том же порядке";
    $("duelStartBtn").textContent = "Начать дуэль";
  }
  $("duelName").value = getName();
  show("duelIntro");
}

// --- Игра ---
function setDuelUI(){
  $("hintBtn").classList.add("hidden");
  $("skipBtn").innerHTML = `<span class="emo">⏭️</span>Пропустить (−${SKIP_PENALTY} с)`;
  ["msg","reveal","nextBtn","hint"].forEach(id => $(id).classList.add("hidden"));
  $("hint").textContent = "";
  $("tools").classList.remove("hidden");
}

function startDuel(){
  const name = $("duelName").value.trim().slice(0,20);
  setName(name);
  const seed = invite ? invite.seed : newSeed();
  duel = { seed, name, queue: seededDeck(seed), i: 0, solved: 0, skipped: 0, endAt: 0, over: false };
  mode = "duel"; setDuelUI(); show("game");

  // отсчёт 3-2-1
  $("answer").value = ""; $("answer").disabled = true; $("sendBtn").disabled = true;
  $("skipBtn").disabled = true;
  $("counter").textContent = "Отгадано: 0";
  $("cat").textContent = "Приготовься";
  $("bar").style.width = "100%";
  renderDuelTimer(DUEL_TIME*1000);
  const steps = ["3️⃣","2️⃣","1️⃣"]; let k = 0;
  $("puzzle").textContent = steps[0];
  countdownTimer = setInterval(() => {
    k++;
    if(k < steps.length){ $("puzzle").textContent = steps[k]; return; }
    clearInterval(countdownTimer); countdownTimer = null;
    beginDuel();
  }, 800);
}

function beginDuel(){
  $("answer").disabled = false; $("sendBtn").disabled = false; $("skipBtn").disabled = false;
  duel.endAt = Date.now() + DUEL_TIME*1000;
  duelLoad();
  duelTick = setInterval(() => {
    const rem = duel.endAt - Date.now();
    renderDuelTimer(rem);
    if(rem <= 0) duelOver();
  }, 100);
}

function renderDuelTimer(remMs){
  const s = Math.max(0, Math.ceil(remMs/1000));
  $("timer").innerHTML = `<span class="emo">⏱</span> ${s} с`;
  $("timer").classList.toggle("low", s <= 10);
  $("bar").style.width = `${Math.max(0, remMs) / (DUEL_TIME*1000) * 100}%`;
}

function duelLoad(){
  if(duel.i >= duel.queue.length){ duelOver(); return; }
  const r = duel.queue[duel.i];
  $("cat").textContent = r.c;
  $("puzzle").textContent = r.e;
  $("answer").value = "";
  $("counter").textContent = `Отгадано: ${duel.solved}`;
  $("answer").focus({preventScroll:true});
}

function duelSubmit(){
  if(!duel || duel.over || !duel.endAt) return;
  const val = $("answer").value;
  if(!val.trim()) return;
  const r = duel.queue[duel.i];
  if(check(val, r)){
    duel.solved++; duel.i++;
    showMsg(`✅ ${r.a}`, "ok");
    duelLoad();
  } else {
    showMsg("Не то. Попробуй ещё или пропусти", "bad");
    const f = $("form"); f.classList.remove("shake"); void f.offsetWidth; f.classList.add("shake");
    $("answer").select();
  }
}

function duelSkip(){
  if(!duel || duel.over || !duel.endAt) return;
  const r = duel.queue[duel.i];
  duel.skipped++; duel.i++;
  duel.endAt -= SKIP_PENALTY*1000;
  showMsg(`⏭️ Это было: ${r.a}`, "bad");
  renderDuelTimer(duel.endAt - Date.now());
  if(duel.endAt <= Date.now()){ duelOver(); return; }
  duelLoad();
}

function stopDuel(){
  clearInterval(duelTick); duelTick = null;
  clearInterval(countdownTimer); countdownTimer = null;
  if(duel) duel.over = true;
}

function duelOver(){
  if(!duel || duel.over) return;
  stopDuel();
  renderDuelTimer(0);
  $("answer").disabled = true; $("sendBtn").disabled = true; $("skipBtn").disabled = true;
  showMsg("⏰ Время вышло!", "bad");
  setTimeout(() => {
    if(invite){
      setPlayed(invite, duel.solved);
      clearInviteFromUrl();
      showDuelResult(duel.solved, false);
    } else {
      showChallenge();
    }
  }, 900);
}

// --- Итоги ---
function setEndButtons(primary, secondary){
  $("dPrimary").textContent = primary;
  $("dSecondary").textContent = secondary;
}

function showChallenge(){
  const link = makeLink(duel.seed, duel.solved, duel.name);
  duel.link = link;
  $("dEmoji").textContent = "🎯";
  $("dTitle").textContent = "Твой результат";
  $("dVs").classList.add("hidden");
  $("dScore").classList.remove("hidden");
  $("dScore").textContent = duel.solved;
  $("dSub").textContent = `${plural(duel.solved,RIDDLES).replace(/^./,c=>c.toUpperCase())} за минуту. Отправь вызов другу: ему достанутся те же загадки.`;
  $("dLink").textContent = link;
  $("dLinkBox").classList.remove("hidden");
  setEndButtons("Отправить вызов", "Скопировать ссылку");
  $("dPrimary").onclick = () => shareOrCopy(challengeText(link));
  $("dSecondary").onclick = () => copyText(link, "Ссылка скопирована");
  show("duelEnd");
}

function challengeText(link){
  const n = duel.solved;
  return `⚔️ Вызываю тебя на дуэль в «Эмодзи-загадки»!\nМой результат: ${n} ${plural(n,RIDDLES)} за минуту. Сможешь больше?\n${link}`;
}

function showDuelResult(mine, already){
  const theirs = invite.score;
  const rival = invite.name || "Соперник";
  const verdict = mine > theirs ? "win" : mine < theirs ? "lose" : "draw";
  $("dEmoji").textContent = {win:"🏆", lose:"😤", draw:"🤝"}[verdict];
  $("dTitle").textContent = {win:"Победа!", lose:"Поражение", draw:"Ничья"}[verdict];
  $("dScore").classList.add("hidden");
  $("dVs").classList.remove("hidden");
  $("dMeNum").textContent = mine;
  $("dRivalNum").textContent = theirs;
  $("dRivalName").textContent = rival;
  $("dMe").classList.toggle("win", verdict === "win");
  $("dRival").classList.toggle("win", verdict === "lose");
  $("dSub").textContent = already
    ? "Эта дуэль уже сыграна. Вызови соперника на реванш с новыми загадками."
    : "Отправь сопернику результат или вызови на реванш с новыми загадками.";
  $("dLinkBox").classList.add("hidden");
  setEndButtons("Реванш", "Отправить результат");
  $("dPrimary").onclick = () => { invite = null; clearInviteFromUrl(); renderDuelButton(); openDuelIntro(); };
  const text = resultText(mine, theirs, verdict);
  $("dSecondary").onclick = () => shareOrCopy(text);
  show("duelEnd");
}

function resultText(mine, theirs, verdict){
  const head = {win:"Победа за мной! 🏆", lose:"В этот раз ты сильнее 😤", draw:"Ничья! 🤝"}[verdict];
  const url = GAME_URL || baseUrl();
  return `⚔️ Дуэль в «Эмодзи-загадки»: я ${mine}, ты ${theirs}. ${head}\n${url}`;
}

// На телефонах открываем системное меню «Поделиться», на компьютере просто копируем
async function shareOrCopy(text){
  const touch = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  if(navigator.share && touch){
    try{ await navigator.share({ text }); return; }
    catch(e){ if(e && e.name === "AbortError") return; }
  }
  copyText(text, "Скопировано, можно вставлять в чат");
}

// --- Запуск ---
(function initDuel(){
  const inv = readInvite();
  if(inv === "bad"){
    clearInviteFromUrl();
    toast("Ссылка на дуэль повреждена, попроси прислать её заново");
  } else if(inv){
    invite = inv;
    renderDuelButton();
    openDuelIntro();
  }
  renderDuelButton();
  $("duelBtn").onclick = openDuelIntro;
  $("duelStartBtn").onclick = startDuel;
  $("duelMenuBtn").onclick = goMenu;
  $("dMenu").onclick = goMenu;
})();
