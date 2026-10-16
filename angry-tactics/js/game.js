/* ============================================================
 *  game.js — 怒鸟战术 · 游戏主逻辑
 *  卡牌策略层 + 弹射物理层 + 渲染 + UI
 * ============================================================ */
(function () {
  'use strict';

  var P = window.ABPhysics;
  var D = window.ABData;
  var V = P.V;
  var CFG = D.CONFIG;
  var W = CFG.W, H = CFG.H, GROUND = CFG.GROUND, SLING = CFG.SLING;

  /* ---------------- DOM ---------------- */
  var cv = document.getElementById('game');
  var ctx = cv.getContext('2d');
  var ov = document.getElementById('ov');
  var handEl = document.getElementById('hand');
  var pipsEl = document.getElementById('pips');
  function $(id) { return document.getElementById(id); }

  /* ---------------- 状态 ---------------- */
  var G = null;      // 当前对局
  var raf = null;
  var lastT = 0;
  var T = 0;         // 全局时间（动画用）
  var shake = 0;
  var uiDirty = false;   // 数据变了就刷新一次 DOM，避免每帧重建

  function markUI() { uiDirty = true; }
  function overlayOpen() { return ov.className.indexOf('on') >= 0; }

  function newState(li, keepScore) {
    var lv = D.LEVELS[li];
    var world = new P.World({ gravity: { x: 0, y: 1900 } });
    var built = D.buildLevel(world, lv);
    return {
      li: li, lv: lv, world: world,
      blocks: built.blocks, pigs: built.pigs,
      flying: [], eggs: [], queue: [], loaded: null,
      parts: [], rings: [], floats: [],
      hand: [], deck: [], discard: [],
      energy: 4, maxEnergy: 10,
      round: 1, score: keepScore || 0,
      phase: 'ready',
      dragging: false, drag: { x: SLING.x, y: SLING.y },
      flightT: 0,
      eff: { power: 1, aim: false, frost: 1, boost: 1, slow: false },
      timeScale: 1,
      hoverBlock: null,
      stars: 0,
      pigsTotal: lv.pigs.length
    };
  }

  /* ---------------- 卡牌 ---------------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function buildDeck(st) {
    st.deck = shuffle(D.DECK.slice());
    st.discard = [];
    st.hand = [];
    drawCards(st, 5);
  }

  function drawCards(st, n) {
    for (var i = 0; i < n; i++) {
      if (st.hand.length >= CFG.HAND_MAX) break;
      if (!st.deck.length) {
        if (!st.discard.length) break;
        st.deck = shuffle(st.discard.slice());
        st.discard = [];
      }
      st.hand.push(st.deck.pop());
    }
  }

  function playCard(st, idx) {
    var id = st.hand[idx];
    if (!id) return;
    var c = D.LIB[id];
    if (st.phase === 'flying' || st.phase === 'targeting' || st.phase === 'over') return;
    if (st.energy < c.cost) { toast('能量不足', '#ff9c9c'); return; }

    st.energy -= c.cost;
    st.hand.splice(idx, 1);
    st.discard.push(id);

    if (c.k === 'bird') queueBird(st, c.bird);
    else applyTactic(st, id);

    sfx('card');
    syncUI();
  }

  function queueBird(st, kind) {
    st.queue.push({ kind: kind });
    if (!st.loaded) st.loaded = st.queue.shift();
  }

  function applyTactic(st, id) {
    switch (id) {
      case 'power': st.eff.power = 1.45; floatText('力度 +45%', '#ffd865'); break;
      case 'aim': st.eff.aim = true; floatText('弹道预测开启', '#8fe1ff'); break;
      case 'frost': st.eff.frost = 1.7; floatText('建筑变脆 ×1.7', '#9fe8ff'); break;
      case 'boost': st.eff.boost = 1.6; floatText('撞击伤害 ×1.6', '#ff9c5b'); break;
      case 'charge':
        st.energy = Math.min(st.maxEnergy, st.energy + 2);
        floatText('+2 能量', '#ffe27a'); break;
      case 'scout': drawCards(st, 2); floatText('抽 2 张牌', '#c7d8ea'); break;
      case 'slow': st.eff.slow = true; st.timeScale = 0.45; floatText('时间缓流', '#b9a6ff'); break;
      case 'summon':
        queueBird(st, 'blue'); queueBird(st, 'blue');
        floatText('蓝鸟 ×2 加入', '#8fd3f0'); break;
      case 'heavy': queueBird(st, 'black'); floatText('黑鸟加入', '#c7d8ea'); break;
      case 'demo':
        if (!st.blocks.length) { floatText('没有可摧毁的建筑', '#ff8a7a'); break; }
        st.phase = 'targeting'; break;
      case 'fire': {
        st.blocks.slice().forEach(function (b) { hurtBlock(st, b, 95); });
        for (var i = 0; i < 26; i++) {
          st.parts.push(mkPart(200 + Math.random() * 900, 120 + Math.random() * 380, '#ff7a2f', 'spark'));
        }
        shake = Math.max(shake, 16); floatText('烈焰风暴！', '#ff7a2f'); sfx('boom');
        break;
      }
      case 'quake': {
        st.blocks.slice().forEach(function (b) { hurtBlock(st, b, 75); });
        st.pigs.slice().forEach(function (p) { hurtPig(st, p, 110); });
        st.world.bodies.forEach(function (b) {
          if (b.isStatic || b.tag === 'ground') return;
          b.wake();
          b.vel.y += 260;
          b.vel.x += (Math.random() - 0.5) * 90;
          b.angVel += (Math.random() - 0.5) * 4;
        });
        for (var k = 0; k < 34; k++) {
          st.parts.push(mkPart(Math.random() * W, GROUND - 40 - Math.random() * 260, '#c9b48a', 'dust'));
        }
        shake = Math.max(shake, 22); floatText('大地震！', '#e8d9a0'); sfx('boom');
        break;
      }
    }
  }

  /* ---------------- 发射 ---------------- */
  function launch(st, vel) {
    if (!st.loaded) return;
    var d = st.loaded, cfg = D.BIRDS[d.kind];
    var sp = Math.hypot(vel.x, vel.y);
    if (sp > CFG.MAX_SPEED) vel = { x: vel.x / sp * CFG.MAX_SPEED, y: vel.y / sp * CFG.MAX_SPEED };
    var bd = new P.Body({
      x: st.drag.x, y: st.drag.y, vx: vel.x, vy: vel.y,
      density: cfg.density, friction: cfg.friction, restitution: cfg.restitution,
      tag: 'bird', data: { kind: d.kind, used: false, fuse: -1, landed: 0, alpha: 1 }
    });
    bd.setShape({ type: 'circle', r: cfg.r });
    bd.angVel = vel.x * 0.004;
    st.world.add(bd);
    st.flying.push(bd);
    st.loaded = st.queue.length ? st.queue.shift() : null;
    st.phase = 'flying';
    st.flightT = 0;
    if (st.eff.power > 1) st.eff.power = 1;   // 大力神臂只生效一次
    sfx('launch');
  }

  function activeBird(st) {
    for (var i = 0; i < st.flying.length; i++) {
      if (!st.flying[i].data.used && st.flying[i].alive) return st.flying[i];
    }
    return null;
  }

  function useAbility(st) {
    var b = activeBird(st);
    if (!b) return;
    b.data.used = true;
    var kind = b.data.kind;

    if (kind === 'red') {
      st.world.blast(b.pos.x, b.pos.y, 155, 1.1);
      st.blocks.slice().forEach(function (x) {
        if (V.len(V.sub(x.pos, b.pos)) < 155) hurtBlock(st, x, 55);
      });
      st.pigs.slice().forEach(function (p) {
        if (V.len(V.sub(p.pos, b.pos)) < 155) hurtPig(st, p, 60);
      });
      ring(b.pos.x, b.pos.y, 155, '#ff8a7a');
      for (var i = 0; i < 18; i++) st.parts.push(mkPart(b.pos.x, b.pos.y, '#ff8a7a', 'spark'));
      sfx('boom'); shake = Math.max(shake, 10); floatText('怒吼！', '#ff8a7a');
    } else if (kind === 'blue') {
      for (var s = -1; s <= 1; s += 2) {
        var v = V.rot(b.vel, s * 0.26);
        var nb = new P.Body({
          x: b.pos.x, y: b.pos.y, vx: v.x, vy: v.y,
          density: D.BIRDS.blue.density, friction: 0.5, restitution: 0.36,
          tag: 'bird', data: { kind: 'blue', used: true, fuse: -1, landed: 0, alpha: 1 }
        });
        nb.setShape({ type: 'circle', r: D.BIRDS.blue.r });
        nb.angVel = b.angVel;
        st.world.add(nb); st.flying.push(nb);
      }
      sfx('split'); floatText('分裂！', '#8fd3f0');
    } else if (kind === 'yellow') {
      var sp = V.len(b.vel) || 1;
      b.vel = V.mul(V.norm(b.vel), Math.min(sp * 2.1 + 260, 3200));
      sfx('dash'); floatText('冲刺！', '#ffe27a');
    } else if (kind === 'black') {
      explode(st, b.pos.x, b.pos.y, 172, 2.15);
      st.world.remove(b);
      st.flying = st.flying.filter(function (x) { return x !== b; });
    } else if (kind === 'white') {
      var egg = new P.Body({
        x: b.pos.x, y: b.pos.y + 12, vy: 460, vx: b.vel.x * 0.35,
        density: 1.4, friction: 0.4, restitution: 0.05, tag: 'egg', data: { fuse: 0.5 }
      });
      egg.setShape({ type: 'circle', r: 9 });
      st.world.add(egg); st.eggs.push(egg);
      b.wake();
      b.vel = { x: b.vel.x * 0.55, y: -430 };
      floatText('下蛋！', '#ffffff');
    } else if (kind === 'green') {
      b.wake();
      b.vel = { x: -b.vel.x * 1.45, y: -Math.abs(b.vel.y) * 0.55 - 80 };
      b.angVel *= -3;
      sfx('dash'); floatText('回旋！', '#a8e88f');
    }
  }

  function explode(st, x, y, radius, power) {
    st.world.blast(x, y, radius, power);
    st.blocks.slice().forEach(function (k) {
      var d = V.len(V.sub(k.pos, { x: x, y: y }));
      if (d < radius + 40) hurtBlock(st, k, 190 * (1 - d / (radius + 40)) + 60);
    });
    st.pigs.slice().forEach(function (p) {
      var d = V.len(V.sub(p.pos, { x: x, y: y }));
      if (d < radius + 30) hurtPig(st, p, 160 * (1 - d / (radius + 30)) + 60);
    });
    for (var i = 0; i < 42; i++) {
      st.parts.push(mkPart(x, y, i % 3 ? '#ff9b3d' : '#ffe27a', 'spark'));
    }
    ring(x, y, radius, '#ffb347');
    shake = Math.max(shake, 22);
    sfx('boom');
  }

  /* ---------------- 伤害 ---------------- */
  function dmgOf(s, b, mul, thr) {
    var sp = (b.impactSpeed || 0) - thr;
    if (sp <= 0) return 0;
    return sp * (b.impactMass / CFG.DMG_REF_MASS) * CFG.DMG_K * mul *
           s.eff.frost * s.eff.boost;
  }

  function applyImpacts(st) {
    for (var i = st.world.bodies.length - 1; i >= 0; i--) {
      var b = st.world.bodies[i];
      if (b.tag === 'block') {
        var d = dmgOf(st, b, 1, CFG.DMG_THRESHOLD);
        if (d > 0) hurtBlock(st, b, d, true);
      } else if (b.tag === 'pig') {
        var d2 = dmgOf(st, b, CFG.PIG_DMG_MUL, CFG.DMG_THRESHOLD_PIG);
        if (d2 > 0) hurtPig(st, b, d2);
      }
    }
  }

  function hurtBlock(st, b, amount, silent) {
    if (!b.alive) return;
    b.data.hp -= amount;
    if (!silent && b.data.hp > 0) {
      for (var i = 0; i < 2; i++) {
        st.parts.push(mkPart(
          b.pos.x + (Math.random() - 0.5) * b.data.w,
          b.pos.y + (Math.random() - 0.5) * b.data.h,
          D.MAT[b.data.mat].c2, 'dust'));
      }
    }
    if (b.data.hp <= 0) killBlock(st, b);
  }

  function killBlock(st, b) {
    if (!b.alive) return;
    var mat = b.data.mat;
    st.world.remove(b);
    st.blocks = st.blocks.filter(function (x) { return x !== b; });
    st.score += D.MAT[mat].score;
    floatText('+' + D.MAT[mat].score, mat === 'stone' ? '#cfd8e3' : mat === 'ice' ? '#b6e4fa' : '#e2b071');
    for (var i = 0; i < 8; i++) st.parts.push(mkPart(b.pos.x, b.pos.y, D.MAT[mat].c1, 'chunk'));
    ring(b.pos.x, b.pos.y, 34, '#ffffff');
    sfx('crack');
    markUI();
  }

  function hurtPig(st, p, amount) {
    if (!p.alive) return;
    p.data.hp -= amount;
    if (p.data.hp <= 0) killPig(st, p);
  }

  function killPig(st, p) {
    if (!p.alive) return;
    st.world.remove(p);
    st.pigs = st.pigs.filter(function (x) { return x !== p; });
    st.score += 5000;
    floatText('+5000 🐷', '#8ff06a');
    for (var i = 0; i < 16; i++) st.parts.push(mkPart(p.pos.x, p.pos.y, '#8ed860', 'chunk'));
    ring(p.pos.x, p.pos.y, 40, '#c8ffb0');
    sfx('pig'); shake = Math.max(shake, 7);
    markUI();
  }

  /* ---------------- 特效 ---------------- */
  var st = null;   // 供 dmgOf 使用（每次进关卡重新指向）

  function mkPart(x, y, c, type) {
    return {
      x: x, y: y,
      vx: (Math.random() - 0.5) * (type === 'spark' ? 420 : 150),
      vy: -Math.random() * (type === 'spark' ? 430 : 210) - 40,
      c: c, type: type, life: 0,
      max: 0.5 + Math.random() * 0.7,
      size: type === 'spark' ? 2 + Math.random() * 3 : 3 + Math.random() * 5
    };
  }
  function ring(x, y, r, c) { G.rings.push({ x: x, y: y, r: r, c: c, t: 0 }); }
  function floatText(txt, c) {
    G.floats.push({ x: W / 2 - 60 + Math.random() * 120, y: 190 + Math.random() * 70, txt: txt, c: c, t: 0 });
  }
  function toast(txt, c) {
    G.floats.push({ x: W / 2, y: 120, txt: txt, c: c, t: 0 });
  }

  /* ---------------- 回合 ---------------- */
  function settled(st) {
    for (var i = 0; i < st.world.bodies.length; i++) {
      var b = st.world.bodies[i];
      if (b.isStatic || b.tag === 'ground') continue;
      if (!b.asleep) return false;
    }
    return true;
  }

  function endShot(st) {
    st.phase = 'ready';
    st.flightT = 0;
    markUI();
    checkWin(st);
  }

  function checkWin(st) {
    if (st.pigs.length === 0 && st.phase !== 'over') {
      st.phase = 'over';
      var bonus = Math.max(0, (st.lv.rounds - st.round + 1)) * 800;
      st.score += bonus;
      st.stars = st.round <= st.lv.par ? 3 : (st.round <= st.lv.par + 1 ? 2 : 1);
      winOverlay(st, bonus);
      return true;
    }
    return false;
  }

  function endTurn(st) {
    if (st.phase !== 'ready') return;
    if (checkWin(st)) return;
    st.round++;
    if (st.round > st.lv.rounds) {
      st.phase = 'over';
      loseOverlay(st);
      return;
    }
    st.energy = Math.min(st.maxEnergy, st.energy + 2);
    drawCards(st, 2);
    st.eff = { power: 1, aim: false, frost: 1, boost: 1, slow: false };
    st.timeScale = 1;
    syncUI();
  }

  /* ---------------- 渲染 ---------------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  var CLOUDS = [{ x: 180, y: 110, s: 1.25 }, { x: 520, y: 70, s: .9 },
                { x: 880, y: 135, s: 1.1 }, { x: 1180, y: 80, s: .8 }];

  function drawBG() {
    var g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, '#5fb0e4');
    g.addColorStop(.55, '#a9dcf3');
    g.addColorStop(1, '#e6f6d9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND + 4);

    var sg = ctx.createRadialGradient(1090, 120, 10, 1090, 120, 130);
    sg.addColorStop(0, 'rgba(255,246,200,.95)');
    sg.addColorStop(.4, 'rgba(255,232,140,.45)');
    sg.addColorStop(1, 'rgba(255,232,140,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(1090, 120, 130, 0, 7); ctx.fill();

    ctx.save();
    ctx.globalAlpha = .85;
    ctx.fillStyle = '#ffffff';
    CLOUDS.forEach(function (c, i) {
      var x = ((c.x + T * (8 + i * 4)) % (W + 420)) - 210;
      ctx.beginPath();
      ctx.arc(x, c.y, 30 * c.s, 0, 7);
      ctx.arc(x + 34 * c.s, c.y + 9 * c.s, 23 * c.s, 0, 7);
      ctx.arc(x - 32 * c.s, c.y + 11 * c.s, 20 * c.s, 0, 7);
      ctx.arc(x + 7 * c.s, c.y - 16 * c.s, 21 * c.s, 0, 7);
      ctx.fill();
    });
    ctx.restore();

    ctx.fillStyle = '#8ec7a0';
    ctx.beginPath(); ctx.moveTo(-50, GROUND); ctx.lineTo(150, 400); ctx.lineTo(360, GROUND); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7cbb92';
    ctx.beginPath(); ctx.moveTo(280, GROUND); ctx.lineTo(520, 360); ctx.lineTo(800, GROUND); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8ec7a0';
    ctx.beginPath(); ctx.moveTo(760, GROUND); ctx.lineTo(1010, 395); ctx.lineTo(1290, GROUND); ctx.closePath(); ctx.fill();
  }

  function drawGround() {
    var g = ctx.createLinearGradient(0, GROUND, 0, H);
    g.addColorStop(0, '#9ed86f');
    g.addColorStop(.2, '#7ab34f');
    g.addColorStop(.28, '#8a6438');
    g.addColorStop(1, '#5c4023');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = 'rgba(60,40,18,.32)';
    ctx.lineWidth = 2;
    for (var i = 0; i < 70; i++) {
      var x = (i * 97) % W, y = GROUND + 24 + ((i * 53) % Math.max(1, H - GROUND - 34));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 13, y + 4); ctx.stroke();
    }
  }

  /* 弹弓几何：叉口正好托住小鸟（SLING.y），树干扎根在地面 */
  var TIP_L = { x: SLING.x - 22, y: SLING.y + 6 };
  var TIP_R = { x: SLING.x + 16, y: SLING.y - 6 };
  var FORK = { x: SLING.x - 4, y: SLING.y + 66 };

  function drawSlingBack() {
    ctx.strokeStyle = '#7a5230';
    ctx.lineCap = 'round';
    ctx.lineWidth = 17;
    ctx.beginPath(); ctx.moveTo(SLING.x, GROUND + 2); ctx.lineTo(FORK.x, FORK.y); ctx.stroke();
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(FORK.x, FORK.y); ctx.lineTo(TIP_L.x - 6, TIP_L.y - 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(FORK.x, FORK.y); ctx.lineTo(TIP_R.x + 6, TIP_R.y - 4); ctx.stroke();
    ctx.fillStyle = '#5f3f22';
    ctx.beginPath(); ctx.ellipse(SLING.x, GROUND + 3, 34, 9, 0, 0, 7); ctx.fill();
  }

  function drawSlingFront(aim) {
    ctx.strokeStyle = '#3a2415';
    ctx.lineCap = 'round';
    ctx.lineWidth = 9;
    var target = aim || { x: SLING.x - 8, y: SLING.y + 2 };
    ctx.beginPath(); ctx.moveTo(TIP_L.x, TIP_L.y); ctx.lineTo(target.x - 5, target.y + 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(TIP_R.x, TIP_R.y); ctx.lineTo(target.x + 5, target.y - 5); ctx.stroke();
  }

  function drawBlocks(st) {
    st.blocks.forEach(function (b) {
      var m = D.MAT[b.data.mat], w = b.data.w, h = b.data.h;
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.angle);
      var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, m.c1); g.addColorStop(1, m.c2);
      rr(-w / 2, -h / 2, w, h, Math.min(5, Math.min(w, h) / 3));
      ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = m.edge; ctx.stroke();

      var i;
      if (b.data.mat === 'wood') {
        ctx.strokeStyle = 'rgba(110,70,28,.45)';
        ctx.lineWidth = 1.4;
        var long = w > h;
        for (i = 1; i < 3; i++) {
          ctx.beginPath();
          if (long) { var yy = -h / 2 + h * i / 3; ctx.moveTo(-w / 2 + 6, yy); ctx.lineTo(w / 2 - 6, yy); }
          else { var xx = -w / 2 + w * i / 3; ctx.moveTo(xx, -h / 2 + 6); ctx.lineTo(xx, h / 2 - 6); }
          ctx.stroke();
        }
      } else if (b.data.mat === 'stone') {
        ctx.fillStyle = 'rgba(255,255,255,.16)';
        for (i = 0; i < 7; i++) {
          var px = ((i * 37) % Math.max(w - 10, 10)) - w / 2 + 5;
          var py = ((i * 61) % Math.max(h - 10, 10)) - h / 2 + 5;
          ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 7); ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.fillRect(-w / 2 + 4, -h / 2 + 4, Math.max(w * 0.22, 3), h - 8);
      }

      var dmg = 1 - b.data.hp / b.data.maxHp;
      if (dmg > 0.18) {
        ctx.strokeStyle = 'rgba(30,20,10,' + Math.min(.7, dmg) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, -h * 0.42); ctx.lineTo(-w * 0.05, -h * 0.05); ctx.lineTo(-w * 0.22, h * 0.3);
        ctx.moveTo(w * 0.3, -h * 0.3); ctx.lineTo(w * 0.06, h * 0.12);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawPigs(st) {
    st.pigs.forEach(function (p) {
      var r = 18;
      ctx.save();
      ctx.translate(p.pos.x, p.pos.y);
      ctx.rotate(p.angle * 0.35);
      ctx.fillStyle = '#7cc94b';
      ctx.strokeStyle = '#4f8f2c';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-r * 0.72, -r * 0.72, 4.6, 0, 7); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(r * 0.72, -r * 0.72, 4.6, 0, 7); ctx.fill(); ctx.stroke();

      var bg = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.2, 0, 0, r);
      bg.addColorStop(0, '#a6e86a');
      bg.addColorStop(1, '#63b83a');
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
      ctx.fillStyle = bg; ctx.fill(); ctx.stroke();

      var hurt = p.data.hp / p.data.maxHp < 0.55;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(-6.5, -4, 4.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(6.5, -4, 4.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#1c1c1c';
      ctx.beginPath(); ctx.arc(-6, hurt ? 0 : -4.6, 2.1, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(6, hurt ? 0 : -4.6, 2.1, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3d6b22';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(-11, -10); ctx.lineTo(-3, -7.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(11, -10); ctx.lineTo(3, -7.5); ctx.stroke();

      ctx.fillStyle = '#8ed860';
      ctx.strokeStyle = '#4f8f2c';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 5, 7.4, 5.4, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3d6b22';
      ctx.beginPath(); ctx.arc(-2.6, 5, 1.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(2.6, 5, 1.4, 0, 7); ctx.fill();
      ctx.restore();

      var hp = Math.max(0, p.data.hp / p.data.maxHp);
      if (hp < 1) {
        ctx.fillStyle = 'rgba(0,0,0,.42)';
        ctx.fillRect(p.pos.x - 16, p.pos.y - 32, 32, 4.5);
        ctx.fillStyle = hp > .5 ? '#6ee06e' : (hp > .25 ? '#f0c93a' : '#ef5d4d');
        ctx.fillRect(p.pos.x - 16, p.pos.y - 32, 32 * hp, 4.5);
      }
    });
  }

  function drawBirdShape(x, y, ang, kind, alpha) {
    var c = D.BIRDS[kind], r = c.r;
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(x, y);
    ctx.rotate(ang);

    ctx.fillStyle = c.line;
    ctx.beginPath();
    ctx.moveTo(-r * .85, -r * .5); ctx.lineTo(-r * 1.6, -r * .95); ctx.lineTo(-r * .8, -r * .05);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * .85, r * .5); ctx.lineTo(-r * 1.55, r * .95); ctx.lineTo(-r * .8, r * .05);
    ctx.closePath(); ctx.fill();

    var bg = ctx.createRadialGradient(-r * .3, -r * .35, r * .15, 0, 0, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(.28, c.body);
    bg.addColorStop(1, c.line);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7);
    ctx.fillStyle = bg; ctx.fill();

    ctx.beginPath(); ctx.ellipse(r * .08, r * .42, r * .6, r * .44, 0, 0, 7);
    ctx.fillStyle = c.belly; ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(r * .28, -r * .34, r * .3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .74, -r * .3, r * .24, 0, 7); ctx.fill();
    ctx.fillStyle = '#151515';
    ctx.beginPath(); ctx.arc(r * .36, -r * .34, r * .14, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(r * .78, -r * .3, r * .12, 0, 7); ctx.fill();

    ctx.strokeStyle = c.line;
    ctx.lineWidth = Math.max(1.6, r * .14);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * .02, -r * .66); ctx.lineTo(r * .5, -r * .5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * .5, -r * .62); ctx.lineTo(r * .92, -r * .46); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(r * .55, r * .02); ctx.lineTo(r * 1.42, r * .14); ctx.lineTo(r * .55, r * .34);
    ctx.closePath();
    ctx.fillStyle = kind === 'black' ? '#f0a92b' : '#ffa726';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawBirds(st) {
    for (var i = st.queue.length - 1; i >= 0; i--) {
      var q = st.queue[i], c = D.BIRDS[q.kind];
      drawBirdShape(112 - i * 44, GROUND - c.r + 2, 0, q.kind, .95);
    }
    st.eggs.forEach(function (e) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#c2c2c2';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(e.pos.x, e.pos.y, 8, 10, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.restore();
    });
    st.flying.forEach(function (b) {
      var ang = b.speed() < 80 ? b.angle
        : Math.atan2(b.vel.y, b.vel.x) * 0.35 + b.angle * 0.65;
      drawBirdShape(b.pos.x, b.pos.y, ang, b.data.kind, b.data.alpha);
    });
    if (st.loaded) {
      if (st.phase === 'flying') {
        drawBirdShape(SLING.x - 2, SLING.y, -0.25, st.loaded.kind, .5);
      } else {
        var x = st.dragging ? st.drag.x : SLING.x - 2;
        var y = st.dragging ? st.drag.y : SLING.y;
        var a = st.dragging ? Math.atan2(SLING.y - y, SLING.x - x) : -0.25;
        drawBirdShape(x, y, a, st.loaded.kind, 1);
      }
    }
  }

  function drawAim(st) {
    if (!st.dragging || !st.loaded) return;
    var v = {
      x: (SLING.x - st.drag.x) * CFG.K_PULL * st.eff.power,
      y: (SLING.y - st.drag.y) * CFG.K_PULL * st.eff.power
    };
    var p = { x: st.drag.x, y: st.drag.y }, dt = 1 / 60;
    var steps = st.eff.aim ? 120 : 32;
    for (var i = 0; i < steps; i++) {
      v.y += 1900 * dt;
      p.x += v.x * dt;
      p.y += v.y * dt;
      if (p.y > GROUND || p.x > W + 40) break;
      if (i % 3 === 0) {
        var a = (1 - i / steps) * (st.eff.aim ? 1 : .85);
        var rr2 = st.eff.aim ? 5 : 4;
        ctx.globalAlpha = a * .45;
        ctx.fillStyle = '#1b2a3a';
        ctx.beginPath(); ctx.arc(p.x, p.y, rr2 + 2.5, 0, 7); ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = st.eff.aim ? '#8fe1ff' : '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y, rr2, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawParts(st, dt) {
    for (var i = st.parts.length - 1; i >= 0; i--) {
      var p = st.parts[i];
      p.life += dt;
      if (p.life >= p.max) { st.parts.splice(i, 1); continue; }
      p.vy += 1350 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > GROUND) { p.y = GROUND; p.vy *= -0.32; p.vx *= 0.7; }
      var a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.life * 7);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    for (var k = st.rings.length - 1; k >= 0; k--) {
      var rg = st.rings[k];
      rg.t += dt;
      if (rg.t > .45) { st.rings.splice(k, 1); continue; }
      var aa = 1 - rg.t / .45;
      ctx.globalAlpha = aa * .75;
      ctx.strokeStyle = rg.c;
      ctx.lineWidth = 7 * aa;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r * (.35 + rg.t / .45 * .9), 0, 7); ctx.stroke();
    }
    for (var f = st.floats.length - 1; f >= 0; f--) {
      var ft = st.floats[f];
      ft.t += dt;
      if (ft.t > 1.3) { st.floats.splice(f, 1); continue; }
      ctx.globalAlpha = 1 - ft.t / 1.3;
      ctx.font = 'bold 22px system-ui,"Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(ft.txt, ft.x, ft.y - ft.t * 46);
      ctx.fillStyle = ft.c;
      ctx.fillText(ft.txt, ft.x, ft.y - ft.t * 46);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawTargeting(st) {
    if (st.phase !== 'targeting') return;
    ctx.fillStyle = 'rgba(255,90,90,.13)';
    ctx.fillRect(0, 0, W, H);
    ctx.setLineDash([9, 7]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff6b6b';
    st.blocks.forEach(function (b) {
      if (b === st.hoverBlock) return;
      ctx.globalAlpha = .5;
      ctx.beginPath();
      ctx.moveTo(b.wverts[0].x, b.wverts[0].y);
      for (var i = 1; i < b.wverts.length; i++) ctx.lineTo(b.wverts[i].x, b.wverts[i].y);
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    if (st.hoverBlock) {
      ctx.strokeStyle = '#ffd865';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(st.hoverBlock.wverts[0].x, st.hoverBlock.wverts[0].y);
      for (var j = 1; j < st.hoverBlock.wverts.length; j++) {
        ctx.lineTo(st.hoverBlock.wverts[j].x, st.hoverBlock.wverts[j].y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = 'bold 15px system-ui,"Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffd865';
      ctx.textAlign = 'center';
      ctx.fillText('点击摧毁', st.hoverBlock.pos.x, st.hoverBlock.pos.y - st.hoverBlock.data.h / 2 - 14);
      ctx.textAlign = 'left';
    }
    ctx.setLineDash([]);
  }

  function banner(txt, color, y) {
    ctx.font = '600 15px system-ui,"Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    var w = ctx.measureText(txt).width + 36;
    ctx.fillStyle = 'rgba(0,0,0,.42)';
    rr(W / 2 - w / 2, y, w, 32, 9);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(txt, W / 2, y + 21);
    ctx.textAlign = 'left';
  }

  function render(st, dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);

    drawBG();
    drawSlingBack();
    drawBlocks(st);
    drawPigs(st);
    drawAim(st);
    drawBirds(st);
    drawGround();
    drawSlingFront(st.dragging ? st.drag : null);
    drawParts(st, dt);
    drawTargeting(st);
    ctx.restore();

    /* 弹窗打开时不再绘制画布内提示 */
    if (!overlayOpen()) {
      if (st.phase === 'ready' && st.loaded && !st.dragging) {
        banner('按住小鸟向后拖拽 → 松手发射', '#ffffff', GROUND - 268);
      } else if (st.phase === 'flying') {
        banner('点击任意位置触发小鸟技能', '#ffe27a', 16);
      } else if (st.phase === 'targeting') {
        banner('选择一个建筑摧毁（Esc 取消）', '#ff9c9c', 16);
      } else if (st.phase === 'ready' && !st.loaded && st.queue.length === 0) {
        banner('弹射架空了 —— 出一张鸟牌，或结束回合', '#cfe4ff', 16);
      }
    }
  }

  /* ---------------- 主循环 ---------------- */
  function tick(t) {
    raf = requestAnimationFrame(tick);
    if (!lastT) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    T += dt;
    if (!G) return;
    st = G;

    var scale = st.phase === 'flying' ? st.timeScale : 1;
    st.world.step(dt * scale);

    applyImpacts(st);

    /* 黑鸟自动引信 / 飞行计时 */
    st.flying.forEach(function (b) {
      if (!b.alive) return;
      /* 飞出场景的小鸟直接回收，否则会一直等超时 */
      if (b.pos.x < -160 || b.pos.x > W + 420 || b.pos.y > H + 420) {
        st.world.remove(b);
        return;
      }
      if (b.data.kind === 'black' && !b.data.used && b.impactSpeed > 210) b.data.fuse = 0.22;
      if (b.data.fuse > 0) {
        b.data.fuse -= dt;
        if (b.data.fuse <= 0 && b.alive) {
          b.data.used = true;
          explode(st, b.pos.x, b.pos.y, 172, 2.15);
          st.world.remove(b);
        }
      }
    });
    st.flying = st.flying.filter(function (b) { return b.alive; });

    for (var e = st.eggs.length - 1; e >= 0; e--) {
      var egg = st.eggs[e];
      if (!egg.alive) { st.eggs.splice(e, 1); continue; }
      egg.data.fuse -= dt;
      if (egg.data.fuse <= 0 || egg.impactSpeed > 150) {
        explode(st, egg.pos.x, egg.pos.y, 136, 1.4);
        st.world.remove(egg);
        st.eggs.splice(e, 1);
      }
    }

    if (st.phase === 'flying') {
      st.flightT += dt * st.timeScale;
      if (st.flightT > 0.8 && (settled(st) || st.flightT > 5)) endShot(st);
    } else {
      /* 落地小鸟淡出 */
      st.flying.forEach(function (b) {
        if (b.speed() < 30) b.data.landed += dt;
        else b.data.landed = 0;
        if (b.data.landed > 1.2) b.data.alpha -= dt * 2.2;
      });
      st.flying.forEach(function (b) { if (b.data.alpha <= 0 && b.alive) st.world.remove(b); });
      st.flying = st.flying.filter(function (b) { return b.alive; });
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 70);
    if (uiDirty) { uiDirty = false; syncUI(); }
    render(st, dt);
  }

  /* ---------------- 输入 ---------------- */
  function toWorld(ev) {
    var r = cv.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (W / r.width),
      y: (ev.clientY - r.top) * (H / r.height)
    };
  }

  function moveDrag(st, p) {
    var dx = p.x - SLING.x, dy = p.y - SLING.y;
    var len = Math.hypot(dx, dy);
    var mx = CFG.PULL_MAX * (st.eff.power > 1 ? 1.1 : 1);
    if (len > mx) { dx = dx / len * mx; dy = dy / len * mx; }
    st.drag = { x: SLING.x + dx, y: SLING.y + dy };
  }

  cv.addEventListener('pointerdown', function (ev) {
    if (!G) return;
    var p = toWorld(ev), s = G;
    ev.preventDefault();

    if (s.phase === 'over') return;

    if (s.phase === 'targeting') {
      for (var i = 0; i < s.blocks.length; i++) {
        if (s.blocks[i].contains(p)) {
          hurtBlock(s, s.blocks[i], 999999);
          shake = Math.max(shake, 14);
          sfx('boom');
          s.phase = 'ready';
          checkWin(s);
          syncUI();
          return;
        }
      }
      s.phase = 'ready';
      if (s.discard.length) s.hand.push(s.discard.pop());   // 取消则退回手牌
      syncUI();
      return;
    }

    if (s.phase === 'flying') { useAbility(s); return; }
    if (s.phase !== 'ready' || !s.loaded) return;
    if (Math.hypot(p.x - SLING.x, p.y - SLING.y) < 175) {
      s.dragging = true;
      moveDrag(s, p);
      try { if (cv.setPointerCapture) cv.setPointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
    }
  });

  cv.addEventListener('pointermove', function (ev) {
    if (!G) return;
    var p = toWorld(ev), s = G;
    if (s.dragging) { moveDrag(s, p); return; }
    if (s.phase === 'targeting') {
      s.hoverBlock = null;
      for (var i = 0; i < s.blocks.length; i++) {
        if (s.blocks[i].contains(p)) { s.hoverBlock = s.blocks[i]; break; }
      }
    }
  });

  cv.addEventListener('pointerup', function (ev) {
    if (!G || !G.dragging) return;
    var s = G;
    s.dragging = false;
    var dx = SLING.x - s.drag.x, dy = SLING.y - s.drag.y;
    if (Math.hypot(dx, dy) < 20) return;   // 拉得太短：取消
    launch(s, { x: dx * CFG.K_PULL * s.eff.power, y: dy * CFG.K_PULL * s.eff.power });
    syncUI();
  });

  cv.addEventListener('pointercancel', function () { if (G) G.dragging = false; });

  window.addEventListener('keydown', function (ev) {
    if (!G) return;
    if (ev.key === 'Escape' && G.phase === 'targeting') {
      G.phase = 'ready';
      if (G.discard.length) G.hand.push(G.discard.pop());
      syncUI();
    }
    if (ev.key === ' ' && G.phase === 'ready') {
      ev.preventDefault();
      endTurn(G);
    }
  });

  /* ---------------- UI ---------------- */
  function syncUI() {
    var s = G;
    if (!s) return;
    $('pLevel').textContent = '关卡 ' + (s.li + 1) + ' · ' + s.lv.nm;
    $('pRound').textContent = '回合 ' + Math.min(s.round, s.lv.rounds) + '/' + s.lv.rounds;
    $('pPig').textContent = '🐷 ' + s.pigs.length + '/' + s.pigsTotal;
    $('pScore').textContent = '⭐ ' + s.score;
    $('deckInfo').textContent = '牌堆 ' + s.deck.length + ' · 弃牌 ' + s.discard.length;
    $('bEnd').disabled = (s.phase !== 'ready');

    var html = '';
    for (var i = 0; i < s.maxEnergy; i++) {
      html += '<div class="pip' + (i < s.energy ? ' on' : '') + '"></div>';
    }
    pipsEl.innerHTML = html;

    handEl.innerHTML = '';
    s.hand.forEach(function (id, idx) {
      var c = D.LIB[id];
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'card ' + (c.k === 'bird' ? 'bird' : 'tactic') +
        ((s.energy < c.cost || s.phase === 'over' || s.phase === 'flying' || s.phase === 'targeting') ? ' dis' : '');
      el.innerHTML = '<div class="cost">' + c.cost + '</div>' +
        '<div class="ico">' + c.ico + '</div>' +
        '<div class="nm">' + c.nm + '</div>' +
        '<div class="ds">' + c.ds + '</div>';
      el.addEventListener('click', function () { playCard(s, idx); });
      handEl.appendChild(el);
    });
  }

  function showOv(html) { ov.className = 'on'; ov.innerHTML = '<div class="panel">' + html + '</div>'; }
  function hideOv() { ov.className = ''; ov.innerHTML = ''; }

  function starText(n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += (i < n ? '★' : '☆');
    return s;
  }

  function winOverlay(s, bonus) {
    var next = (s.li + 1 < D.LEVELS.length)
      ? '<button class="big" data-a="next">下一关 →</button>' : '';
    showOv('<h1>关卡通关！</h1>' +
      '<div class="stars">' + starText(s.stars) + '</div>' +
      '<p style="text-align:center;font-size:16px;color:#e9f0f8">得分 <b style="color:#ffd865">' +
      s.score + '</b>　（剩余回合奖励 +' + bonus + '）</p>' +
      '<p style="text-align:center;color:#93a8bf;font-size:13px">用了 ' + (s.round) +
      ' 回合 · 三星标准 ≤ ' + s.lv.par + ' 回合</p>' +
      '<div style="margin-top:14px">' + next +
      '<button class="big alt" data-a="retry">重玩本关</button>' +
      '<button class="big alt" data-a="menu">关卡选择</button></div>');
    sfx('win');
  }

  function loseOverlay(s) {
    showOv('<h1>回合耗尽…</h1>' +
      '<p style="text-align:center">还剩 <b style="color:#ff8a7a">' + s.pigs.length +
      '</b> 只猪没解决。多试试「冰霜诅咒 + 狂暴药剂」的叠 buff 打法，' +
      '或者先用鸟打断支柱让建筑自己塌。</p>' +
      '<div style="margin-top:14px"><button class="big" data-a="retry">再来一次</button>' +
      '<button class="big alt" data-a="menu">关卡选择</button></div>');
  }

  function menuOverlay() {
    var cards = D.LEVELS.map(function (l, i) {
      return '<button class="lvc" data-a="lv" data-i="' + i + '">' +
        '<div class="n">第 ' + (i + 1) + ' 关</div>' +
        '<div class="d">' + l.nm + '</div>' +
        '<div class="d" style="margin-top:8px">限 ' + l.rounds + ' 回合 · 🐷 ×' + l.pigs.length + '</div>' +
        '</button>';
    }).join('');
    showOv('<h1>🐦 怒鸟战术</h1>' +
      '<p style="text-align:center;color:#93a8bf;margin-bottom:4px">卡牌策略 × 弹射物理</p>' +
      '<div class="lv">' + cards + '</div>' +
      '<div style="margin-top:18px"><button class="big" data-a="lv" data-i="0">开始第一关</button>' +
      '<button class="big alt" data-a="help">玩法说明</button></div>');
  }

  function helpOverlay() {
    showOv('<h2>玩法说明</h2><div class="rules">' +
      '<p><b>1 · 出牌</b>　每回合你有 <span class="kt">⚡能量</span>。' +
      '鸟牌把小鸟送上弹射架，策略牌立刻生效。</p>' +
      '<p><b>2 · 弹射</b>　按住弹射架上的小鸟向后拖，虚线是弹道预测，松手发射。</p>' +
      '<p><b>3 · 空中技能</b>　小鸟飞行时<b>点击屏幕任意位置</b>触发技能：' +
      '红鸟怒吼冲击波 · 蓝鸟分裂三只 · 黄鸟冲刺加速 · 黑鸟引爆 · 白鸟下蛋轰炸 · 绿鸟回旋。</p>' +
      '<p><b>4 · 物理与伤害</b>　撞得越快、质量越大伤害越高。木板脆、冰块一碰就碎、石头极硬。' +
      '打断支柱让建筑塌下来砸猪，往往比硬砸更划算。猪要够重的冲击才会掉血。</p>' +
      '<p><b>5 · 回合</b>　点「结束回合」→ <b>+2 能量</b>并抽 2 张牌，但总回合数有限。' +
      '回合耗尽还有猪没消灭就失败。</p>' +
      '<p><b>6 · 叠 buff</b>　「冰霜诅咒」让建筑变脆、「狂暴药剂」加撞击伤害，' +
      '先加 buff 再发射黑鸟，能一击拆塔。</p>' +
      '</div><div style="margin-top:16px"><button class="big" data-a="close">知道了</button></div>');
  }

  ov.addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('[data-a]') : null;
    if (!t) return;
    var a = t.getAttribute('data-a');
    if (a === 'lv') { hideOv(); startLevel(parseInt(t.getAttribute('data-i'), 10), 0); }
    else if (a === 'next') { hideOv(); startLevel(G.li + 1, G.score); }
    else if (a === 'retry') { hideOv(); startLevel(G.li, 0); }
    else if (a === 'menu') { menuOverlay(); }
    else if (a === 'help') { helpOverlay(); }
    else if (a === 'close') { hideOv(); }
  });

  $('bHelp').addEventListener('click', helpOverlay);
  $('bRestart').addEventListener('click', function () { hideOv(); startLevel(G.li, 0); });
  $('bEnd').addEventListener('click', function () {
    if (!G || G.phase !== 'ready') return;
    endTurn(G);
    if (G.phase !== 'over') syncUI();
  });

  /* ---------------- 音效（WebAudio 合成，无素材） ---------------- */
  var AC = null;
  var SFX = {
    launch: { f: 180, f2: 420, t: .16, ty: 'sine', v: .16 },
    card: { f: 640, f2: 880, t: .06, ty: 'triangle', v: .08 },
    crack: { f: 220, f2: 90, t: .14, ty: 'square', v: .09 },
    pig: { f: 520, f2: 900, t: .10, ty: 'sawtooth', v: .12 },
    boom: { f: 120, f2: 38, t: .30, ty: 'sawtooth', v: .20 },
    dash: { f: 400, f2: 1400, t: .14, ty: 'sine', v: .12 },
    split: { f: 800, f2: 520, t: .12, ty: 'triangle', v: .11 },
    win: { f: 520, f2: 1180, t: .45, ty: 'triangle', v: .15 }
  };
  function sfx(type) {
    var c = SFX[type];
    if (!c) return;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var o = AC.createOscillator(), g = AC.createGain(), n = AC.currentTime;
      o.type = c.ty;
      o.frequency.setValueAtTime(c.f, n);
      o.frequency.exponentialRampToValueAtTime(Math.max(c.f2, 1), n + c.t);
      g.gain.setValueAtTime(c.v, n);
      g.gain.exponentialRampToValueAtTime(0.0001, n + c.t);
      o.connect(g); g.connect(AC.destination);
      o.start(n); o.stop(n + c.t + 0.02);
    } catch (err) { /* 静默失败 */ }
  }

  /* ---------------- 启动 ---------------- */
  /* 按 16:9 精确适配画布尺寸（用 CSS 的 max-height 会压扁画面） */
  function fitCanvas() {
    var stage = document.getElementById('stage');
    if (!stage) return;
    var aw = stage.clientWidth - 16;
    var ah = stage.clientHeight - 16;
    if (aw <= 0 || ah <= 0) return;
    var s = Math.min(aw / W, ah / H);
    cv.style.width = Math.round(W * s) + 'px';
    cv.style.height = Math.round(H * s) + 'px';
  }
  window.addEventListener('resize', fitCanvas);
  if (window.addEventListener) window.addEventListener('orientationchange', fitCanvas);

  function startLevel(idx, score) {
    G = newState(idx, score);
    st = G;
    buildDeck(G);
    hideOv();
    syncUI();
    fitCanvas();
  }

  /* 菜单背景：先摆一个静态关卡当背景 */
  st = newState(0, 0);
  G = st;
  buildDeck(G);
  syncUI();
  fitCanvas();
  render(st, 0);
  menuOverlay();
  raf = requestAnimationFrame(tick);

  /* 暴露给自动化测试 */
  window.__AB__ = {
    get state() { return G; },
    startLevel: startLevel,
    playCard: function (i) { playCard(G, i); },
    endTurn: function () { endTurn(G); },
    launchTest: function (vx, vy) {
      if (!G.loaded) { queueBird(G, 'red'); }
      G.drag = { x: SLING.x, y: SLING.y };
      launch(G, { x: vx, y: vy });
      syncUI();
    },
    ability: function () { useAbility(G); },
    fit: fitCanvas,
    step: function (dt) { G.world.step(dt); applyImpacts(G); }
  };
})();
