/* ============================================================
   渲染冒烟测试（Node 运行）
   用法：node tools/rendertest.js
   用模拟 2D 上下文把全部绘制函数、全部界面状态跑一遍，
   用来捕捉绘制代码里的运行时异常（改完渲染代码请跑一次）。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.resolve(__dirname, '..', 'js');
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const calls = { count: 0 };
function makeCtx() {
  const grad = { addColorStop() {} };
  const noop = () => { calls.count++; };
  return {
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '',
    globalAlpha: 1, lineWidth: 1, imageSmoothingEnabled: false,
    save: noop, restore: noop, translate: noop, scale: noop, rotate: noop, setTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, ellipse: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, rect: noop, clip: noop,
    fill: noop, stroke: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 42 }),
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    drawImage: noop, getImageData: () => ({ data: [] }),
  };
}

const sandbox = { console, Math, Date, document: { getElementById: () => null } };
vm.createContext(sandbox);
vm.runInContext(read('config.js'), sandbox, { filename: 'config.js' });
vm.runInContext(read('level.js'), sandbox, { filename: 'level.js' });
sandbox.Input = { hold: () => false, hit: () => false };
vm.runInContext(read('entities.js'), sandbox, { filename: 'entities.js' });
vm.runInContext(read('render.js'), sandbox, { filename: 'render.js' });

const api = vm.runInContext(
  '({ CONFIG, LEVELS, buildLevel, Player, Walker, Flyer, Fireball, Render, PALETTES })',
  sandbox,
);
const { CONFIG, LEVELS, buildLevel, Player, Walker, Flyer, Fireball, Render } = api;

const ctx = makeCtx();
const errors = [];

function makeGame(levelIndex, state) {
  const def = LEVELS[levelIndex];
  const level = buildLevel(def);
  const g = {
    state, level, levelIndex,
    time: 3.4, levelTime: 42.5, coins: 7, totalCoins: 12, totalTime: 88.2, score: 3400,
    banner: { text: '过关！', sub: '两人都碰到旗杆才能过关', t: 1 },
    camera: { x: 600, y: 0, scale: 0.85 },
    shakeX: 1, shakeY: -1,
    players: [], enemies: [], projectiles: [], particles: [], floaters: [],
    frameCount: 6,
  };
  g.players = def.spawns.map((s, i) => new Player(i, s, g));
  // 让两个玩家处于不同状态，覆盖各种绘制分支
  g.players[0].x = 620; g.players[0].vx = 120; g.players[0].onGround = true; g.players[0].walkPhase = 2;
  g.players[1].x = 700; g.players[1].y = 300; g.players[1].onGround = false;
  g.players[1].flying = true; g.players[1].dashTimer = 0.2; g.players[1].facing = -1;
  g.players[1].trail.push({ x: 690, y: 300, life: 0.2, max: 0.26, flying: true });
  g.players[0].atGoal = true;
  g.players[0].invuln = 0.5;
  g.enemies.push(new Walker(21, 14), new Flyer(24, 8));
  g.enemies[0].state = 'dying'; g.enemies[0].squashed = true;
  g.projectiles.push(new Fireball(650, 400, 1, 0));
  for (let i = 0; i < 8; i++) {
    g.particles.push({
      x: 640 + i * 3, y: 400, vx: 10, vy: -20, life: 0.4, max: 0.6, color: '#fff', size: 3,
      shape: i % 3 === 0 ? 'coin' : (i % 2 ? 'circle' : 'square'), gravity: 900,
    });
  }
  g.floaters.push({ x: 660, y: 380, text: '+200', color: '#ffd93b', life: 0.5, max: 0.95 });
  return g;
}

for (const st of ['title', 'playing', 'paused', 'levelclear', 'gameover', 'victory']) {
  for (let li = 0; li < LEVELS.length; li++) {
    const g = makeGame(li, st);
    try {
      Render.drawBackground(g, ctx);
      Render.drawTiles(g, ctx);
      g.enemies.forEach((e) => (e.kind === 'walker' ? Render.drawWalker(ctx, e) : Render.drawFlyer(ctx, e)));
      g.projectiles.forEach((fb) => Render.drawFireball(ctx, fb, g));
      g.players.forEach((p) => Render.drawPlayer(ctx, p, g));
      Render.drawParticles(ctx, g);
      Render.drawFloaters(ctx, g);
      Render.drawHUD(g, ctx);
      Render.drawOverlay(g, ctx);
    } catch (e) {
      errors.push(`${st} / 关卡${li + 1}: ${e && e.message}`);
    }
  }
  console.log(`PASS  ${st} 状态全部绘制函数执行完毕`);
}

// 边界外观：倒地、复活闪光、能量耗尽
{
  const g = makeGame(0, 'playing');
  g.players[0].dead = true; g.players[0].koTimer = 4.2; g.players[0].atGoal = false;
  g.players[1].respawnFlash = 0.9; g.players[1].flyFuel = 0; g.players[1].flying = false;
  try {
    Render.drawHUD(g, ctx);
    g.players.forEach((p) => Render.drawPlayer(ctx, p, g));
    console.log('PASS  倒地 / 复活闪光 / 能量耗尽外观');
  } catch (e) { errors.push('边界外观: ' + (e && e.message)); }
}

console.log(`\n绘制调用 ${calls.count} 次`);
if (errors.length) {
  errors.forEach((e) => console.log('FAIL  ' + e));
  process.exit(1);
}
console.log('全部渲染路径无异常 ✓');
