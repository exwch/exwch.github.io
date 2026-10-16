/* ============================================================
   无头物理仿真测试（Node 运行，不需要浏览器）
   用法：node tools/simtest.js
   验证跑速/冲刺、长短跳高度、飞行上限 5 秒、技能冷却、踩敌人、
   受伤无敌帧、金币、熔岩、掉坑、倒地复活等核心机制。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const gameDir = path.resolve(__dirname, '..', 'js');
const read = (f) => fs.readFileSync(path.join(gameDir, f), 'utf8');

const sandbox = { console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(sandbox);
vm.runInContext(read('config.js'), sandbox, { filename: 'config.js' });
vm.runInContext(read('level.js'), sandbox, { filename: 'level.js' });

// ---- 假输入 ----
const keys = { 0: {}, 1: {} };
const edges = { 0: {}, 1: {} };
function setInput(p, action, on) {
  const was = !!keys[p][action];
  keys[p][action] = on;
  if (on && !was) edges[p][action] = true;
}
const Input = {
  hold: (p, a) => !!keys[p][a],
  hit: (p, a) => !!edges[p][a],
  clearEdges: () => { edges[0] = {}; edges[1] = {}; },
};
sandbox.Input = Input;

vm.runInContext(read('entities.js'), sandbox, { filename: 'entities.js' });
// 顶层 const/class 属于全局词法环境，需要用同一 context 求值取出
const api = vm.runInContext(
  '({ CONFIG, LEVELS, buildLevel, Player, Walker, Flyer, Fireball, tileAt, isSolidTile, resolvePlayerEnemyCollisions, resolveProjectileHits })',
  sandbox,
);
const { CONFIG, LEVELS, buildLevel, Player, Walker, Flyer, Fireball,
  resolvePlayerEnemyCollisions, resolveProjectileHits } = api;

// ---- 假 game ----
function makeGame(levelIndex = 0) {
  const level = buildLevel(LEVELS[levelIndex]);
  const g = {
    level,
    levelTime: 0,
    coins: 0,
    score: 0,
    projectiles: [],
    particles: [],
    floaters: [],
    enemies: [],
    audio: { play() {}, tone() {}, noise() {} },
    spawnDust() {}, spawnSparkle() {}, spawnThrust() {}, spawnDebris() {}, spawnCoinPop() {},
    floater() {}, addScore(p) { this.score += p; }, shake() {},
  };
  const lvl = g.level;
  for (let y = 0; y < lvl.height; y++) {
    for (let x = 0; x < lvl.width; x++) {
      const ch = lvl.grid[y][x];
      if (ch === 'E') { g.enemies.push(new Walker(x, y)); lvl.grid[y][x] = '.'; }
      else if (ch === 'V') { g.enemies.push(new Flyer(x, y)); lvl.grid[y][x] = '.'; }
    }
  }
  g.players = LEVELS[levelIndex].spawns.map((s, i) => new Player(i, s, g));
  return g;
}

const DT = 1 / 60;
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

function step(g, frames) {
  for (let f = 0; f < frames; f++) {
    g.players.forEach((p) => p.update(DT, g));
    g.enemies.forEach((e) => e.update(DT, g));
    g.projectiles.forEach((fb) => fb.update(DT, g));
    resolvePlayerEnemyCollisions(g);
    resolveProjectileHits(g);
    g.projectiles = g.projectiles.filter((fb) => !fb.dead);
    g.levelTime += DT;
    Input.clearEdges();
  }
}

function reset() {
  keys[0] = {}; keys[1] = {};
  Input.clearEdges();
}

/* ---------- 1. 站立 ---------- */
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  step(g, 60);
  check('落地站立不抖动', p.onGround && Math.abs(p.y - 450) < 1.5, `y=${p.y.toFixed(1)} onGround=${p.onGround}`);
  check('满能量起飞', p.flyFuel === CONFIG.FLY_MAX, `fuel=${p.flyFuel}`);
}

/* ---------- 2. 跑步 / 冲刺速度 ---------- */
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  g.enemies = [];                       // 清空敌人，专测移动
  p.x = 34 * 32; p.y = 450; p.vy = 0;   // 挪到一段长直地面
  setInput(0, 'right', true);
  step(g, 120);
  const runVx = p.vx;
  check('普通跑速达标', Math.abs(runVx - CONFIG.RUN_MAX) < 6, `vx=${runVx.toFixed(1)} / 上限 ${CONFIG.RUN_MAX}`);
  setInput(0, 'sprint', true);
  step(g, 120);
  const sprintVx = p.vx;
  check('冲刺提速明显', Math.abs(sprintVx - CONFIG.SPRINT_MAX) < 8, `vx=${sprintVx.toFixed(1)} / 上限 ${CONFIG.SPRINT_MAX}`);
  setInput(0, 'right', false);
  setInput(0, 'sprint', false);
  step(g, 60);
  check('松手会减速停下', Math.abs(p.vx) < 30, `vx=${p.vx.toFixed(1)}`);
}

/* ---------- 3. 小跳 / 大跳 ---------- */
function jumpHeight(holdFrames) {
  reset();
  const g = makeGame();
  const p = g.players[0];
  g.enemies = [];
  step(g, 30);
  const y0 = p.y;
  let minY = y0;
  setInput(0, 'jump', true);
  for (let f = 0; f < 90; f++) {
    if (f === holdFrames) setInput(0, 'jump', false);
    p.update(DT, g);
    Input.clearEdges();
    minY = Math.min(minY, p.y);
  }
  return y0 - minY;
}
{
  const tap = jumpHeight(2);
  const hold = jumpHeight(40);
  check('小跳（轻点）高度合理', tap > 35 && tap < 110, `${tap.toFixed(0)}px ≈ ${(tap / 32).toFixed(1)} 格`);
  check('大跳（长按）明显更高', hold > tap * 1.8, `${hold.toFixed(0)}px ≈ ${(hold / 32).toFixed(1)} 格 vs 小跳 ${tap.toFixed(0)}px`);
}

/* ---------- 4. 飞行时长上限 ---------- */
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  g.enemies = [];
  step(g, 30);
  setInput(0, 'jump', true);
  step(g, 6);
  setInput(0, 'jump', false);
  step(g, 6);
  const y0 = p.y;
  let flyFrames = 0;
  let maxRise = 0;
  let dropCheck = null;
  setInput(0, 'fly', true);
  for (let f = 0; f < 60 * 8; f++) {
    p.update(DT, g);
    Input.clearEdges();
    if (p.flying) flyFrames++;
    maxRise = Math.max(maxRise, y0 - p.y);
    if (!dropCheck && f > 60 && !p.flying && p.flyFuel <= 0) dropCheck = { frame: f, vy0: p.vy };
    if (dropCheck && f === dropCheck.frame + 20) dropCheck.vyLater = p.vy;
    if (f === 60 * 6) setInput(0, 'fly', false);
  }
  const flySeconds = flyFrames / 60;
  check('单次飞行 ≈5 秒上限', Math.abs(flySeconds - CONFIG.FLY_MAX) < 0.25, `实测 ${flySeconds.toFixed(2)}s（上限 ${CONFIG.FLY_MAX}s）`);
  check('飞行能明显上升', maxRise > 300, `上升 ${maxRise.toFixed(0)}px ≈ ${(maxRise / 32).toFixed(1)} 格`);
  check('能量耗尽后转为下坠', !!dropCheck && dropCheck.vyLater > 0,
    dropCheck ? `耗尽后 vy ${dropCheck.vy0.toFixed(0)} → ${dropCheck.vyLater.toFixed(0)}` : '未观察到耗尽');
}

/* ---------- 5. 落地回充飞行能量 ---------- */
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  g.enemies = [];
  p.flyFuel = 0;
  step(g, 60 * 5);
  check('落地缓慢回充能量', p.flyFuel > CONFIG.FLY_MAX * 0.9, `fuel=${p.flyFuel.toFixed(2)}`);
}

/* ---------- 6. 技能：火焰弹 / 旋风冲刺 ---------- */
{
  reset();
  const g = makeGame();
  g.enemies = [];
  const p1 = g.players[0];
  const p2 = g.players[1];
  step(g, 30);
  setInput(0, 'skill', true);
  step(g, 1);
  setInput(0, 'skill', false);
  check('P1 火焰弹生成', g.projectiles.length === 1, `shots=${g.projectiles.length}`);
  const cd = p1.skillCd;
  setInput(0, 'skill', true); step(g, 1); setInput(0, 'skill', false);
  check('火焰弹冷却生效', g.projectiles.length === 1 && cd > 0, `cd=${cd.toFixed(2)}s`);
  step(g, Math.ceil(CONFIG.FIRE_CD * 60) + 2);
  setInput(0, 'skill', true); step(g, 1); setInput(0, 'skill', false);
  check('冷却结束后可再发射', g.projectiles.length === 2, `shots=${g.projectiles.length}`);

  const x0 = p2.x;
  setInput(1, 'skill', true); step(g, 1); setInput(1, 'skill', false);
  const dashing = p2.dashTimer > 0;
  const dashVx = p2.vx;
  step(g, 24);
  check('P2 旋风冲刺位移', dashing && Math.abs(p2.x - x0) > 80, `位移 ${(p2.x - x0).toFixed(0)}px vx=${dashVx.toFixed(0)}`);
  check('冲刺期间无敌', p2.invuln > 0, `invuln=${p2.invuln.toFixed(2)}`);
}

/* ---------- 7. 踩敌人 / 受伤 ---------- */
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  step(g, 30);
  const e = g.enemies.find((x) => x.kind === 'walker' && x.alive);
  const score0 = g.score;
  p.x = e.x; p.y = e.y - 34; p.vy = 250; p.vx = 0;
  step(g, 3);
  check('踩敌人可击杀并弹起', e.state !== 'active' && p.vy < 0 && g.score > score0,
    `state=${e.state} vy=${p.vy.toFixed(0)} score+${g.score - score0}`);
}
{
  reset();
  const g = makeGame();
  const p = g.players[0];
  step(g, 30);
  const e = g.enemies.find((x) => x.kind === 'walker' && x.alive);
  const hp0 = p.hp;
  p.x = e.x; p.y = e.y; p.vx = 0; p.vy = 0;
  step(g, 3);
  check('侧面接触会掉血', p.hp === hp0 - 1, `hp ${hp0} → ${p.hp}`);
  check('受伤后有无敌帧', p.invuln > 0, `invuln=${p.invuln.toFixed(2)}s`);
  const hp1 = p.hp;
  p.x = e.x; p.y = e.y;
  step(g, 3);
  check('无敌帧内不再掉血', p.hp === hp1, `hp=${p.hp}`);
}

/* ---------- 8. 金币 / 熔岩 / 旗杆 / 掉坑 ---------- */
{
  reset();
  const g = makeGame(0);
  const p = g.players[0];
  g.enemies = [];
  step(g, 30);
  const lvl = g.level;
  let coin = null;
  for (let y = 0; y < lvl.height && !coin; y++) {
    for (let x = 0; x < lvl.width; x++) if (lvl.grid[y][x] === 'C') { coin = { x, y }; break; }
  }
  p.x = coin.x * 32 + 5; p.y = coin.y * 32 + 2; p.vx = 0; p.vy = 0;
  const fuel0 = p.flyFuel = 1;
  step(g, 2);
  check('吃金币加分并补飞行能量', g.coins === 1 && p.flyFuel > fuel0, `coins=${g.coins} fuel=${p.flyFuel.toFixed(2)}`);

  let flag = null;
  for (let y = 0; y < lvl.height && !flag; y++) {
    for (let x = 0; x < lvl.width; x++) if (lvl.grid[y][x] === 'F') { flag = { x, y }; break; }
  }
  p.x = flag.x * 32 + 5; p.y = flag.y * 32; p.vx = 0; p.vy = 0;
  step(g, 2);
  check('碰到旗杆判定过关点', p.atGoal === true, `atGoal=${p.atGoal}`);
}
{
  reset();
  const g = makeGame(1);
  const p = g.players[0];
  g.enemies = [];
  step(g, 30);
  const lvl = g.level;
  let lava = null;
  for (let y = 0; y < lvl.height && !lava; y++) {
    for (let x = 0; x < lvl.width; x++) if (lvl.grid[y][x] === '~') { lava = { x, y }; break; }
  }
  const hp0 = p.hp;
  p.x = lava.x * 32 + 5; p.y = lava.y * 32; p.vx = 0; p.vy = 0;
  step(g, 3);
  check('掉进熔岩掉血并回安全点', p.hp === hp0 - 1 && p.x < 200, `hp=${p.hp} x=${p.x.toFixed(0)}`);
}
{
  reset();
  const g = makeGame(0);
  const p = g.players[0];
  g.enemies = [];
  step(g, 60);
  p.y = g.level.pixelHeight + 200;
  const hp0 = p.hp;
  step(g, 2);
  check('掉坑掉血并回到安全点', p.hp === hp0 - 1 && p.y < g.level.pixelHeight, `hp=${p.hp} y=${p.y.toFixed(0)}`);
}

/* ---------- 9. 倒地与复活 ---------- */
{
  reset();
  const g = makeGame(0);
  const p = g.players[0];
  g.enemies = [];
  step(g, 30);
  p.hp = 1;
  p.invuln = 0;
  p.hurt(1, 1, g);
  check('血量归零进入倒地', p.dead && p.hp === 0, `dead=${p.dead}`);
  let revived = false;
  for (let f = 0; f < 60 * 10; f++) {
    step(g, 1);
    if (!p.dead) { revived = true; break; }
  }
  check('倒地后自动复活', revived && p.hp > 0, `hp=${p.hp}`);
}

/* ---------- 10. 边跑边跳 ---------- */
{
  reset();
  const g = makeGame(0);
  const p = g.players[0];
  g.enemies = [];
  setInput(0, 'right', true);
  step(g, 60);
  setInput(0, 'jump', true);
  step(g, 20);
  const before = p.x;
  step(g, 60);
  check('奔跑中可边跑边跳', p.x - before > 150, `前进 ${(p.x - before).toFixed(0)}px`);
}

/* ---------- 输出 ---------- */
const pass = results.filter((r) => r.pass).length;
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  —  ${r.detail}`));
console.log(`\n${pass}/${results.length} 项通过`);
process.exit(pass === results.length ? 0 : 1);
