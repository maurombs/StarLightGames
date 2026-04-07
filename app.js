const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const restartBtn = document.getElementById('restart');

const COLS = 60; // grid columns (increased)
const ROWS = 40; // grid rows (increased)
const CELL_W = Math.floor(canvas.width / COLS);
const CELL_H = Math.floor(canvas.height / ROWS);

// smooth movement parameters (cells are grid units)
const MOVE_SPEED = 0.7; // cells per tick (player)
const AI_MOVE_SPEED = 0.85; // AI moves faster
const SEGMENT_SPACING = 1.0; // desired spacing between segments (in cells)
const MAX_TURN = Math.PI / 8; // max radians the head can turn per tick (player)
const AI_MAX_TURN = Math.PI / 6; // AI can turn sharper
const COLLIDE_RADIUS = 0.6; // collision radius in cells

let snake; // array of {x,y}
let dir; // {x,y}
let nextDir;
// support multiple AI snakes
const AI_COUNT = 3;
let aiSnakes = []; // each: {body: [{x,y}], angle, desiredAngle, score}
let foods = [];
let running = false;
let playerScore = 0;
// aiScore will be computed as sum of aiSnakes[*].score
let speed = 160; // ms per tick (slower)
let tickTimer = null;
// RAF id and last tick time are used to drive the game loop
let rafId = null;
let lastTickTime = 0;
let playerAngle = 0;
let playerDesiredAngle = null;
let fruitPattern = null;

function reset(){
  // start with a short snake made of several segments (positions in grid units, floats)
  const cx = Math.floor(COLS/2);
  const cy = Math.floor(ROWS/2);
  snake = [];
  const initLen = 5;
  for (let i=0;i<initLen;i++) snake.push({x: cx - i, y: cy});
  playerAngle = 0;
  playerDesiredAngle = 0;
  // initialize AI snakes away from player (float positions)
  aiSnakes = [];
  const baseX = Math.floor(COLS/4);
  const baseY = Math.floor(ROWS/2);
  for (let a=0;a<AI_COUNT;a++){
    const body = [];
    // spread AIs vertically so they don't overlap
    for (let i=0;i<3;i++) body.push({x: baseX - i - a*3, y: baseY + a*2});
    aiSnakes.push({ body, angle: 0, desiredAngle: 0, score: 0 });
  }
  placeFoods(getFoodCount());
  playerScore = 0;
  for (const a of aiSnakes) a.score = 0;
  updateScore();
  running = true;
  // reset RAF timing
  lastTickTime = 0;
  // create cached fruit pattern for background
  if (!fruitPattern) fruitPattern = createFruitPattern();
  draw();
}

// create an offscreen canvas pattern with small, faint fruits
function createFruitPattern(){
  const w = 240, h = 160;
  const pc = document.createElement('canvas'); pc.width = w; pc.height = h;
  const p = pc.getContext('2d');
  p.clearRect(0,0,w,h);
  const types = ['cherry','banana','apple','orange'];
  for (let i=0;i<24;i++){
    const x = Math.random()*w, y = Math.random()*h;
    const t = types[Math.floor(Math.random()*types.length)];
    p.save(); p.translate(x,y); p.globalAlpha = 0.12 + Math.random()*0.06; p.shadowColor = 'rgba(0,0,0,0.06)'; p.shadowBlur = 2;
    // draw small simplified fruit
    const s = 18 + Math.random()*10;
    if (t === 'cherry'){
      p.fillStyle = '#d12a2a'; p.beginPath(); p.ellipse(-s*0.28,0,s*0.48,s*0.48,0,0,Math.PI*2); p.fill();
      p.beginPath(); p.ellipse(s*0.28,0,s*0.48,s*0.48,0,0,Math.PI*2); p.fill();
    } else if (t === 'banana'){
      p.fillStyle = '#ffd23f'; p.beginPath(); p.moveTo(-s*0.6,0); p.quadraticCurveTo(-s*0.2,-s*0.9,s*0.6,-s*0.1); p.quadraticCurveTo(s*0.2,s*0.9,-s*0.6,s*0.2); p.closePath(); p.fill();
    } else if (t === 'apple'){
      p.fillStyle = '#ff3b3b'; p.beginPath(); p.ellipse(0,0,s*0.6,s*0.6,0,0,Math.PI*2); p.fill();
    } else { // orange
      p.fillStyle = '#ff8a00'; p.beginPath(); p.ellipse(0,0,s*0.55,s*0.55,0,0,Math.PI*2); p.fill();
    }
    p.restore();
  }
  return ctx.createPattern(pc, 'repeat');
}

function getFoodCount(){
  try{ return Math.max(1, Math.min(20, Number(document.getElementById('foodCount')?.value || 1))); }catch(e){ return 1 }
}

function placeFood(){
  for (let i=0;i<300;i++){
    const x = Math.floor(Math.random()*COLS);
    const y = Math.floor(Math.random()*ROWS);
    const collidePlayer = snake.some(s=>Math.round(s.x)===x && Math.round(s.y)===y);
    let collideAI = false;
    for (const a of aiSnakes) { if (a.body.some(s=>Math.round(s.x)===x && Math.round(s.y)===y)){ collideAI = true; break; } }
    const collide = collidePlayer || collideAI || foods.some(f=>f.x===x && f.y===y);
    if (!collide){ foods.push({x,y, type: randomFruitType()}); return; }
  }
}

function placeFoods(count){
  foods = [];
  for (let i=0;i<count;i++) placeFood();
}

function randomFruitType(){
  const types = ['cherry','banana','apple','orange'];
  return types[Math.floor(Math.random()*types.length)];
}

function drawFruit(f){
  // f: {x,y,type}
  const cx = f.x * CELL_W + CELL_W/2;
  const cy = f.y * CELL_H + CELL_H/2;
  const s = Math.min(CELL_W, CELL_H) * 2.25;
  ctx.save();
  ctx.translate(cx, cy);
  // slight shadow
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 6;

  if (f.type === 'cherry'){
    // two red circles with stems
    const r = s * 0.48;
    ctx.fillStyle = '#d12a2a';
    ctx.beginPath(); ctx.ellipse(-r*0.4, 0, r, r, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r*0.4, 0, r, r, 0, 0, Math.PI*2); ctx.fill();
    // stems
    ctx.strokeStyle = '#2f6b2f'; ctx.lineWidth = Math.max(2, s*0.06);
    ctx.beginPath(); ctx.moveTo(-r*0.4, -r*0.5); ctx.quadraticCurveTo(-r*0.6, -r*0.9, -r*0.2, -r*1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r*0.4, -r*0.5); ctx.quadraticCurveTo(r*0.6, -r*0.9, r*0.2, -r*1.2); ctx.stroke();
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r*0.55, -r*0.25, r*0.22, r*0.28, -0.4, 0, Math.PI*2); ctx.fill();
  } else if (f.type === 'banana'){
    // banana shape (curved)
    const w = s * 1.1, h = s * 0.6;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(-w*0.6, 0);
    ctx.quadraticCurveTo(-w*0.2, -h, w*0.6, -h*0.1);
    ctx.quadraticCurveTo(w*0.2, h, -w*0.6, h*0.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#b58b1f'; ctx.lineWidth = Math.max(1, s*0.05); ctx.stroke();
  } else if (f.type === 'apple'){
    // apple round with small top indent and leaf
    const r = s * 0.6;
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r*0.95, 0, 0, Math.PI*2); ctx.fill();
    // top indent
    ctx.fillStyle = '#d92b2b'; ctx.beginPath(); ctx.ellipse(0, -r*0.25, r*0.55, r*0.35, 0, 0, Math.PI*2); ctx.fill();
    // leaf
    ctx.fillStyle = '#3aa14a'; ctx.beginPath(); ctx.ellipse(-r*0.35, -r*0.9, r*0.25, r*0.12, -0.6, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-r*0.2, -r*0.05, r*0.18, r*0.22, -0.6, 0, Math.PI*2); ctx.fill();
  } else if (f.type === 'orange'){
    const r = s * 0.55; ctx.fillStyle = '#ff8a00'; ctx.beginPath(); ctx.ellipse(0,0,r,r,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffd9b3'; ctx.beginPath(); ctx.ellipse(-r*0.25,-r*0.15,r*0.14,r*0.12,0,0,Math.PI*2); ctx.fill();
  } else {
    // fallback dot
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.ellipse(0,0,s*0.5,s*0.5,0,0,Math.PI*2); ctx.fill();
  }

  ctx.restore();
}

function updateScore(){
  scoreEl.textContent = 'Player: ' + playerScore;
  for (let i=0;i<aiSnakes.length;i++){
    const aiEl = document.getElementById('aiScore'+i);
    if (aiEl) aiEl.textContent = 'AI '+(i+1)+': '+(aiSnakes[i].score||0);
  }
  updateLeaderboard();
}

function updateLeaderboard(){
  const lp = document.getElementById('leaderPlayer');
  if (lp) lp.textContent = playerScore;
  for (let i=0;i<aiSnakes.length;i++){
    const la = document.getElementById('leaderAI'+i);
    if (la) la.textContent = (aiSnakes[i].score||0);
  }
  const allScores = [{id: 'player', score: playerScore}];
  for (let i=0;i<aiSnakes.length;i++) allScores.push({id:'ai'+i, score: aiSnakes[i].score||0});
  const maxScore = Math.max(...allScores.map(s=>s.score), 0);
  document.querySelectorAll('.leader-list li').forEach(li=>li.style.background='');
  for (const entry of allScores){
    if (entry.score === maxScore && maxScore > 0){
      const item = document.querySelector('.leader-list li[data-id="'+entry.id+'"]');
      if (item) item.style.background = 'linear-gradient(90deg, rgba(255,215,102,0.06), rgba(255,215,102,0.02))';
    }
  }
}

// helper to darken/lighten colors (moved out of draw to avoid per-frame allocation)
function shadeColor(c, percent) {
  try{
    if (typeof c === 'string' && c.startsWith('hsl')) return c;
    const hex = String(c).replace('#','');
    const num = parseInt(hex,16);
    const r = (num>>16) + Math.round(2.55*percent);
    const g = ((num>>8)&0x00FF) + Math.round(2.55*percent);
    const b = (num&0x0000FF) + Math.round(2.55*percent);
    const nr = Math.max(0,Math.min(255,r));
    const ng = Math.max(0,Math.min(255,g));
    const nb = Math.max(0,Math.min(255,b));
    return `rgb(${nr},${ng},${nb})`;
  }catch(e){return c}
}

// draw a single rounded, shaded snake segment (moved out of draw)
function drawSegment(x, y, color, isHead, dirVec){
  const cx = x*CELL_W + CELL_W/2;
  const cy = y*CELL_H + CELL_H/2;
  const r = Math.min(CELL_W, CELL_H) * 0.6;
  // Body gradient
  const g = ctx.createRadialGradient(cx - r*0.2, cy - r*0.2, r*0.1, cx, cy, r);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.2, color);
  g.addColorStop(1, shadeColor(color, -18));
  ctx.save();
  // reduced shadow for performance
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI*2);
  ctx.fill();
  // subtle scales highlight (reduced loops)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for(let a= -1; a<=1; a++){
    ctx.beginPath();
    ctx.ellipse(cx - r*0.15 + a*1.2, cy - r*0.18 + a*0.5, r*0.7, r*0.4, 0, Math.PI*0.1, Math.PI*0.9);
    ctx.stroke();
  }
  ctx.restore();
  // head eyes
  if (isHead && dirVec){
    const ex = cx + (dirVec.x||0) * r*0.35;
    const ey = cy + (dirVec.y||0) * r*0.35;
    const eyeOffset = r*0.36;
    const eyeSize = Math.max(2, r*0.14);
    ctx.fillStyle = '#041117';
    ctx.beginPath();
    ctx.ellipse(ex - (dirVec.y||0)*eyeOffset, ey + (dirVec.x||0)*eyeOffset, eyeSize, eyeSize*1.05, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(ex + (dirVec.y||0)*eyeOffset, ey - (dirVec.x||0)*eyeOffset, eyeSize, eyeSize*1.05, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(ex - (dirVec.y||0)*eyeOffset - eyeSize*0.2, ey + (dirVec.x||0)*eyeOffset - eyeSize*0.2, Math.max(1, eyeSize*0.2), 0, Math.PI*2); ctx.fill();
  }
}

// draw a small crown centered on grid cell (x,y)
function drawCrownAtCell(x, y, size){
  const cx = x*CELL_W + CELL_W/2;
  const cy = y*CELL_H + CELL_H/2;
  const r = (size || Math.min(CELL_W, CELL_H) * 1.2) * 0.98;
  ctx.save();
  ctx.translate(cx, cy - r*0.6);
  // soft drop shadow/glow
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = Math.max(4, r*0.25);

  // gold gradient for crown
  const grad = ctx.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.4, '#ffd43b');
  grad.addColorStop(1, '#d08b14');

  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(128,84,10,0.9)';
  ctx.lineWidth = Math.max(1, r*0.06);

  // crown spikes
  const spikeCount = 5;
  const spikeW = r * 0.42;
  ctx.beginPath();
  // left base
  ctx.moveTo(-r*1.05, r*0.32);
  // spikes across
  for (let i = 0; i < spikeCount; i++){
    const t = i/(spikeCount-1);
    const px = (t - 0.5) * r * 1.8;
    const peak = -r*0.95 + Math.sin(t*Math.PI)*r*0.06;
    ctx.lineTo(px - spikeW*0.15, r*0.32);
    ctx.lineTo(px, peak);
    ctx.lineTo(px + spikeW*0.15, r*0.32);
  }
  // right base
  ctx.lineTo(r*1.05, r*0.32);
  // bottom arc to make the base rounded
  ctx.quadraticCurveTo(r*0.6, r*0.95, 0, r*0.7);
  ctx.quadraticCurveTo(-r*0.6, r*0.95, -r*1.05, r*0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // (gems removed for cleaner crown look)

  // top highlight
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(-r*0.25, -r*0.55, Math.max(1, r*0.12), Math.max(1, r*0.10), -0.25, 0, Math.PI*2); ctx.fill();
  ctx.globalAlpha = 1;

  // subtle outline
  ctx.strokeStyle = 'rgba(255,230,150,0.08)'; ctx.lineWidth = 1; ctx.stroke();

  ctx.restore();
}


function isOccupied(x,y){
  if (snake.some(s=>Math.round(s.x)===x && Math.round(s.y)===y)) return true;
  for (const a of aiSnakes){ if (a.body.some(s=>Math.round(s.x)===x && Math.round(s.y)===y)) return true; }
  return false;
}

// compute desired angle for a specific AI index
function aiDecideFor(index){
  const ai = aiSnakes[index];
  const head = ai.body[0];
  if (!foods || foods.length === 0) { ai.desiredAngle = ai.angle; return; }
  // find nearest food (Euclidean)
  let target = foods[0];
  let best = (head.x - target.x)*(head.x - target.x) + (head.y - target.y)*(head.y - target.y);
  for (const f of foods){
    const d = (head.x - f.x)*(head.x - f.x) + (head.y - f.y)*(head.y - f.y);
    if (d < best){ best = d; target = f; }
  }
  ai.desiredAngle = Math.atan2(target.y - head.y, target.x - head.x);
  // avoidance: test small offsets if immediate predicted cell is blocked
  function angleDiff(a,b){ let d = b - a; while(d > Math.PI) d -= 2*Math.PI; while(d < -Math.PI) d += 2*Math.PI; return d; }
  function clamp(v,m){ return Math.max(-m, Math.min(m, v)); }
  const dAng = clamp(angleDiff(ai.angle, ai.desiredAngle), AI_MAX_TURN);
  const testAng = ai.angle + dAng;
  const nx = head.x + Math.cos(testAng)*AI_MOVE_SPEED;
  const ny = head.y + Math.sin(testAng)*AI_MOVE_SPEED;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || isOccupied(Math.round(nx), Math.round(ny))){
    const offsets = [Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2, Math.PI*0.75, -Math.PI*0.75];
    for (const off of offsets){
      const a = ai.angle + off;
      const tx = head.x + Math.cos(a)*AI_MOVE_SPEED;
      const ty = head.y + Math.sin(a)*AI_MOVE_SPEED;
      if (tx >= 0 && tx < COLS && ty >=0 && ty < ROWS && !isOccupied(Math.round(tx), Math.round(ty))){ ai.desiredAngle = a; break; }
    }
  }
}

function resetAI(index){
  // respawn specific AI at a random empty location, reset its score
  aiSnakes[index].score = 0;
  for (let i=0;i<200;i++){
    const ax = Math.floor(Math.random()*(COLS-6))+3;
    const ay = Math.floor(Math.random()*(ROWS-4))+2;
    // ensure three cells free
    if (!isOccupied(ax,ay) && !isOccupied(ax-1,ay) && !isOccupied(ax-2,ay)){
      const body = [{x:ax,y:ay},{x:ax-1,y:ay},{x:ax-2,y:ay}];
      aiSnakes[index].body = body;
      aiSnakes[index].angle = 0;
      aiSnakes[index].desiredAngle = 0;
      updateScore();
      return;
    }
  }
}

function tick(){
  // continuous movement tick for multiple AIs: compute desires then step each AI, then player
  // compute desired angles for each AI
  for (let i=0;i<aiSnakes.length;i++) aiDecideFor(i);

  // helpers
  function angleDiff(a,b){ let d = b - a; while(d > Math.PI) d -= 2*Math.PI; while(d < -Math.PI) d += 2*Math.PI; return d; }
  function clamp(v,m){ return Math.max(-m, Math.min(m, v)); }

  // compute AI moves
  const aiNextPositions = [];
  for (let i=0;i<aiSnakes.length;i++){
    const ai = aiSnakes[i];
    if (ai.desiredAngle == null) ai.desiredAngle = ai.angle;
    const dAi = clamp(angleDiff(ai.angle, ai.desiredAngle), AI_MAX_TURN);
    ai.angle += dAi;
    const head = ai.body[0];
    aiNextPositions[i] = { x: head.x + Math.cos(ai.angle)*AI_MOVE_SPEED, y: head.y + Math.sin(ai.angle)*AI_MOVE_SPEED };
  }

  // compute player next
  if (typeof playerDesiredAngle !== 'number') { /* keep playerAngle */ }
  const dP = (typeof playerDesiredAngle === 'number') ? clamp(angleDiff(playerAngle, playerDesiredAngle), MAX_TURN) : 0;
  playerAngle += dP;
  const playerHead = snake[0];
  const playerNext = { x: playerHead.x + Math.cos(playerAngle)*MOVE_SPEED, y: playerHead.y + Math.sin(playerAngle)*MOVE_SPEED };

  // check head-on collisions between any AI head next and playerNext: if any AI collides head-on, reset that AI only
  for (let i=0;i<aiSnakes.length;i++){
    const nx = aiNextPositions[i];
    const dx = nx.x - playerNext.x; const dy = nx.y - playerNext.y;
    if ((dx*dx + dy*dy) <= (COLLIDE_RADIUS*COLLIDE_RADIUS)){
      resetAI(i);
      // allow player to move (we don't break because multiple AIs could collide)
    }
  }

  // apply AI moves
  for (let i=0;i<aiSnakes.length;i++){
    const ai = aiSnakes[i];
    const nextPos = aiNextPositions[i];
    let died = false;
    if (nextPos.x < 0 || nextPos.x >= COLS || nextPos.y < 0 || nextPos.y >= ROWS) died = true;
    // collide with itself
    if (!died){ for (let j=1;j<ai.body.length;j++){ const s = ai.body[j]; const dx = s.x - nextPos.x; const dy = s.y - nextPos.y; if (dx*dx+dy*dy <= COLLIDE_RADIUS*COLLIDE_RADIUS){ died = true; break; } } }
    // collide with player body
    if (!died){ for (let j=0;j<snake.length;j++){ const s = snake[j]; const dx = s.x - nextPos.x; const dy = s.y - nextPos.y; if (dx*dx+dy*dy <= COLLIDE_RADIUS*COLLIDE_RADIUS){ died = true; break; } } }
    // collide with other AI bodies
    if (!died){ for (let k=0;k<aiSnakes.length;k++){ if (k===i) continue; for (const s of aiSnakes[k].body){ const dx = s.x - nextPos.x; const dy = s.y - nextPos.y; if (dx*dx+dy*dy <= COLLIDE_RADIUS*COLLIDE_RADIUS){ died = true; break; } } if (died) break; } }

    if (died){ resetAI(i); }
    else {
      ai.body.unshift(nextPos);
      // eat
      let ate = false;
      for (let f=0; f<foods.length; f++){ const fr = foods[f]; const dx = fr.x - nextPos.x; const dy = fr.y - nextPos.y; if (dx*dx+dy*dy <= (0.8*0.8)){ ate = true; foods.splice(f,1); ai.score++; updateScore(); placeFood(); break; } }
      if (!ate) ai.body.pop();
      // reposition segments
      for (let s=1;s<ai.body.length;s++){ const prev = ai.body[s-1]; const cur = ai.body[s]; const dx = cur.x - prev.x; const dy = cur.y - prev.y; const ang = Math.atan2(dy,dx); ai.body[s].x = prev.x + Math.cos(ang)*SEGMENT_SPACING; ai.body[s].y = prev.y + Math.sin(ang)*SEGMENT_SPACING; }
    }
  }

  // now apply player move (validate against updated AI bodies)
  if (playerNext.x < 0 || playerNext.x >= COLS || playerNext.y < 0 || playerNext.y >= ROWS){ die(); return; }
  for (let i=2;i<snake.length;i++){ const s = snake[i]; const dx = s.x - playerNext.x; const dy = s.y - playerNext.y; if (dx*dx+dy*dy <= COLLIDE_RADIUS*COLLIDE_RADIUS){ die(); return; } }
  for (let i=0;i<aiSnakes.length;i++){ for (const s of aiSnakes[i].body){ const dx = s.x - playerNext.x; const dy = s.y - playerNext.y; if (dx*dx+dy*dy <= COLLIDE_RADIUS*COLLIDE_RADIUS){ die(); return; } } }

  snake.unshift(playerNext);
  let playerAte = false;
  for (let f=0; f<foods.length; f++){ const fr = foods[f]; const dx = fr.x - playerNext.x; const dy = fr.y - playerNext.y; if (dx*dx+dy*dy <= (0.8*0.8)){ playerAte = true; foods.splice(f,1); playerScore++; updateScore(); placeFood(); break; } }
  if (!playerAte) snake.pop();
  for (let i=1;i<snake.length;i++){ const prev = snake[i-1]; const cur = snake[i]; const dx = cur.x - prev.x; const dy = cur.y - prev.y; const ang = Math.atan2(dy,dx); snake[i].x = prev.x + Math.cos(ang)*SEGMENT_SPACING; snake[i].y = prev.y + Math.sin(ang)*SEGMENT_SPACING; }

  draw();
}

// game tick driver using requestAnimationFrame for stable timing
function rafLoop(ts){
  if (!lastTickTime) lastTickTime = ts;
  const elapsed = ts - lastTickTime;
  if (elapsed >= speed){
    tick();
    lastTickTime = ts;
  }
  rafId = requestAnimationFrame(rafLoop);
}

function die(){
  running = false;
  clearInterval(tickTimer);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#ff6b6b';
  ctx.font = '32px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Game Over', canvas.width/2, canvas.height/2 - 10);
  ctx.font = '18px system-ui';
  ctx.fillText('Press Restart to play again', canvas.width/2, canvas.height/2 + 20);
}

function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // colorful background gradient
  const bg = ctx.createLinearGradient(0,0,0,canvas.height);
  bg.addColorStop(0, '#071024');
  bg.addColorStop(0.6, '#0b2340');
  bg.addColorStop(1, '#071836');
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // overlay faint tiled fruit pattern for background texture
  if (fruitPattern){
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = fruitPattern;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.restore();
  }

  // draw pulsing foods with radial gradient
  const now = performance.now();
  for (let i=0;i<foods.length;i++){
    drawFruit(foods[i]);
  }

  // draw snake with rainbow body
  ctx.lineWidth = 1;

  for(let i=snake.length-1;i>=0;i--){
    const s = snake[i];
    let color;
    if (i === 0) color = '#66fff0';
    else {
      const hue = (i * 24) % 360;
      color = `hsl(${hue},80%,45%)`;
    }
    // provide head direction for eyes (use angle)
    const dirVec = (i===0) ? {x: Math.cos(playerAngle), y: Math.sin(playerAngle)} : null;
    drawSegment(s.x, s.y, color, i===0, dirVec);
    // crown on player if player leads total AI score
    const totalAi = aiSnakes.reduce((s,a)=>s + (a.score||0), 0);
    if (i===0 && playerScore > totalAi){ drawCrownAtCell(s.x, s.y); }
  }
  // draw AI snake on top/back with similar segment style
  for (let aidx=0;aidx<aiSnakes.length;aidx++){
    const snakeObj = aiSnakes[aidx];
    if (!snakeObj || !snakeObj.body) continue;
    for (let i=snakeObj.body.length-1;i>=0;i--){
      const s = snakeObj.body[i];
      const color = (i===0) ? '#d9a3ff' : `hsl(${200 + (i*14)%160},70%,55%)`;
      const dirVec = (i===0) ? {x: Math.cos(snakeObj.angle), y: Math.sin(snakeObj.angle)} : null;
      drawSegment(s.x, s.y, color, i===0, dirVec);
      // crown on the leading AI (if total AI score is less than some individual AI)
      const totalAi = aiSnakes.reduce((s,a)=>s + (a.score||0), 0);
      // place crown on this AI head if its score is the highest among AIs and it leads the player
      const maxAiScore = Math.max(...aiSnakes.map(a=>a.score||0), 0);
      if (i===0 && (snakeObj.score||0) === maxAiScore && maxAiScore > playerScore){ drawCrownAtCell(s.x, s.y); }
    }
  }
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if (typeof stroke === 'undefined') stroke = true;
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.stroke();
  }
}

// keyboard handling supporting diagonals by tracking pressed keys
const keyState = {up:false,down:false,left:false,right:false};
function computeNextDirFromKeys(){
  const dx = (keyState.right ? 1 : 0) - (keyState.left ? 1 : 0);
  const dy = (keyState.down ? 1 : 0) - (keyState.up ? 1 : 0);
  if (dx === 0 && dy === 0) return; // no change
  const desired = Math.atan2(dy, dx);
  // prevent reversing into self: dot product check against current movement
  if (snake.length > 1){ const curX = Math.cos(playerAngle), curY = Math.sin(playerAngle); if ((dx*curX + dy*curY) < -0.5) return; }
  playerDesiredAngle = desired;
}

window.addEventListener('keydown', e => {
  let handled = false;
  switch(e.key){
    case 'ArrowUp': case 'w': keyState.up = true; handled = true; break;
    case 'ArrowDown': case 's': keyState.down = true; handled = true; break;
    case 'ArrowLeft': case 'a': keyState.left = true; handled = true; break;
    case 'ArrowRight': case 'd': keyState.right = true; handled = true; break;
  }
  if (handled){ computeNextDirFromKeys(); e.preventDefault(); }
});

window.addEventListener('keyup', e => {
  let handled = false;
  switch(e.key){
    case 'ArrowUp': case 'w': keyState.up = false; handled = true; break;
    case 'ArrowDown': case 's': keyState.down = false; handled = true; break;
    case 'ArrowLeft': case 'a': keyState.left = false; handled = true; break;
    case 'ArrowRight': case 'd': keyState.right = false; handled = true; break;
  }
  if (handled){ computeNextDirFromKeys(); e.preventDefault(); }
});

restartBtn.addEventListener('click', ()=> reset());

// focus canvas to receive keyboard events on some browsers
canvas.addEventListener('click', ()=> canvas.focus());

// settings: foodCount control
const foodInput = document.getElementById('foodCount');
if (foodInput){
  // use change event to re-place foods safely (avoids potential infinite loops)
  foodInput.addEventListener('change', ()=>{
    const n = getFoodCount();
    placeFoods(n);
  });
  // default start value
  foodInput.value = 10;
}

// initialize and start RAF loop
reset();
if (rafId) cancelAnimationFrame(rafId);
rafId = requestAnimationFrame(rafLoop);
