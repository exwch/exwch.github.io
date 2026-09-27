/* ============================================================
   实体：玩家、敌人、火球
   玩家数值全部来自 CONFIG，方便调手感
   ============================================================ */

const T = () => CONFIG.TILE;

/* ------------------------------------------------------------------
   玩家
   ------------------------------------------------------------------ */
class Player {
  constructor(index, spawn, game) {
    this.game = game;
    this.index = index;
    this.palette = PALETTES[index];
    this.w = CONFIG.PLAYER_W;
    this.h = CONFIG.PLAYER_H;
    this.x = spawn.x * CONFIG.TILE + (CONFIG.TILE - this.w) / 2;
    this.y = spawn.y * CONFIG.TILE + CONFIG.TILE - this.h;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;
    this.jumpHold = 0;
    this.jumpCut = false;
    this.flying = false;
    this.flyFuel = CONFIG.FLY_MAX;
    this.flyParticleTimer = 0;
    this.dashTimer = 0;
    this.dashDir = 1;
    this.skillCd = 0;
    this.hp = CONFIG.PLAYER_MAX_HP;
    this.invuln = 0;
    this.dead = false;
    this.koTimer = 0;
    this.atGoal = false;
    this.goalTime = 0;
    this.animTime = 0;
    this.walkPhase = 0;
    this.squash = 1;
    this.stretch = 1;
    this.safeX = this.x;
    this.safeY = this.y;
    this.safeTimer = 0;
    this.respawnFlash = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.isFlyingNow = false;
    this.justLanded = false;
    this.stompedThisFrame = false;

    // 预生成残影数组（冲刺 / 飞行拖尾）
    this.trail = [];
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
  get name() { return this.palette.name; }

  /* ---------------- 输入快照 ---------------- */
  readInput() {
    const i = this.index;
    return {
      left: Input.hold(i, 'left'),
      right: Input.hold(i, 'right'),
      jump: Input.hold(i, 'jump'),
      jumpPressed: Input.hit(i, 'jump'),
      fly: Input.hold(i, 'fly'),
      sprint: Input.hold(i, 'sprint'),
      skillPressed: Input.hit(i, 'skill'),
    };
  }

  /* ---------------- 每帧更新（含高速子步进，避免穿透） ---------------- */
  update(dt, game) {
    const act = this.readInput();
    this.animTime += dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    this.respawnFlash = Math.max(0, this.respawnFlash - dt);
    this.justLanded = false;

    if (this.dead) {
      this.updateKnockedOut(dt, game);
      return;
    }

    // 子步进：单步垂直位移不超过 ~12px
    const speed = Math.abs(this.vy);
    const steps = clamp(Math.ceil((dt * speed) / 12), 1, 6);
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, act, game, i === 0);

    // 残影
    this.trail.forEach((t) => { t.life -= dt; });
    this.trail = this.trail.filter((t) => t.life > 0);
    if ((this.dashTimer > 0 || this.flying) && this.animTime % 0.06 < dt) {
      this.trail.push({ x: this.x, y: this.y, life: 0.26, max: 0.26, flying: this.flying });
    }

    this.squash = lerp(this.squash, 1, Math.min(1, dt * 12));
    this.stretch = lerp(this.stretch, 1, Math.min(1, dt * 12));
  }

  /* ---------------- 单个物理子步 ---------------- */
  step(dt, act, game, first) {
    const lvl = game.level;
    const wasGround = this.onGround;

    /* ------------------ 技能 ------------------ */
    if (first && act.skillPressed) this.useSkill(game);
    if (this.skillCd > 0) this.skillCd -= dt;
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.invuln = Math.max(this.invuln, 0.06);
    }

    /* ------------------ 水平移动 ------------------ */
    if (this.dashTimer > 0) {
      this.vx = this.dashDir * CONFIG.DASH_SPEED;
    } else {
      const dir = (act.right ? 1 : 0) - (act.left ? 1 : 0);
      let maxSpeed = act.sprint ? CONFIG.SPRINT_MAX : CONFIG.RUN_MAX;
      // 空中保留冲刺惯性
      if (!wasGround && Math.abs(this.vx) > maxSpeed) maxSpeed = Math.abs(this.vx);

      let acc = this.onGround ? (act.sprint ? CONFIG.SPRINT_ACC : CONFIG.RUN_ACC) : CONFIG.AIR_ACC;
      if (this.flying) acc *= CONFIG.FLY_ACC_MULT;

      if (dir !== 0) {
        this.facing = dir;
        if (sign(this.vx) !== 0 && sign(this.vx) !== dir) {
          this.vx = approach(this.vx, dir * maxSpeed, CONFIG.TURN_DECEL * dt);
        } else if (Math.abs(this.vx) > maxSpeed) {
          this.vx = approach(this.vx, dir * maxSpeed, CONFIG.TURN_DECEL * dt);
        } else {
          this.vx = clamp(this.vx + dir * acc * dt, -maxSpeed, maxSpeed);
        }
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? CONFIG.GROUND_FRICTION : CONFIG.AIR_FRICTION) * dt);
        if (this.onGround && Math.abs(this.vx) > 0) {
          // 冲刺结束的滑步尘土
          if (Math.abs(this.vx) > CONFIG.RUN_MAX * 0.9 && Math.random() < 0.25) {
            game.spawnDust(this.centerX, this.y + this.h, 1, 'rgba(255,255,255,.6)');
          }
        }
      }
      this.vx = clamp(this.vx, -CONFIG.SPRINT_MAX, CONFIG.SPRINT_MAX);
    }

    /* ------------------ 跳跃缓冲与土狼时间 ------------------ */
    if (first) {
      if (act.jumpPressed) this.jumpBuffer = CONFIG.JUMP_BUFFER;
    }
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;
    if (this.onGround || this.flying) this.coyote = CONFIG.COYOTE;
    else this.coyote -= dt;

    // 起跳
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -CONFIG.JUMP_V;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.jumping = true;
      this.jumpHold = 0;
      this.jumpCut = false;
      this.squash = 0.82;
      this.stretch = 1.16;
      game.audio.play('jump');
      game.spawnDust(this.centerX, this.y + this.h, 7, this.palette.accent);
    }

    // 长按 = 大跳，轻点 = 小跳
    if (this.jumping && this.vy < 0) {
      if (act.jump && this.jumpHold < CONFIG.JUMP_HOLD_MAX) {
        this.jumpHold += dt;
      } else if (!act.jump && !this.jumpCut) {
        this.jumpCut = true;
        this.vy = Math.max(this.vy, -CONFIG.JUMP_CUT_V);
      }
    }
    if (this.vy >= 0) this.jumping = false;

    /* ------------------ 飞行 ------------------ */
    const canFly = act.fly && !this.onGround && this.flyFuel > 0;
    if (canFly) {
      if (!this.flying) {
        this.flying = true;
        this.jumping = false;
        game.audio.play('fly');
        game.spawnDust(this.centerX, this.y + this.h, 10, '#ffffff');
      }
      this.flyFuel = Math.max(0, this.flyFuel - dt);
      this.vy -= CONFIG.FLY_THRUST * dt;
      this.vy = Math.max(this.vy, -CONFIG.FLY_UP_MAX);
      this.flyParticleTimer -= dt;
      if (this.flyParticleTimer <= 0) {
        this.flyParticleTimer = 0.045;
        game.spawnThrust(this);
      }
      if (this.flyFuel <= 0) this.flying = false;
    } else {
      this.flying = false;
    }

    /* ------------------ 重力 ------------------ */
    let gravity = CONFIG.GRAVITY;
    if (this.flying) gravity = CONFIG.FLY_GRAVITY;
    else if (this.jumping && this.vy < 0 && act.jump && this.jumpHold < CONFIG.JUMP_HOLD_MAX) {
      gravity = CONFIG.GRAVITY_HOLD;
    }
    // 注意：向上速度上限必须放宽到弹簧力度，否则起跳初速度会被削掉
    this.vy = clamp(this.vy + gravity * dt, -CONFIG.SPRING_V - 60, CONFIG.MAX_FALL);

    /* ------------------ 位移 + 碰撞 ------------------ */
    const prevBottom = this.y + this.h;
    this.x += this.vx * dt;
    this.collideX(lvl, game);
    this.y += this.vy * dt;
    this.collideY(lvl, game, prevBottom);

    if (!wasGround && this.onGround) {
      this.justLanded = true;
      this.squash = 1.18;
      this.stretch = 0.84;
      game.spawnDust(this.centerX, this.y + this.h, 6, 'rgba(255,255,255,.55)');
      if (this.vy > 700) game.audio.noise({ dur: 0.12, vol: 0.2, lp: 700 });
    }

    /* ------------------ 地图交互 ------------------ */
    this.collectTiles(game);
    this.checkHazards(game);

    /* ------------------ 计时器 ------------------ */
    if (this.invuln > 0) this.invuln -= dt;
    if (this.onGround) {
      this.flyFuel = Math.min(CONFIG.FLY_MAX, this.flyFuel + CONFIG.FLY_REFILL * dt);
      // 记录安全复活点
      this.safeTimer -= dt;
      if (this.safeTimer <= 0) {
        this.safeTimer = 0.4;
        const cx = Math.floor(this.centerX / CONFIG.TILE);
        const feet = Math.floor((this.y + this.h + 2) / CONFIG.TILE);
        if (isSolidTile(lvl, cx, feet) && !this.onHazard) {
          this.safeX = this.x;
          this.safeY = this.y;
        }
      }
    }

    if (Math.abs(this.vx) > 8 && this.onGround) this.walkPhase += dt * Math.abs(this.vx) * 0.05;
  }

  /* ---------------- 水平碰撞 ---------------- */
  collideX(lvl, game) {
    const t = CONFIG.TILE;
    const y0 = Math.floor(this.y / t);
    const y1 = Math.floor((this.y + this.h - 1) / t);
    if (this.vx > 0) {
      const tx = Math.floor((this.x + this.w - 1) / t);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolidTile(lvl, tx, ty)) {
          this.x = tx * t - this.w - 0.01;
          if (this.dashTimer > 0) {
            game.spawnDust(this.x + this.w, this.centerY, 8, '#ffffff');
            this.dashTimer = Math.min(this.dashTimer, 0.08);
          }
          this.vx = 0;
          break;
        }
      }
    } else if (this.vx < 0) {
      const tx = Math.floor(this.x / t);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolidTile(lvl, tx, ty)) {
          this.x = (tx + 1) * t + 0.01;
          if (this.dashTimer > 0) {
            game.spawnDust(this.x, this.centerY, 8, '#ffffff');
            this.dashTimer = Math.min(this.dashTimer, 0.08);
          }
          this.vx = 0;
          break;
        }
      }
    }
  }

  /* ---------------- 垂直碰撞（含单向平台、顶砖块） ---------------- */
  collideY(lvl, game, prevBottom) {
    const t = CONFIG.TILE;
    const x0 = Math.floor(this.x / t);
    const x1 = Math.floor((this.x + this.w - 1) / t);
    this.onGround = false;

    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / t);
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        const solid = SOLID_CHARS.has(ch);
        const oneWay = ch === '=' && prevBottom <= ty * t + 4;
        if (solid || oneWay) {
          this.y = ty * t - this.h;
          if (ch === 'S') {
            this.vy = -CONFIG.SPRING_V;
            this.jumping = true;
            this.jumpHold = 0;
            this.stretch = 1.3;
            this.squash = 0.75;
            game.audio.play('spring');
            game.spawnDust(this.centerX, this.y + this.h, 12, '#ffe066');
          } else {
            this.vy = 0;
          }
          this.onGround = ch !== 'S';
          break;
        }
      }
    } else if (this.vy < 0) {
      const ty = Math.floor(this.y / t);
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        if (SOLID_CHARS.has(ch)) {
          this.y = (ty + 1) * t + 0.01;
          this.vy = 0;
          this.hitBlock(game, tx, ty, ch);
          break;
        }
      }
    }
  }

  /* ---------------- 顶砖块 ---------------- */
  hitBlock(game, tx, ty, ch) {
    const lvl = game.level;
    if (ch === '?') {
      lvl.grid[ty][tx] = 'X';
      game.addScore(CONFIG.SCORE_BLOCK, tx * CONFIG.TILE + 16, ty * CONFIG.TILE, this);
      this.addFlight(CONFIG.FLY_COIN);
      game.coins++;
      game.audio.play('block');
      game.audio.play('coin');
      game.spawnCoinPop(tx * CONFIG.TILE + 16, ty * CONFIG.TILE, this);
    } else if (ch === 'B') {
      lvl.grid[ty][tx] = '.';
      game.audio.play('brick');
      game.spawnDebris(tx * CONFIG.TILE + 16, ty * CONFIG.TILE + 16);
      game.addScore(50, tx * CONFIG.TILE + 16, ty * CONFIG.TILE, this);
    } else if (ch === '#' || ch === 'X' || ch === 'S') {
      game.audio.play('block');
      game.spawnDust(tx * CONFIG.TILE + 16, ty * CONFIG.TILE + CONFIG.TILE, 3, 'rgba(255,255,255,.5)');
    }
  }

  /* ---------------- 地图上的金币 / 旗杆 ---------------- */
  collectTiles(game) {
    const lvl = game.level;
    const t = CONFIG.TILE;
    const x0 = Math.floor(this.x / t);
    const x1 = Math.floor((this.x + this.w - 1) / t);
    const y0 = Math.floor(this.y / t);
    const y1 = Math.floor((this.y + this.h - 1) / t);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        if (ch === 'C' && lvl.grid[ty][tx] === 'C') {
          lvl.grid[ty][tx] = '.';
          game.coins++;
          game.addScore(CONFIG.SCORE_COIN, tx * t + 16, ty * t, this);
          this.addFlight(CONFIG.FLY_COIN);
          game.audio.play('coin');
          game.spawnSparkle(tx * t + 16, ty * t + 16, '#ffd93b');
        } else if (ch === 'F' && !this.atGoal) {
          this.atGoal = true;
          this.goalTime = game.levelTime;
          game.audio.play('coin');
          game.floater(this.centerX, this.y - 14, '到达旗杆！', '#ffd93b');
          this.addFlight(CONFIG.FLY_MAX);
          game.spawnSparkle(this.centerX, this.centerY, '#fff3b0', 20);
        }
      }
    }
  }

  /* ---------------- 危险物 / 掉坑 ---------------- */
  checkHazards(game) {
    const lvl = game.level;
    const t = CONFIG.TILE;
    const x0 = Math.floor(this.x / t);
    const x1 = Math.floor((this.x + this.w - 1) / t);
    const y0 = Math.floor(this.y / t);
    const y1 = Math.floor((this.y + this.h - 1) / t);
    this.onHazard = false;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        if (HAZARD_CHARS.has(ch)) {
          this.onHazard = true;
          if (ch === '~') {
            game.spawnSparkle(this.centerX, this.y + this.h, '#ff8a3d', 14);
            this.hurt(1, -sign(this.vx || 1), game);
            this.respawnAtCheckpoint(game, true);
          } else {
            this.hurt(1, -sign(this.vx || 1), game);
          }
          return;
        }
      }
    }
    if (this.y > lvl.pixelHeight + 40) {
      this.hurt(1, 0, game, true);
      this.respawnAtCheckpoint(game, true);
    }
  }

  /* ---------------- 受伤 / 倒地 / 复活 ---------------- */
  hurt(amount, dirX, game, silentKnock) {
    if (this.dead || this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = CONFIG.INVULN_TIME;
    this.squash = 0.8;
    this.stretch = 1.2;
    if (!silentKnock) {
      this.vx = dirX * 240;
      this.vy = -320;
    }
    game.audio.play('hurt');
    game.shake(10);
    game.spawnSparkle(this.centerX, this.centerY, this.palette.accent, 12);
    if (this.hp <= 0) this.knockOut(game);
    return true;
  }

  knockOut(game) {
    this.hp = 0;
    this.dead = true;
    this.flying = false;
    this.dashTimer = 0;
    this.koTimer = CONFIG.KO_REVIVE;
    this.vy = -420;
    this.vx = 0;
    game.audio.play('ko');
    game.shake(16);
    game.spawnSparkle(this.centerX, this.centerY, '#ffffff', 24);
  }

  updateKnockedOut(dt, game) {
    this.koTimer -= dt;
    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y + this.h > game.level.pixelHeight) {
      this.y = game.level.pixelHeight - this.h;
      this.vy = 0;
    }
    if (this.koTimer <= 0) this.revive(game);
  }

  revive(game) {
    this.dead = false;
    this.hp = 2;
    this.invuln = 2.2;
    this.x = this.safeX;
    this.y = this.safeY - 4;
    this.vx = 0;
    this.vy = 0;
    this.flyFuel = CONFIG.FLY_MAX;
    this.respawnFlash = 1.1;
    game.audio.play('revive');
    game.spawnSparkle(this.centerX, this.centerY, this.palette.accent, 22);
    game.floater(this.centerX, this.y - 10, `${this.name} 复活！`, this.palette.accent);
  }

  respawnAtCheckpoint(game, keepPos) {
    if (this.dead) return;
    if (!keepPos) return;
    this.x = this.safeX;
    this.y = this.safeY - 2;
    this.vx = 0;
    this.vy = 0;
    this.invuln = Math.max(this.invuln, 1.0);
    this.flyFuel = Math.max(this.flyFuel, CONFIG.FLY_MAX * 0.5);
    this.respawnFlash = 0.6;
    game.spawnSparkle(this.centerX, this.centerY, '#ffffff', 14);
  }

  addFlight(seconds) {
    this.flyFuel = Math.min(CONFIG.FLY_MAX, this.flyFuel + seconds);
  }

  /* ---------------- 技能 ---------------- */
  useSkill(game) {
    if (this.dead || this.skillCd > 0) {
      if (this.skillCd > 0) game.audio.tone({ freq: 180, dur: 0.06, vol: 0.18, type: 'square' });
      return;
    }
    if (this.index === 0) {
      // 火焰弹
      this.skillCd = CONFIG.FIRE_CD;
      const fx = this.facing > 0 ? this.x + this.w - 2 : this.x - 10;
      game.projectiles.push(new Fireball(fx, this.centerY - 6, this.facing, this.index));
      game.audio.play('fire');
      game.spawnSparkle(fx, this.centerY, '#ff9f43', 8);
      this.vx -= this.facing * 40;
    } else {
      // 旋风冲刺
      this.skillCd = CONFIG.DASH_CD;
      this.dashTimer = CONFIG.DASH_TIME;
      this.dashDir = this.facing;
      this.vx = this.dashDir * CONFIG.DASH_SPEED;
      this.invuln = Math.max(this.invuln, CONFIG.DASH_TIME + 0.1);
      this.stretch = 1.25;
      this.squash = 0.8;
      game.audio.play('dash');
      game.spawnSparkle(this.centerX, this.centerY, '#7ee8ff', 14);
      game.shake(5);
    }
  }

  get isAttacking() { return this.dashTimer > 0; }
  get spriteAlpha() {
    if (this.dead) return 0.35;
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) return 0.45;
    return 1;
  }
}

/* ------------------------------------------------------------------
   行走敌人（蘑菇怪）
   ------------------------------------------------------------------ */
class Walker {
  constructor(tx, ty) {
    this.w = 24;
    this.h = 26;
    this.x = tx * CONFIG.TILE + (CONFIG.TILE - this.w) / 2;
    this.y = ty * CONFIG.TILE + CONFIG.TILE - this.h;
    this.vx = -CONFIG.ENEMY_SPEED;
    this.vy = 0;
    this.state = 'active';
    this.dieTimer = 0;
    this.animTime = rand(0, 2);
    this.kind = 'walker';
    this.squashed = false;
  }
  get alive() { return this.state === 'active'; }

  update(dt, game) {
    this.animTime += dt;
    if (this.state === 'dying') {
      this.dieTimer -= dt;
      this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      if (this.dieTimer <= 0) this.state = 'gone';
      return;
    }
    if (this.squashed) {
      this.dieTimer -= dt;
      if (this.dieTimer <= 0) this.state = 'gone';
      return;
    }
    const lvl = game.level;
    const t = CONFIG.TILE;

    this.vy = Math.min(this.vy + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);

    // 水平
    this.x += this.vx * dt;
    const y0 = Math.floor(this.y / t);
    const y1 = Math.floor((this.y + this.h - 1) / t);
    if (this.vx > 0) {
      const tx = Math.floor((this.x + this.w - 1) / t);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolidTile(lvl, tx, ty)) { this.x = tx * t - this.w - 0.01; this.vx *= -1; break; }
      }
    } else {
      const tx = Math.floor(this.x / t);
      for (let ty = y0; ty <= y1; ty++) {
        if (isSolidTile(lvl, tx, ty)) { this.x = (tx + 1) * t + 0.01; this.vx *= -1; break; }
      }
    }

    // 垂直
    this.y += this.vy * dt;
    this.onGround = false;
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / t);
      const x0 = Math.floor(this.x / t);
      const x1 = Math.floor((this.x + this.w - 1) / t);
      for (let tx = x0; tx <= x1; tx++) {
        const ch = tileAt(lvl, tx, ty);
        if (SOLID_CHARS.has(ch) || (ch === '=' && this.vy > 0)) {
          this.y = ty * t - this.h;
          this.vy = 0;
          this.onGround = true;
          break;
        }
      }
    }

    // 悬崖折返（只在着地时）
    if (this.onGround) {
      const probeX = this.vx > 0 ? this.x + this.w + 4 : this.x - 4;
      const ptx = Math.floor(probeX / t);
      const pty = Math.floor((this.y + this.h + 4) / t);
      if (!isSolidTile(lvl, ptx, pty) && tileAt(lvl, ptx, pty) !== '=') this.vx *= -1;
    }
    if (this.y > lvl.pixelHeight + 60) this.state = 'gone';
  }

  stomp(game, player) {
    if (!this.alive) return;
    this.squashed = true;
    this.state = 'squashed';
    this.dieTimer = 0.35;
    game.audio.play('stomp');
    game.spawnSparkle(this.x + this.w / 2, this.y + this.h / 2, '#c98b52', 8);
    game.addScore(CONFIG.SCORE_STOMP, this.x + this.w / 2, this.y, player);
  }

  kill(game, player, cause) {
    if (!this.alive) return;
    this.state = 'dying';
    this.dieTimer = 1.1;
    this.vy = -300;
    this.vx = (cause === 'fire' ? sign(this.vx || -1) * 90 : 70);
    game.audio.play(cause === 'fire' ? 'fire' : 'stomp');
    game.spawnSparkle(this.x + this.w / 2, this.y + this.h / 2, '#ffb057', 12);
    game.addScore(CONFIG.SCORE_STOMP, this.x + this.w / 2, this.y, player);
  }
}

/* ------------------------------------------------------------------
   飞行敌人（夜蝠）
   ------------------------------------------------------------------ */
class Flyer {
  constructor(tx, ty) {
    this.w = 26;
    this.h = 20;
    this.x = tx * CONFIG.TILE + (CONFIG.TILE - this.w) / 2;
    this.baseY = ty * CONFIG.TILE;
    this.y = this.baseY;
    this.homeX = this.x;
    this.range = 92;
    this.dir = -1;
    this.t = rand(0, Math.PI * 2);
    this.state = 'active';
    this.dieTimer = 0;
    this.kind = 'flyer';
    this.squashed = false;
    this.animTime = 0;
  }
  get alive() { return this.state === 'active'; }

  update(dt, game) {
    this.animTime += dt;
    if (this.state !== 'active') {
      this.dieTimer -= dt;
      if (this.state === 'dying') {
        this.vy = Math.min((this.vy || 0) + CONFIG.GRAVITY * dt, CONFIG.MAX_FALL);
        this.y += this.vy * dt;
      }
      if (this.dieTimer <= 0) this.state = 'gone';
      return;
    }
    this.t += dt * 2.1;
    this.x += this.dir * CONFIG.FLYER_SPEED * dt;
    if (this.x > this.homeX + this.range) this.dir = -1;
    if (this.x < this.homeX - this.range) this.dir = 1;
    this.y = this.baseY + Math.sin(this.t) * 34;
  }

  stomp(game, player) {
    if (!this.alive) return;
    this.state = 'dying';
    this.dieTimer = 1.0;
    this.vy = 120;
    game.audio.play('stomp');
    game.spawnSparkle(this.x + this.w / 2, this.y + this.h / 2, '#b48cff', 10);
    game.addScore(CONFIG.SCORE_STOMP, this.x + this.w / 2, this.y, player);
  }

  kill(game, player, cause) {
    if (!this.alive) return;
    this.state = 'dying';
    this.dieTimer = 1.0;
    this.vy = -180;
    game.audio.play(cause === 'fire' ? 'fire' : 'stomp');
    game.spawnSparkle(this.x + this.w / 2, this.y + this.h / 2, '#b48cff', 12);
    game.addScore(CONFIG.SCORE_STOMP, this.x + this.w / 2, this.y, player);
  }
}

/* ------------------------------------------------------------------
   火焰弹（玩家 1 技能）
   ------------------------------------------------------------------ */
class Fireball {
  constructor(x, y, dir, owner) {
    this.w = 12;
    this.h = 12;
    this.x = x;
    this.y = y;
    this.vx = dir * CONFIG.FIRE_SPEED;
    this.vy = -140;
    this.dir = dir;
    this.owner = owner;
    this.life = CONFIG.FIRE_LIFE;
    this.dead = false;
    this.spin = 0;
    this.trailTimer = 0;
  }

  update(dt, game) {
    const lvl = game.level;
    const t = CONFIG.TILE;
    this.life -= dt;
    this.spin += dt * 14;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy = Math.min(this.vy + 1500 * dt, CONFIG.MAX_FALL);

    // 水平
    this.x += this.vx * dt;
    const y0 = Math.floor(this.y / t);
    const y1 = Math.floor((this.y + this.h - 1) / t);
    const tx = Math.floor((this.x + (this.vx > 0 ? this.w - 1 : 0)) / t);
    for (let ty = y0; ty <= y1; ty++) {
      if (isSolidTile(lvl, tx, ty)) { this.dead = true; game.spawnSparkle(this.x, this.y, '#ff9f43', 8); return; }
    }

    // 垂直
    this.y += this.vy * dt;
    const x0 = Math.floor(this.x / t);
    const x1 = Math.floor((this.x + this.w - 1) / t);
    if (this.vy > 0) {
      const ty = Math.floor((this.y + this.h) / t);
      for (let cx = x0; cx <= x1; cx++) {
        if (SOLID_CHARS.has(tileAt(lvl, cx, ty))) {
          this.y = ty * t - this.h;
          this.vy = -330; // 弹跳
          break;
        }
      }
    }

    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.035;
      game.spawnSparkle(this.x + this.w / 2, this.y + this.h / 2, '#ffbe4d', 1);
    }
    if (this.y > lvl.pixelHeight + 60) this.dead = true;
  }
}

/* ------------------------------------------------------------------
   碰撞判定（独立成函数，便于单独测试）
   ------------------------------------------------------------------ */

/** 玩家 vs 敌人：技能无敌击杀 / 踩踏 / 受伤 */
function resolvePlayerEnemyCollisions(game) {
  const players = game.players;
  for (let pi = 0; pi < players.length; pi++) {
    const p = players[pi];
    if (p.dead) continue;

    for (let ei = 0; ei < game.enemies.length; ei++) {
      const e = game.enemies[ei];
      if (!e.alive) continue;
      if (!aabb(p, e)) continue;

      // 旋风冲刺等攻击状态：撞到即击杀
      if (p.isAttacking) {
        e.kill(game, p, 'dash');
        game.shake(4);
        p.addFlight(0.25);
        continue;
      }

      // 从上方踩踏
      const fromAbove = p.vy > 20 && (p.y + p.h - e.y) < e.h * 0.75;
      if (fromAbove) {
        e.stomp(game, p);
        p.combo = (p.combo || 0) + 1;
        p.comboTimer = CONFIG.COMBO_TIME;
        const boost = Input.hold(p.index, 'jump') ? 1.14 : 1;
        p.vy = -CONFIG.STOMP_BOUNCE * boost * (1 + Math.min(2, p.combo - 1) * 0.08);
        p.jumping = true;
        p.jumpHold = 0;
        p.jumpCut = true;
        p.stretch = 1.2;
        p.squash = 0.86;
        p.addFlight(0.35);
        if (p.combo > 1) game.floater(p.centerX, p.y - 14, `连击 x${p.combo}`, '#ffd93b');
        game.shake(3);
      } else {
        const dir = sign(p.centerX - (e.x + e.w / 2)) || -p.facing;
        p.hurt(1, dir, game);
      }
    }
  }
}

/** 火球 vs 敌人 */
function resolveProjectileHits(game) {
  for (let i = 0; i < game.projectiles.length; i++) {
    const fb = game.projectiles[i];
    if (fb.dead) continue;
    for (let j = 0; j < game.enemies.length; j++) {
      const e = game.enemies[j];
      if (!e.alive) continue;
      if (aabb(fb, e)) {
        e.kill(game, game.players[fb.owner], 'fire');
        fb.dead = true;
        game.spawnSparkle(fb.x, fb.y, '#ffbe4d', 12);
        game.shake(3);
        break;
      }
    }
  }
}
