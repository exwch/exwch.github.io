/* ============================================================
   渲染：天空/视差背景、图块、角色像素画、HUD、覆盖界面
   ============================================================ */
const Render = (() => {

  const THEMES = {
    day: {
      skyTop: '#5fb8f5', skyBottom: '#c9ecff',
      sun: '#fff6c9', sunGlow: 'rgba(255,246,201,.35)',
      hillFar: '#8fd48a', hillNear: '#57b661', hillEdge: '#3f9d4d',
      cloud: 'rgba(255,255,255,.92)',
      grass: '#5fc35c', grassDark: '#3f9d4d', dirt: '#b0703c', dirtDark: '#8a5527',
      brick: '#c8622f', brickDark: '#8f4320', brickLine: '#e9995f',
      stone: '#9aa3c7', stoneDark: '#6e7799',
      wood: '#b5793f', woodDark: '#8a5726',
      fog: 'rgba(255,255,255,0)',
    },
    night: {
      skyTop: '#160f36', skyBottom: '#3b2160',
      sun: '#ffe9a8', sunGlow: 'rgba(255,233,168,.18)',
      hillFar: '#2c2358', hillNear: '#201a44', hillEdge: '#171233',
      cloud: 'rgba(180,170,255,.18)',
      grass: '#6a63a8', grassDark: '#463f7d', dirt: '#3a3466', dirtDark: '#282350',
      brick: '#7d4a8c', brickDark: '#542f63', brickLine: '#a06cb0',
      stone: '#6f6aa8', stoneDark: '#4b4780',
      wood: '#7a5a9c', woodDark: '#513a70',
      fog: 'rgba(30,10,60,.18)',
    },
  };

  const theme = (game) => THEMES[game.level ? game.level.theme : 'day'] || THEMES.day;

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function heart(ctx, x, y, s, color, filled) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y + s * 0.92);
    ctx.bezierCurveTo(x - s * 0.18, y + s * 0.44, x + s * 0.02, y - s * 0.16, x + s / 2, y + s * 0.26);
    ctx.bezierCurveTo(x + s * 0.98, y - s * 0.16, x + s * 1.18, y + s * 0.44, x + s / 2, y + s * 0.92);
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.stroke();
    } else {
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ============================ 背景 ============================ */
  function drawBackground(game, ctx) {
    const th = theme(game);
    const W = CONFIG.VIEW_W;
    const H = CONFIG.VIEW_H;
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, th.skyTop);
    grd.addColorStop(1, th.skyBottom);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    const cam = game.camera;

    // 太阳 / 月亮
    const sunX = W * 0.78 - cam.x * 0.03;
    const sunY = H * 0.18 - cam.y * 0.05;
    ctx.fillStyle = th.sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, Math.PI * 2);
    ctx.fill();
    if (game.level && game.level.theme === 'night') {
      ctx.fillStyle = th.skyTop;
      ctx.beginPath();
      ctx.arc(sunX + 16, sunY - 8, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // 星星（夜晚）
    if (game.level && game.level.theme === 'night') {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      const seed = 1337;
      for (let i = 0; i < 70; i++) {
        const sx = ((i * 137 + seed) % W) - (cam.x * 0.04) % W;
        const sy = (i * 53) % Math.floor(H * 0.62);
        const tw = 0.5 + 0.5 * Math.sin(game.time * 2 + i);
        ctx.globalAlpha = 0.35 + tw * 0.55;
        ctx.fillRect(((sx % W) + W) % W, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    // 云
    drawClouds(ctx, game, th);
    // 远山 / 近山
    drawHills(ctx, game, th.hillFar, 0.25, H * 0.62, 210, 96, cam);
    drawHills(ctx, game, th.hillNear, 0.45, H * 0.72, 260, 130, cam);
  }

  function drawClouds(ctx, game, th) {
    const cam = game.camera;
    const W = CONFIG.VIEW_W;
    const offset = -(cam.x * 0.12) % 640;
    ctx.fillStyle = th.cloud;
    for (let i = 0; i < 6; i++) {
      const bx = offset + i * 640 + (i % 2) * 180;
      const by = 60 + ((i * 97) % 130) - cam.y * 0.06;
      puffyCloud(ctx, bx, by, 1 + (i % 3) * 0.16);
      puffyCloud(ctx, bx + W * 1.4, by, 1 + ((i + 1) % 3) * 0.14);
    }
  }

  function puffyCloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 46 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 40 * s, y + 6 * s, 34 * s, 17 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 40 * s, y + 8 * s, 30 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 6 * s, y - 14 * s, 30 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills(ctx, game, color, factor, baseY, spacing, height, cam) {
    const W = CONFIG.VIEW_W;
    const offset = -(cam.x * factor) % spacing;
    const y = baseY - cam.y * factor * 0.5;
    ctx.fillStyle = color;
    for (let i = -1; i < Math.ceil(W / spacing) + 2; i++) {
      const x = offset + i * spacing;
      ctx.beginPath();
      ctx.moveTo(x - spacing * 0.75, y + height);
      ctx.quadraticCurveTo(x, y - height * 0.35, x + spacing * 0.75, y + height);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ============================ 图块 ============================ */
  function drawTiles(game, ctx) {
    const th = theme(game);
    const lvl = game.level;
    const t = CONFIG.TILE;
    const cam = game.camera;
    const viewW = CONFIG.VIEW_W / cam.scale;
    const viewH = CONFIG.VIEW_H / cam.scale;
    const x0 = Math.max(0, Math.floor(cam.x / t) - 1);
    const x1 = Math.min(lvl.width - 1, Math.ceil((cam.x + viewW) / t) + 1);
    const y0 = Math.max(0, Math.floor(cam.y / t) - 1);
    const y1 = Math.min(lvl.height - 1, Math.ceil((cam.y + viewH) / t) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = lvl.grid[ty][tx];
        if (ch === '.') continue;
        const x = tx * t;
        const y = ty * t;
        switch (ch) {
          case '#': drawGroundTile(ctx, game, th, x, y, tx, ty); break;
          case 'B': drawBrick(ctx, th, x, y); break;
          case '?': drawQuestion(ctx, th, x, y, game.time); break;
          case 'X': drawUsedBlock(ctx, th, x, y); break;
          case '=': drawPlatform(ctx, th, x, y); break;
          case 'C': drawCoin(ctx, x, y, game.time); break;
          case 'S': drawSpring(ctx, x, y); break;
          case '^': drawSpike(ctx, th, x, y); break;
          case '~': drawLava(ctx, x, y, game.time); break;
          case 'F': drawFlag(ctx, lvl, tx, ty, x, y, game.time); break;
          default: break;
        }
      }
    }
  }

  function drawGroundTile(ctx, game, th, x, y, tx, ty) {
    const t = CONFIG.TILE;
    const lvl = game.level;
    const above = ty > 0 ? lvl.grid[ty - 1][tx] : '.';
    const exposedTop = !SOLID_CHARS.has(above);
    ctx.fillStyle = th.dirt;
    ctx.fillRect(x, y, t, t);
    ctx.fillStyle = th.dirtDark;
    ctx.fillRect(x, y + t - 5, t, 5);
    ctx.fillRect(x + t - 5, y, 5, t);
    // 纹理
    ctx.fillStyle = 'rgba(0,0,0,.10)';
    ctx.fillRect(x + 6, y + 12, 8, 4);
    ctx.fillRect(x + 18, y + 6, 7, 4);
    if (exposedTop) {
      ctx.fillStyle = th.grass;
      ctx.fillRect(x, y, t, 9);
      ctx.fillStyle = th.grassDark;
      ctx.fillRect(x, y + 7, t, 3);
      ctx.fillStyle = th.grass;
      ctx.fillRect(x + 3, y - 3, 5, 5);
      ctx.fillRect(x + 14, y - 4, 5, 6);
      ctx.fillRect(x + 24, y - 3, 5, 5);
    }
  }

  function drawBrick(ctx, th, x, y) {
    const t = CONFIG.TILE;
    ctx.fillStyle = th.brickDark;
    ctx.fillRect(x, y, t, t);
    ctx.fillStyle = th.brick;
    ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
    ctx.fillStyle = th.brickLine;
    ctx.fillRect(x + 1, y + 1, t - 2, 3);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    for (let r = 0; r < 4; r++) ctx.fillRect(x + 1, y + 8 + r * 6, t - 2, 1.5);
    ctx.fillRect(x + 15, y + 2, 2, 6);
    ctx.fillRect(x + 7, y + 9, 2, 6);
    ctx.fillRect(x + 23, y + 9, 2, 6);
    ctx.fillRect(x + 15, y + 22, 2, 6);
  }

  function drawQuestion(ctx, th, x, y, time) {
    const t = CONFIG.TILE;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    ctx.fillStyle = '#a9761a';
    ctx.fillRect(x, y, t, t);
    ctx.fillStyle = '#f2b02c';
    ctx.fillRect(x + 1, y + 1, t - 2, t - 2);
    ctx.fillStyle = `rgba(255,255,255,${0.14 + pulse * 0.16})`;
    ctx.fillRect(x + 3, y + 3, t - 6, t - 6);
    ctx.fillStyle = '#7d5108';
    [[3, 3], [t - 6, 3], [3, t - 6], [t - 6, t - 6]].forEach(([dx, dy]) => ctx.fillRect(x + dx, y + dy, 3, 3));
    ctx.fillStyle = '#5a3a05';
    ctx.font = 'bold 20px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + t / 2, y + t / 2 + 1);
  }

  function drawUsedBlock(ctx, th, x, y) {
    const t = CONFIG.TILE;
    ctx.fillStyle = '#6b5a45';
    ctx.fillRect(x, y, t, t);
    ctx.fillStyle = '#8b775c';
    ctx.fillRect(x + 2, y + 2, t - 4, t - 4);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(x + 5, y + 5, t - 10, t - 10);
  }

  function drawPlatform(ctx, th, x, y) {
    const t = CONFIG.TILE;
    ctx.fillStyle = th.woodDark;
    ctx.fillRect(x, y, t, 12);
    ctx.fillStyle = th.wood;
    ctx.fillRect(x, y, t, 8);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(x, y, t, 2);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(x + 14, y + 2, 2, 6);
  }

  function drawCoin(ctx, x, y, time) {
    const t = CONFIG.TILE;
    const cx = x + t / 2;
    const cy = y + t / 2 + Math.sin(time * 3 + x * 0.1) * 2;
    const phase = Math.abs(Math.cos(time * 4 + x * 0.15));
    const w = 4 + phase * 7;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#b6811a';
    ctx.beginPath();
    ctx.ellipse(0, 0, w + 1.5, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd93b';
    ctx.beginPath();
    ctx.ellipse(0, 0, w, 9.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.3, -3, Math.max(0.8, w * 0.26), 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSpring(ctx, x, y) {
    const t = CONFIG.TILE;
    ctx.fillStyle = '#4a4f6b';
    ctx.fillRect(x + 3, y + t - 6, t - 6, 6);
    ctx.fillStyle = '#c9d1e8';
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 5, y + t - 10 - i * 5, t - 10, 3);
    ctx.fillStyle = '#ff5a5f';
    ctx.fillRect(x + 1, y + t - 26, t - 2, 7);
    ctx.fillStyle = '#ff9aa0';
    ctx.fillRect(x + 1, y + t - 26, t - 2, 2);
  }

  function drawSpike(ctx, th, x, y) {
    const t = CONFIG.TILE;
    ctx.fillStyle = '#4b4f6d';
    ctx.fillRect(x, y + t - 6, t, 6);
    ctx.fillStyle = '#c9d1e8';
    for (let i = 0; i < 3; i++) {
      const sx = x + i * (t / 3);
      ctx.beginPath();
      ctx.moveTo(sx + 1, y + t - 5);
      ctx.lineTo(sx + t / 6, y + 3);
      ctx.lineTo(sx + t / 3 - 1, y + t - 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(x + 4, y + 8, 2, 12);
  }

  function drawLava(ctx, x, y, time) {
    const t = CONFIG.TILE;
    const wave = Math.sin(time * 3 + x * 0.08) * 2.5;
    ctx.fillStyle = '#8b1d0c';
    ctx.fillRect(x, y - 6, t, t + 6);
    ctx.fillStyle = '#e8471d';
    ctx.fillRect(x, y - 4 + wave, t, t + 4);
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(x, y - 2 + wave, t, 5);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.fillRect(x + 4, y + wave, 10, 2);
  }

  function drawFlag(ctx, lvl, tx, ty, x, y, time) {
    const t = CONFIG.TILE;
    const isTop = ty === 0 || lvl.grid[ty - 1][tx] !== 'F';
    ctx.fillStyle = '#c9d1e8';
    ctx.fillRect(x + t / 2 - 2, y, 4, t);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.fillRect(x + t / 2 + 1, y, 1, t);
    if (isTop) {
      ctx.fillStyle = '#ffd93b';
      ctx.beginPath();
      ctx.arc(x + t / 2, y + 4, 6, 0, Math.PI * 2);
      ctx.fill();
      const flap = Math.sin(time * 3) * 3;
      ctx.fillStyle = '#ff5a5f';
      ctx.beginPath();
      ctx.moveTo(x + t / 2 + 2, y + 10);
      ctx.lineTo(x + t / 2 + 30 + flap, y + 20);
      ctx.lineTo(x + t / 2 + 2, y + 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath();
      ctx.moveTo(x + t / 2 + 2, y + 12);
      ctx.lineTo(x + t / 2 + 24 + flap, y + 20);
      ctx.lineTo(x + t / 2 + 2, y + 22);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ============================ 角色 ============================ */
  function drawPlayer(ctx, p, game) {
    const S = 2;
    const pal = p.palette;
    const ox = Math.round(p.x + p.w / 2 - 16 + (1 - p.squash) * 0);
    const oy = Math.round(p.y + p.h - 32);
    const f = p.facing;
    const t = p.animTime;

    // 冲刺拖影
    p.trail.forEach((tr) => {
      const a = (tr.life / tr.max) * 0.35;
      ctx.globalAlpha = a;
      ctx.fillStyle = tr.flying ? '#bde9ff' : pal.accent;
      ctx.fillRect(Math.round(tr.x + p.w / 2 - 16), Math.round(tr.y + p.h - 32), 32, 32);
    });
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.globalAlpha = p.spriteAlpha;
    const midX = ox + 16;
    const midYWorld = oy + 32;
    ctx.translate(midX, midYWorld);
    ctx.scale(p.squash, p.stretch);
    ctx.translate(-midX, -midYWorld);

    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath();
    ctx.ellipse(ox + 16, oy + 32, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 飞行翅膀
    if (p.flying) {
      const flap = Math.sin(t * 26) * 4;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.beginPath();
      ctx.moveTo(ox + 16, oy + 14);
      ctx.lineTo(ox + 16 - 20, oy + 6 + flap);
      ctx.lineTo(ox + 16 - 6, oy + 22);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(ox + 16, oy + 14);
      ctx.lineTo(ox + 16 + 20, oy + 6 + flap);
      ctx.lineTo(ox + 16 + 6, oy + 22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,200,255,.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const px = (gx, gy, gw, gh, color) => {
      const x = f > 0 ? ox + gx * S : ox + (16 - gx - gw) * S;
      ctx.fillStyle = color;
      ctx.fillRect(x, oy + gy * S, gw * S, gh * S);
    };

    const running = p.onGround && Math.abs(p.vx) > 12;
    const frame = Math.floor(p.walkPhase) % 4;
    const airborne = !p.onGround;
    const dashing = p.dashTimer > 0;

    // ---- 帽子 ----
    px(4, 0, 8, 2, pal.cap);
    px(3, 1, 10, 2, pal.cap);
    px(3, 3, 10, 2, pal.cap);
    if (f > 0) px(11, 3, 4, 2, pal.capDark); else px(1, 3, 4, 2, pal.capDark);
    px(4, 0, 6, 1, 'rgba(255,255,255,.25)');

    // ---- 脸 ----
    px(5, 5, 8, 5, pal.skin);
    px(4, 5, 2, 5, pal.hair);
    px(6, 6, 2, 2, '#2a1a0c');          // 眼睛
    if (airborne || dashing) px(5, 5, 4, 1, pal.skinDark);
    px(6, 9, 7, 2, '#5a3417');          // 胡子
    px(12, 8, 2, 2, pal.skinDark);      // 鼻子

    // ---- 身体 ----
    px(3, 10, 10, 4, pal.shirt);
    px(3, 10, 10, 1, 'rgba(255,255,255,.18)');
    px(5, 12, 6, 3, pal.pants);
    px(5, 13, 6, 1, pal.pantsDark);
    px(5, 12, 1, 3, '#ffd93b');         // 纽扣
    px(10, 12, 1, 3, '#ffd93b');
    // 手臂
    if (airborne || p.flying) {
      px(1, 9, 3, 3, pal.shirt);
      px(0, 8, 2, 2, pal.skin);
    } else if (running) {
      px(frame < 2 ? 2 : 12, 10, 3, 3, pal.shirt);
      px(frame < 2 ? 1 : 13, 11, 2, 2, pal.skin);
    } else {
      px(1, 10, 2, 4, pal.shirt);
      px(0, 11, 2, 2, pal.skin);
    }

    // ---- 腿脚 ----
    if (dashing) {
      px(4, 15, 9, 4, pal.pantsDark);
      px(1, 17, 5, 3, pal.shoe);
    } else if (airborne || p.flying) {
      px(4, 15, 4, 4, pal.pants);
      px(9, 16, 4, 3, pal.pantsDark);
      px(3, 18, 5, 3, pal.shoe);
      px(9, 18, 5, 3, pal.shoe);
    } else if (running) {
      if (frame === 0 || frame === 2) {
        px(4, 15, 4, 4, pal.pants);
        px(9, 15, 4, 3, pal.pantsDark);
      } else {
        px(6, 15, 4, 4, pal.pants);
        px(5, 16, 4, 3, pal.pantsDark);
      }
      px(frame % 2 === 0 ? 2 : 4, 18, 6, 3, pal.shoe);
      px(frame % 2 === 0 ? 9 : 11, 18, 6, 3, pal.shoe);
    } else {
      px(4, 15, 4, 4, pal.pants);
      px(9, 15, 4, 4, pal.pants);
      px(3, 18, 6, 3, pal.shoe);
      px(8, 18, 6, 3, pal.shoe);
    }

    // 冲刺光环
    if (dashing) {
      ctx.strokeStyle = 'rgba(126,232,255,.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ox + 16, oy + 18, 16, 20, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // 复活闪光
    if (p.respawnFlash > 0) {
      ctx.globalAlpha = clamp(p.respawnFlash, 0, 1) * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + 16, oy + 16, 18 + (1.1 - p.respawnFlash) * 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawWalker(ctx, e) {
    const squash = e.squashed ? 0.35 : 1;
    const h = e.h * squash;
    const x = e.x;
    const y = e.y + (e.h - h);
    const w = e.w;
    const cx = x + w / 2;
    ctx.save();
    if (e.state === 'dying') ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    ctx.beginPath();
    ctx.ellipse(cx, e.y + e.h, w * 0.42, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 脚
    ctx.fillStyle = '#3f240f';
    ctx.fillRect(x - 1, y + h - 6, 11, 6);
    ctx.fillRect(x + w - 10, y + h - 6, 11, 6);
    // 身体（深色描边 + 棕色主体）
    ctx.fillStyle = '#4a2c12';
    roundRect(ctx, x - 1, y + h * 0.30 - 1, w + 2, h * 0.70 + 2, 10);
    ctx.fill();
    ctx.fillStyle = '#8a5a2b';
    roundRect(ctx, x, y + h * 0.31, w, h * 0.68, 9);
    ctx.fill();
    // 头部圆顶（描边 + 浅棕）
    ctx.fillStyle = '#3f240f';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.34, w * 0.52 + 1, h * 0.36 + 1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d69a58';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.34, w * 0.5, h * 0.34, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.34, y + h * 0.24, w * 0.2, h * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    if (!e.squashed && e.state === 'active') {
      // 眼睛
      const eyeW = 8;
      const eyeH = 8;
      const eyeY = y + h * 0.30;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2, eyeY, eyeW, eyeH);
      ctx.fillRect(x + w - 2 - eyeW, eyeY, eyeW, eyeH);
      ctx.fillStyle = '#1a1008';
      const look = e.vx < 0 ? 0 : 2;
      ctx.fillRect(x + 4 + look, eyeY + 2, 4, 5);
      ctx.fillRect(x + w - 4 - eyeW + look + 2, eyeY + 2, 4, 5);
      // 眉毛
      ctx.fillStyle = '#3d2410';
      ctx.fillRect(x + 1, eyeY - 3, eyeW + 2, 2);
      ctx.fillRect(x + w - 3 - eyeW, eyeY - 3, eyeW + 2, 2);
    }
    ctx.restore();
  }

  function drawFlyer(ctx, e) {
    const cx = e.x + e.w / 2;
    const cy = e.y + e.h / 2;
    const flap = Math.sin(e.animTime * 18) * 6;
    ctx.save();
    if (e.state === 'dying') ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#6b47b8';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 2);
    ctx.lineTo(cx - 22, cy - 8 + flap);
    ctx.lineTo(cx - 6, cy + 9);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - 2);
    ctx.lineTo(cx + 22, cy - 8 + flap);
    ctx.lineTo(cx + 6, cy + 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b48cff';
    ctx.beginPath();
    ctx.ellipse(cx, cy, e.w * 0.42, e.h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 3, e.w * 0.18, e.h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (e.state === 'active') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 1, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy - 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#241238';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 3, cy - 1, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - 3, cy + 5, 2, 4);
      ctx.fillRect(cx + 1, cy + 5, 2, 4);
    }
    ctx.restore();
  }

  function drawFireball(ctx, fb, game) {
    const cx = fb.x + fb.w / 2;
    const cy = fb.y + fb.h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(fb.spin);
    ctx.fillStyle = 'rgba(255,120,20,.35)';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -1.5, 3, 3);
    ctx.restore();
  }

  /* ============================ 粒子 / 文字 ============================ */
  function drawParticles(ctx, game) {
    game.particles.forEach((pt) => {
      const a = clamp(pt.life / pt.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      if (pt.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (0.4 + a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.shape === 'coin') {
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, 6 * (0.6 + a * 0.6), 8, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawFloaters(ctx, game) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    game.floaters.forEach((ft) => {
      const a = clamp(ft.life / ft.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    });
    ctx.globalAlpha = 1;
  }

  /* ============================ HUD ============================ */
  function drawHUD(game, ctx) {
    const pad = 14;
    drawPlayerPanel(game, ctx, game.players[0], pad, pad, false);
    drawPlayerPanel(game, ctx, game.players[1], CONFIG.VIEW_W - pad - 318, pad, true);
    drawCenterHUD(game, ctx);
    drawOffscreenMarkers(game, ctx);
    drawBanner(game, ctx);
  }

  function drawPlayerPanel(game, ctx, p, x, y, mirrored) {
    if (!p) return;
    const w = 318;
    const h = 84;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,32,.55)';
    roundRect(ctx, x, y, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = p.palette.ui + 'aa';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 名字
    ctx.fillStyle = p.palette.ui;
    ctx.beginPath();
    ctx.arc(x + 18, y + 20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, x + 30, y + 20);

    // 生命
    for (let i = 0; i < CONFIG.PLAYER_MAX_HP; i++) {
      heart(ctx, x + 84 + i * 20, y + 11, 18, p.palette.ui, i < p.hp);
    }
    if (p.dead) {
      ctx.fillStyle = '#ff8a8a';
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(`倒地 ${p.koTimer.toFixed(1)}s`, x + 152, y + 20);
    }

    // 飞行能量条（最多 5 秒）
    const barX = x + 16;
    const barY = y + 38;
    const barW = 286;
    const barH = 14;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    roundRect(ctx, barX, barY, barW, barH, 7);
    ctx.fill();
    const ratio = clamp(p.flyFuel / CONFIG.FLY_MAX, 0, 1);
    const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    g.addColorStop(0, '#5ad1ff');
    g.addColorStop(0.6, '#8affc1');
    g.addColorStop(1, '#ffe066');
    ctx.fillStyle = g;
    roundRect(ctx, barX + 1.5, barY + 1.5, Math.max(0, (barW - 3) * ratio), barH - 3, 6);
    ctx.fill();
    // 每秒一格刻度
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < CONFIG.FLY_MAX; i++) {
      const tx = barX + (barW * i) / CONFIG.FLY_MAX;
      ctx.beginPath();
      ctx.moveTo(tx, barY + 2);
      ctx.lineTo(tx, barY + barH - 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#0a1024';
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`飞行 ${p.flyFuel.toFixed(1)}s`, barX + barW / 2, barY + barH / 2 + 1);

    // 技能
    const skillX = x + 26;
    const skillY = y + 66;
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath();
    ctx.arc(skillX, skillY, 13, 0, Math.PI * 2);
    ctx.fill();
    const ready = p.skillCd <= 0;
    ctx.fillStyle = ready ? p.palette.ui : 'rgba(120,130,170,.7)';
    ctx.beginPath();
    ctx.arc(skillX, skillY, 10.5, 0, Math.PI * 2);
    ctx.fill();
    if (!ready) {
      const total = p.index === 0 ? CONFIG.FIRE_CD : CONFIG.DASH_CD;
      ctx.fillStyle = 'rgba(10,14,32,.72)';
      ctx.beginPath();
      ctx.moveTo(skillX, skillY);
      ctx.arc(skillX, skillY, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.skillCd / total));
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#0a1024';
    ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.index === 0 ? '火' : '旋', skillX, skillY + 1);
    ctx.fillStyle = '#c9d1f2';
    ctx.font = '12px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.index === 0 ? '火焰弹  [J]' : '旋风冲刺  [/]', skillX + 20, skillY + 1);

    // 状态提示
    if (p.flying) {
      ctx.fillStyle = '#8affc1';
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('飞行中', x + w - 16, skillY + 1);
    } else if (p.atGoal) {
      ctx.fillStyle = '#ffd93b';
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('已到终点', x + w - 16, skillY + 1);
    } else if (p.dashTimer > 0) {
      ctx.fillStyle = '#7ee8ff';
      ctx.font = 'bold 12px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('冲刺中', x + w - 16, skillY + 1);
    }
    ctx.restore();
  }

  function drawCenterHUD(game, ctx) {
    const x = CONFIG.VIEW_W / 2;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(10,14,32,.55)';
    roundRect(ctx, x - 132, 14, 264, 54, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillText(game.level ? game.level.name : '', x, 30);

    const mm = Math.floor(game.levelTime / 60);
    const ss = Math.floor(game.levelTime % 60);
    const timeStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    ctx.fillStyle = '#c9d1f2';
    ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(`⏱ ${timeStr}`, x - 74, 56);
    ctx.fillStyle = '#ffd93b';
    ctx.fillText(`◆ ${game.coins}`, x - 4, 56);
    ctx.fillStyle = '#8affc1';
    ctx.fillText(`分数 ${game.score}`, x + 72, 56);
    ctx.restore();
  }

  function drawOffscreenMarkers(game, ctx) {
    game.players.forEach((p) => {
      if (!p || p.dead) return;
      const sx = (p.centerX - game.camera.x) * game.camera.scale;
      const sy = (p.centerY - game.camera.y) * game.camera.scale;
      const margin = 26;
      if (sx >= margin && sx <= CONFIG.VIEW_W - margin) return;
      const dir = sx < margin ? -1 : 1;
      const ax = dir < 0 ? 34 : CONFIG.VIEW_W - 34;
      const ay = clamp(sy, 90, CONFIG.VIEW_H - 90);
      ctx.save();
      ctx.fillStyle = p.palette.ui;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(ax + dir * 16, ay);
      ctx.lineTo(ax - dir * 8, ay - 14);
      ctx.lineTo(ax - dir * 8, ay + 14);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    });
  }

  function drawBanner(game, ctx) {
    if (game.banner.t <= 0) return;
    const a = clamp(game.banner.t / 0.5, 0, 1);
    const y = CONFIG.VIEW_H * 0.36;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(game.banner.text, CONFIG.VIEW_W / 2, y);
    const g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
    g.addColorStop(0, '#fff6c9');
    g.addColorStop(1, '#ffd93b');
    ctx.fillStyle = g;
    ctx.fillText(game.banner.text, CONFIG.VIEW_W / 2, y);
    if (game.banner.sub) {
      ctx.font = 'bold 20px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(game.banner.sub, CONFIG.VIEW_W / 2, y + 48);
      ctx.fillText(game.banner.sub, CONFIG.VIEW_W / 2, y + 48);
    }
    ctx.restore();
  }

  /* ============================ 覆盖界面 ============================ */
  function drawOverlay(game, ctx) {
    if (game.state === 'title') return drawTitle(game, ctx);
    if (game.state === 'paused') return drawPause(game, ctx);
    if (game.state === 'levelclear') return drawLevelClear(game, ctx);
    if (game.state === 'gameover') return drawGameOver(game, ctx);
    if (game.state === 'victory') return drawVictory(game, ctx);
    return undefined;
  }

  function darken(ctx, alpha) {
    ctx.fillStyle = `rgba(6,8,20,${alpha})`;
    ctx.fillRect(0, 0, CONFIG.VIEW_W, CONFIG.VIEW_H);
  }

  function panel(ctx, x, y, w, h, title, lines, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,36,.92)';
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = 'bold 30px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillText(title, x + w / 2, y + 52);
    ctx.fillStyle = '#d8e0ff';
    ctx.font = '16px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + 104 + i * 28));
    ctx.restore();
  }

  function heroPreview(ctx, cx, cy, palette, time) {
    const fake = {
      x: cx - 11, y: cy - 15, w: 22, h: 30, palette, facing: 1, animTime: time,
      squash: 1, stretch: 1, onGround: true, vx: 0, flying: false, dashTimer: 0,
      trail: [], spriteAlpha: 1, respawnFlash: 0, walkPhase: 0, flyFuel: CONFIG.FLY_MAX,
    };
    drawPlayer(ctx, fake, null);
  }

  function drawTitle(game, ctx) {
    darken(ctx, 0.55);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cy = 118;
    ctx.font = 'bold 62px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText('双人冒险', CONFIG.VIEW_W / 2, cy);
    const g = ctx.createLinearGradient(0, cy - 40, 0, cy + 40);
    g.addColorStop(0, '#fff6c9');
    g.addColorStop(0.5, '#ffd93b');
    g.addColorStop(1, '#ff9f43');
    ctx.fillStyle = g;
    ctx.fillText('双人冒险', CONFIG.VIEW_W / 2, cy);

    ctx.font = 'bold 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = '#9fb0e8';
    ctx.fillText('S U P E R   D U O   B R O S', CONFIG.VIEW_W / 2, cy + 48);

    ctx.font = 'bold 22px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    const blink = 0.6 + 0.4 * Math.sin(game.time * 4);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#fff';
    ctx.fillText('按 Enter / 空格 开始游戏', CONFIG.VIEW_W / 2, cy + 150);
    ctx.globalAlpha = 1;
    ctx.font = '15px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.fillStyle = '#aeb8de';
    ctx.fillText('小红：A D 移动 / W 跳 / Shift 冲刺 / S 飞行 / J 火焰弹', CONFIG.VIEW_W / 2, cy + 188);
    ctx.fillText('小绿：← → 移动 / ↑ 跳 / 右Shift 冲刺 / ↓ 飞行 / 斜杠 旋风冲刺', CONFIG.VIEW_W / 2, cy + 214);
    // 两位主角站在草地上
    heroPreview(ctx, CONFIG.VIEW_W / 2 - 130, 463, PALETTES[0], game.time);
    heroPreview(ctx, CONFIG.VIEW_W / 2 + 130, 463, PALETTES[1], game.time + 0.4);
    ctx.restore();
  }

  function drawPause(game, ctx) {
    darken(ctx, 0.6);
    panel(ctx, CONFIG.VIEW_W / 2 - 200, CONFIG.VIEW_H / 2 - 110, 400, 220, '暂 停',
      ['按 P / Esc 继续', '按 R 重新开始本关'], '#8ab4ff');
  }

  function drawLevelClear(game, ctx) {
    darken(ctx, 0.62);
    const bonus = Math.max(0, Math.round((CONFIG.PAR_TIME - game.levelTime) * CONFIG.TIME_BONUS));
    panel(ctx, CONFIG.VIEW_W / 2 - 250, CONFIG.VIEW_H / 2 - 140, 500, 280, '过关！',
      [
        `${game.level.name} 完成`,
        `用时 ${game.levelTime.toFixed(1)} 秒 · 时间奖励 +${bonus}`,
        `金币 ${game.coins} · 总分 ${game.score}`,
        '',
        '按 Enter / 空格 进入下一关',
      ], '#ffd93b');
  }

  function drawGameOver(game, ctx) {
    darken(ctx, 0.7);
    panel(ctx, CONFIG.VIEW_W / 2 - 220, CONFIG.VIEW_H / 2 - 120, 440, 240, '两人都倒下了',
      [
        `本次得分 ${game.score}`,
        `共收集金币 ${game.totalCoins}`,
        '',
        '按 R 重新挑战本关',
      ], '#ff5a5f');
  }

  function drawVictory(game, ctx) {
    darken(ctx, 0.72);
    panel(ctx, CONFIG.VIEW_W / 2 - 250, CONFIG.VIEW_H / 2 - 150, 500, 300, '全部通关！',
      [
        '你们配合得不错 🎉',
        `总分 ${game.score} · 金币 ${game.totalCoins}`,
        `总用时 ${game.totalTime.toFixed(1)} 秒`,
        '',
        '按 R 重新开始整场冒险',
      ], '#8affc1');
  }

  return {
    drawBackground,
    drawTiles,
    drawPlayer,
    drawWalker,
    drawFlyer,
    drawFireball,
    drawParticles,
    drawFloaters,
    drawHUD,
    drawOverlay,
  };
})();
