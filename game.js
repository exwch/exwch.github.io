/* ============================================================
   主游戏：循环、镜头、流程状态机、实体碰撞
   ============================================================ */
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = AudioFX;

    this.state = 'title';        // title | playing | clearing | levelclear | paused | gameover | victory
    this.pausedFrom = 'playing';
    this.levelIndex = 0;
    this.score = 0;
    this.coins = 0;
    this.totalCoins = 0;
    this.totalTime = 0;
    this.time = 0;               // 全局动画时间
    this.levelTime = 0;
    this.clearTimer = 0;
    this.koDelay = 0;

    this.players = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];

    this.camera = { x: 0, y: 0, scale: 1 };
    this.shakeAmount = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this.banner = { text: '', sub: '', t: 0 };
    this.last = performance.now();
    this.frameCount = 0;
    this.debugEl = document.getElementById('debug');
    this.debugOn = /[?&]debug=1/.test(window.location.search);
    if (this.debugEl && this.debugOn) this.debugEl.hidden = false;

    this.setupCanvas();
    this.bindUI();

    // 标题界面用第一关当背景
    this.loadLevel(0, true);
    this.state = 'title';

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ---------------- 初始化 ---------------- */
  setupCanvas() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(CONFIG.VIEW_W * this.dpr);
    this.canvas.height = Math.round(CONFIG.VIEW_H * this.dpr);
    this.ctx.imageSmoothingEnabled = false;
  }

  bindUI() {
    const btnMute = document.getElementById('btnMute');
    const btnFull = document.getElementById('btnFull');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        this.audio.init();
        const muted = this.audio.toggleMute();
        btnMute.textContent = muted ? '🔇 已静音' : '🔊 音效';
      });
    }
    if (btnFull) {
      btnFull.addEventListener('click', () => {
        const el = document.getElementById('frame');
        if (!document.fullscreenElement) {
          if (el.requestFullscreen) el.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      });
    }
    const wake = () => this.audio.init();
    window.addEventListener('pointerdown', wake, { once: false });
    window.addEventListener('keydown', () => this.audio.init(), { once: true });
  }

  /* ---------------- 关卡装载 ---------------- */
  loadLevel(index, silent) {
    this.levelIndex = index;
    const def = LEVELS[index];
    this.level = buildLevel(def);
    this.players = def.spawns.map((spawn, i) => new Player(i, spawn, this));
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.levelTime = 0;
    this.coins = 0;
    this.clearTimer = 0;
    this.celebrateTimer = 0;
    this.koDelay = 0;

    // 从图块生成敌人
    const lvl = this.level;
    for (let y = 0; y < lvl.height; y++) {
      for (let x = 0; x < lvl.width; x++) {
        const ch = lvl.grid[y][x];
        if (ch === 'E') { this.enemies.push(new Walker(x, y)); lvl.grid[y][x] = '.'; }
        else if (ch === 'V') { this.enemies.push(new Flyer(x, y)); lvl.grid[y][x] = '.'; }
      }
    }

    // 镜头对齐出生点
    const p = this.players[0];
    this.camera.scale = 1;
    this.camera.x = clamp(p.centerX - CONFIG.VIEW_W / 2, 0, Math.max(0, lvl.pixelWidth - CONFIG.VIEW_W));
    this.camera.y = 0;

    if (!silent) {
      this.banner = { text: '开始！', sub: '两人都碰到旗杆才能过关', t: 2.2 };
      this.audio.play('start');
    } else {
      this.banner = { text: '', sub: '', t: 0 };
    }
  }

  startGame() {
    this.score = 0;
    this.coins = 0;
    this.totalCoins = 0;
    this.totalTime = 0;
    this.audio.init();
    this.loadLevel(0, false);
    this.state = 'playing';
  }

  nextLevel() {
    this.totalCoins += this.coins;
    this.totalTime += this.levelTime;
    if (this.levelIndex + 1 >= LEVELS.length) {
      this.state = 'victory';
      return;
    }
    this.loadLevel(this.levelIndex + 1, false);
    this.state = 'playing';
  }

  restartLevel() {
    const keeps = this.levelIndex;
    this.loadLevel(keeps, false);
    this.state = 'playing';
  }

  /* ---------------- 特效工具 ---------------- */
  particle(x, y, vx, vy, life, color, size, shape = 'square', gravity = 900) {
    if (this.particles.length > 900) return;
    this.particles.push({ x, y, vx, vy, life, max: life, color, size, shape, gravity });
  }

  spawnDust(x, y, count = 6, color = 'rgba(255,255,255,.6)') {
    for (let i = 0; i < count; i++) {
      this.particle(
        x + rand(-6, 6), y - 1, rand(-90, 90), rand(-140, -30),
        rand(0.25, 0.55), color, rand(2, 5), 'square', 420,
      );
    }
  }

  spawnSparkle(x, y, color = '#fff', count = 10) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 260);
      this.particle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), color, rand(2, 5), 'circle', 260);
    }
  }

  spawnThrust(player) {
    for (let i = 0; i < 2; i++) {
      this.particle(
        player.centerX + rand(-8, 8), player.y + player.h - 2,
        rand(-60, 60), rand(70, 190),
        rand(0.22, 0.45), i % 2 ? '#bde9ff' : '#ffffff', rand(2, 5), 'circle', 120,
      );
    }
  }

  spawnDebris(x, y) {
    for (let i = 0; i < 10; i++) {
      this.particle(
        x + rand(-12, 12), y + rand(-12, 12),
        rand(-220, 220), rand(-320, -60),
        rand(0.4, 0.8), i % 2 ? '#c8622f' : '#8f4320', rand(3, 7), 'square', 1300,
      );
    }
  }

  spawnCoinPop(x, y, player) {
    this.particle(x, y - 4, rand(-30, 30), -330, 0.65, '#ffd93b', 8, 'coin', 700);
  }

  floater(x, y, text, color = '#fff') {
    this.floaters.push({ x, y, text, color, life: 0.95, max: 0.95 });
  }

  addScore(points, x, y, player) {
    this.score += points;
    if (x !== undefined) this.floater(x, y - 8, `+${points}`, player ? player.palette.ui : '#fff');
  }

  shake(amount) {
    this.shakeAmount = Math.min(26, this.shakeAmount + amount);
  }

  /* ---------------- 主循环 ---------------- */
  loop(ts) {
    requestAnimationFrame(this.loop);
    let dt = (ts - this.last) / 1000;
    if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
    this.last = ts;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    this.frameCount++;
    this.update(dt);
    this.render();
    Input.endFrame();
  }

  update(dt) {
    this.handleGlobalKeys();

    // 镜头震动
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 60);
    this.shakeX = rand(-1, 1) * this.shakeAmount * 0.5;
    this.shakeY = rand(-1, 1) * this.shakeAmount * 0.5;
    this.updateDebug();

    const active = this.state === 'playing' || this.state === 'clearing';
    if (active) {
      if (this.state === 'playing') this.levelTime += dt;

      const frozen = this.state === 'clearing';
      this.players.forEach((p) => {
        if (frozen) this.celebratePlayer(p, dt);
        else p.update(dt, this);
      });
      this.enemies.forEach((e) => e.update(dt, this));
      this.projectiles.forEach((fb) => fb.update(dt, this));
      this.handleCollisions();
      this.updateCamera(dt);
      this.checkEndConditions(dt);
    }

    // 清理
    this.enemies = this.enemies.filter((e) => e.state !== 'gone');
    this.projectiles = this.projectiles.filter((fb) => !fb.dead);

    // 粒子 / 飘字（任何状态都推进）
    this.particles.forEach((pt) => {
      pt.life -= dt;
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - Math.min(1, dt * 1.6);
    });
    this.particles = this.particles.filter((pt) => pt.life > 0);

    this.floaters.forEach((ft) => {
      ft.life -= dt;
      ft.y -= 34 * dt;
    });
    this.floaters = this.floaters.filter((ft) => ft.life > 0);

    if (this.banner.t > 0) this.banner.t -= dt;

    if (this.state === 'levelclear' && this.clearTimer > 0) {
      this.clearTimer -= dt;
      if (this.frameCount % 3 === 0) {
        this.spawnSparkle(rand(0, this.level.pixelWidth), rand(40, 260),
          ['#ffd93b', '#ff5a5f', '#46d17f', '#5ad1ff'][randInt(0, 3)], 3);
      }
    }
  }

  /* ---------------- 全局按键 ---------------- */
  handleGlobalKeys() {
    if (Input.press('debug')) this.toggleDebug();
    if (Input.press('mute')) {
      const muted = this.audio.toggleMute();
      const btn = document.getElementById('btnMute');
      if (btn) btn.textContent = muted ? '🔇 已静音' : '🔊 音效';
    }
    switch (this.state) {
      case 'title':
        if (Input.press('confirm')) { this.audio.init(); this.startGame(); }
        break;
      case 'playing':
      case 'clearing':
        if (Input.press('pause')) { this.pausedFrom = this.state; this.state = 'paused'; }
        else if (Input.press('restart')) this.restartLevel();
        break;
      case 'paused':
        if (Input.press('pause') || Input.press('confirm')) this.state = this.pausedFrom || 'playing';
        else if (Input.press('restart')) this.restartLevel();
        break;
      case 'levelclear':
        if (Input.press('confirm')) this.nextLevel();
        break;
      case 'gameover':
      case 'victory':
        if (Input.press('restart') || Input.press('confirm')) this.startGame();
        break;
      default: break;
    }
  }

  /* ---------------- 过关时的庆祝动作 ---------------- */
  /* ---------------- 调试信息（F3 或 ?debug=1 打开） ---------------- */
  toggleDebug() {
    this.debugOn = !this.debugOn;
    if (this.debugEl) this.debugEl.hidden = !this.debugOn;
  }

  updateDebug() {
    if (!this.debugOn || !this.debugEl) return;
    if (this.frameCount % 6 !== 0) return;
    const f = (n) => (n >= 0 ? ' ' : '') + n.toFixed(1);
    const line = (p) => (p
      ? `${p.name}: x=${f(p.x)} y=${f(p.y)} vx=${f(p.vx)} vy=${f(p.vy)} ` +
        `落地=${p.onGround ? 'Y' : 'N'} 飞行=${p.flying ? 'Y' : 'N'} 能量=${p.flyFuel.toFixed(2)}s ` +
        `技能CD=${p.skillCd.toFixed(2)} 血=${p.hp}${p.dead ? ' 倒地' : ''}${p.atGoal ? ' 到旗杆' : ''}`
      : '');
    this.debugEl.textContent =
      `状态=${this.state} 关卡=${this.level.name} 用时=${this.levelTime.toFixed(1)}s 金币=${this.coins} 分数=${this.score}\n` +
      `${line(this.players[0])}\n${line(this.players[1])}\n` +
      `敌人=${this.enemies.length} 火球=${this.projectiles.length} 粒子=${this.particles.length} 镜头=${this.camera.scale.toFixed(2)}`;
  }

  /* ---------------- 过关时的庆祝动作 ---------------- */
  celebratePlayer(p, dt) {
    if (p.dead) { p.updateKnockedOut(dt, this); return; }
    p.animTime += dt;
    p.trail.forEach((t) => { t.life -= dt; });
    p.trail = p.trail.filter((t) => t.life > 0);
    const lvl = this.level;
    const t = CONFIG.TILE;
    p.vy = Math.min(p.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - Math.min(1, dt * 6);
    p.onGround = false;
    if (p.vy > 0) {
      const ty = Math.floor((p.y + p.h) / t);
      const x0 = Math.floor(p.x / t);
      const x1 = Math.floor((p.x + p.w - 1) / t);
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        if (SOLID_CHARS.has(ch)) {
          p.y = ty * t - p.h;
          p.vy = -320;
          p.jumping = true;
          this.spawnDust(p.centerX, p.y + p.h, 4, p.palette.accent);
          break;
        }
      }
    }
    p.flyFuel = CONFIG.FLY_MAX;
  }

  /* ---------------- 碰撞 ---------------- */
  handleCollisions() {
    resolvePlayerEnemyCollisions(this);
    resolveProjectileHits(this);

    // 玩家互推，避免两人重叠在一起
    const players = this.players;
    for (let pi = 0; pi < players.length; pi++) {
      const p = players[pi];
      const other = players[1 - pi];
      if (p.dead || !other || other.dead) continue;
      if (!aabb(p, other)) continue;
      const dir = p.centerX < other.centerX ? -1 : 1;
      p.x += dir * 1.1;
      other.x -= dir * 1.1;
    }
  }

  /* ---------------- 镜头 ---------------- */
  updateCamera(dt) {
    const lvl = this.level;
    const alive = this.players.filter((p) => !p.dead);
    const list = alive.length ? alive : this.players;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    list.forEach((p) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + p.w);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y + p.h);
    });
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const marginX = 220;
    const marginY = 190;
    const scaleX = (CONFIG.VIEW_W - marginX * 2) / Math.max(1, spanX);
    const scaleY = (CONFIG.VIEW_H - marginY * 2) / Math.max(1, spanY);
    const targetScale = clamp(Math.min(1, scaleX, scaleY), 0.58, 1);

    const smoothScale = 1 - Math.exp(-3.2 * dt);
    this.camera.scale = lerp(this.camera.scale, targetScale, smoothScale);

    const viewW = CONFIG.VIEW_W / this.camera.scale;
    const viewH = CONFIG.VIEW_H / this.camera.scale;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const targetX = clamp(midX - viewW / 2, 0, Math.max(0, lvl.pixelWidth - viewW));
    let targetY = Math.min(lvl.pixelHeight - viewH, midY - viewH * 0.52);
    targetY = clamp(targetY, -900, Math.max(-900, lvl.pixelHeight - viewH));

    const smooth = 1 - Math.exp(-9 * dt);
    this.camera.x = lerp(this.camera.x, targetX, smooth);
    this.camera.y = lerp(this.camera.y, targetY, smooth);
  }

  /* ---------------- 结束判定 ---------------- */
  checkEndConditions(dt) {
    if (this.state === 'clearing') {
      this.celebrateTimer -= dt;
      if (this.celebrateTimer <= 0) {
        const bonus = Math.max(0, Math.round((CONFIG.PAR_TIME - this.levelTime) * CONFIG.TIME_BONUS));
        this.score += bonus;
        this.state = 'levelclear';
        this.clearTimer = 3;
        this.audio.play('goal');
      }
      return;
    }

    // 过关：两人都碰到旗杆
    const allGoal = this.players.every((p) => p.atGoal);
    if (allGoal && this.state === 'playing') {
      this.state = 'clearing';
      this.celebrateTimer = 2.4;
      this.banner = { text: '过关！', sub: '', t: 2.4 };
      this.audio.play('goal');
      return;
    }

    // 提示等待队友
    const someoneAtGoal = this.players.some((p) => p.atGoal);
    if (someoneAtGoal && this.frameCount % 90 === 0) {
      const waiting = this.players.find((p) => !p.atGoal);
      if (waiting) this.floater(waiting.centerX, waiting.y - 16, '快跟上，我在旗杆等你！', '#ffd93b');
    }

    // 两人同时倒地 → 结束
    if (this.players.every((p) => p.dead)) {
      this.koDelay += dt;
      if (this.koDelay > 1.2) {
        this.state = 'gameover';
        this.totalCoins += this.coins;
        this.totalTime += this.levelTime;
        this.audio.play('gameover');
      }
    } else {
      this.koDelay = 0;
    }
  }

  /* ---------------- 渲染 ---------------- */
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
    ctx.imageSmoothingEnabled = false;

    Render.drawBackground(this, ctx);

    const cam = this.camera;
    ctx.save();
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x + this.shakeX, -cam.y + this.shakeY);
    const lvl = this.level;
    // 关卡边界外的暗色
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    if (cam.x < 0) ctx.fillRect(-40, -900, 40, lvl.pixelHeight + 900);
    Render.drawTiles(this, ctx);
    this.enemies.forEach((e) => {
      if (e.kind === 'walker') Render.drawWalker(ctx, e);
      else Render.drawFlyer(ctx, e);
    });
    this.projectiles.forEach((fb) => Render.drawFireball(ctx, fb, this));
    if (this.state !== 'title') this.players.forEach((p) => Render.drawPlayer(ctx, p, this));
    Render.drawParticles(ctx, this);
    Render.drawFloaters(ctx, this);
    ctx.restore();

    if (this.state !== 'title') Render.drawHUD(this, ctx);
    Render.drawOverlay(this, ctx);
  }
}

/* 启动 */
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  window.game = new Game(canvas);
});
