/* ============================================================
 *  physics.js — 轻量 2D 刚体物理引擎
 *  圆形 / 凸多边形 · SAT 碰撞 · 冲量求解 · 摩擦 · 位置修正
 *  无外部依赖
 * ============================================================ */
(function (global) {
  'use strict';

  var EPS = 1e-6;

  var V = {
    add: function (a, b) { return { x: a.x + b.x, y: a.y + b.y }; },
    sub: function (a, b) { return { x: a.x - b.x, y: a.y - b.y }; },
    mul: function (a, s) { return { x: a.x * s, y: a.y * s }; },
    dot: function (a, b) { return a.x * b.x + a.y * b.y; },
    cross: function (a, b) { return a.x * b.y - a.y * b.x; },
    crossSV: function (s, a) { return { x: -s * a.y, y: s * a.x }; },
    len: function (a) { return Math.sqrt(a.x * a.x + a.y * a.y); },
    len2: function (a) { return a.x * a.x + a.y * a.y; },
    neg: function (a) { return { x: -a.x, y: -a.y }; },
    norm: function (a) {
      var l = Math.sqrt(a.x * a.x + a.y * a.y) || 1;
      return { x: a.x / l, y: a.y / l };
    },
    rot: function (v, ang) {
      var c = Math.cos(ang), s = Math.sin(ang);
      return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
    }
  };

  function ensureCCW(vs) {
    var a = 0, i;
    for (i = 0; i < vs.length; i++) {
      var p = vs[i], q = vs[(i + 1) % vs.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a < 0 ? vs.slice().reverse() : vs;
  }

  function polyArea(vs) {
    var a = 0, i;
    for (i = 0; i < vs.length; i++) {
      var p = vs[i], q = vs[(i + 1) % vs.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  function polyCentroid(vs) {
    var a = 0, cx = 0, cy = 0, i;
    for (i = 0; i < vs.length; i++) {
      var p = vs[i], q = vs[(i + 1) % vs.length];
      var cr = p.x * q.y - q.x * p.y;
      a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
    }
    a *= 0.5;
    if (Math.abs(a) < EPS) return { x: 0, y: 0 };
    return { x: cx / (6 * a), y: cy / (6 * a) };
  }

  function polyInertia(vs, m) {
    var num = 0, den = 0, i;
    for (i = 0; i < vs.length; i++) {
      var p = vs[i], q = vs[(i + 1) % vs.length];
      var cr = Math.abs(V.cross(p, q));
      num += cr * (V.dot(p, p) + V.dot(p, q) + V.dot(q, q));
      den += cr;
    }
    return den < EPS ? m : m * num / (6 * den);
  }

  /* ---------------- Body ---------------- */
  function Body(o) {
    o = o || {};
    this.pos = { x: o.x || 0, y: o.y || 0 };
    this.vel = { x: o.vx || 0, y: o.vy || 0 };
    this.angle = o.angle || 0;
    this.angVel = o.angVel || 0;
    this.restitution = o.restitution !== undefined ? o.restitution : 0.12;
    this.friction = o.friction !== undefined ? o.friction : 0.55;
    this.density = o.density !== undefined ? o.density : 1;
    this.isStatic = !!o.isStatic;
    this.tag = o.tag || 'body';
    this.data = o.data || {};
    this.alive = true;
    this.impactSpeed = 0;
    this.impactMass = 0;
    this.asleep = false;
    this.sleepT = 0;
    this.contacts = 0;
    this.wverts = [];
    this.wnormals = [];
    this.setShape(o.shape || { type: 'circle', r: 10 });
    this.updateWorld();
  }

  Body.prototype.setShape = function (shape) {
    if (shape.type === 'circle') {
      this.shape = { type: 'circle', r: shape.r };
      this.area = Math.PI * shape.r * shape.r;
      this.boundR = shape.r;
    } else {
      var vs = ensureCCW(shape.verts.map(function (p) { return { x: p.x, y: p.y }; }));
      var c = polyCentroid(vs);
      this.shape = {
        type: 'poly',
        verts: vs.map(function (p) { return { x: p.x - c.x, y: p.y - c.y }; })
      };
      this.area = polyArea(this.shape.verts);
      this.boundR = 0;
      for (var bi = 0; bi < this.shape.verts.length; bi++) {
        var bv = this.shape.verts[bi];
        this.boundR = Math.max(this.boundR, Math.sqrt(bv.x * bv.x + bv.y * bv.y));
      }
    }
    if (this.isStatic) {
      this.mass = Infinity; this.invMass = 0;
      this.inertia = Infinity; this.invInertia = 0;
    } else {
      this.mass = Math.max(this.area * this.density, 0.0001);
      this.invMass = 1 / this.mass;
      this.inertia = this.shape.type === 'circle'
        ? 0.5 * this.mass * this.shape.r * this.shape.r
        : polyInertia(this.shape.verts, this.mass);
      this.invInertia = this.inertia > EPS ? 1 / this.inertia : 0;
    }
    /* 换形状后立即刷新世界坐标，避免调用方忘记 */
    this.updateWorld();
  };

  Body.prototype.updateWorld = function () {
    if (this.shape.type !== 'poly') return;
    var c = Math.cos(this.angle), s = Math.sin(this.angle);
    var vs = this.shape.verts, out = [], ns = [], i;
    for (i = 0; i < vs.length; i++) {
      var v = vs[i];
      out.push({ x: this.pos.x + v.x * c - v.y * s, y: this.pos.y + v.x * s + v.y * c });
    }
    this.wverts = out;
    for (i = 0; i < out.length; i++) {
      var p1 = out[i], p2 = out[(i + 1) % out.length];
      var ex = p2.x - p1.x, ey = p2.y - p1.y;
      var l = Math.sqrt(ex * ex + ey * ey) || 1;
      ns.push({ x: ey / l, y: -ex / l });
    }
    this.wnormals = ns;
  };

  Body.prototype.speed = function () { return V.len(this.vel); };

  Body.prototype.wake = function () { this.asleep = false; this.sleepT = 0; };

  Body.prototype.applyImpulse = function (imp, rv) {
    if (this.isStatic) return;
    this.vel.x += imp.x * this.invMass;
    this.vel.y += imp.y * this.invMass;
    if (rv) this.angVel += V.cross(rv, imp) * this.invInertia;
  };

  Body.prototype.contains = function (p) {
    if (this.shape.type === 'circle') {
      var dx = p.x - this.pos.x, dy = p.y - this.pos.y;
      return dx * dx + dy * dy <= this.shape.r * this.shape.r;
    }
    for (var i = 0; i < this.wnormals.length; i++) {
      if (V.dot(this.wnormals[i], V.sub(p, this.wverts[i])) > 0) return false;
    }
    return true;
  };

  /* ---------------- 碰撞检测 ---------------- */
  function circleCircle(A, B) {
    var d = V.sub(B.pos, A.pos), dist = V.len(d);
    var rs = A.shape.r + B.shape.r;
    if (dist >= rs) return null;
    var n = dist > EPS ? V.mul(d, 1 / dist) : { x: 0, y: -1 };
    var pen = rs - dist;
    return {
      a: A, b: B, normal: n, penetration: pen,
      points: [V.add(A.pos, V.mul(n, A.shape.r - pen * 0.5))]
    };
  }

  function circlePoly(A, B) {
    // A = 圆, B = 多边形；返回的法线从 A 指向 B
    var r = A.shape.r, i, maxSep = -Infinity, maxIdx = 0;
    for (i = 0; i < B.wverts.length; i++) {
      var s = V.dot(B.wnormals[i], V.sub(A.pos, B.wverts[i]));
      if (s > r) return null;
      if (s > maxSep) { maxSep = s; maxIdx = i; }
    }
    if (maxSep <= 0) {
      var n1 = V.neg(B.wnormals[maxIdx]);
      var pen = r - maxSep;
      return {
        a: A, b: B, normal: n1, penetration: pen,
        points: [V.add(A.pos, V.mul(n1, r - pen * 0.5))]
      };
    }
    var best = null, bd = Infinity;
    for (i = 0; i < B.wverts.length; i++) {
      var p1 = B.wverts[i], p2 = B.wverts[(i + 1) % B.wverts.length];
      var e = V.sub(p2, p1), l2 = V.len2(e) || 1;
      var t = V.dot(V.sub(A.pos, p1), e) / l2;
      t = Math.max(0, Math.min(1, t));
      var q = { x: p1.x + e.x * t, y: p1.y + e.y * t };
      var dd = V.len2(V.sub(A.pos, q));
      if (dd < bd) { bd = dd; best = q; }
    }
    var dist = Math.sqrt(bd);
    if (dist > r) return null;
    return {
      a: A, b: B, normal: V.norm(V.sub(best, A.pos)),
      penetration: r - dist, points: [best]
    };
  }

  function findLeastPen(A, B) {
    /* 沿 A 的每条面法线做投影区间测试：
       sep = min(B 的投影) - max(A 的投影)
       sep > 0 说明该轴分离；取最接近 0 的轴作为碰撞轴 */
    var best = -Infinity, idx = 0, i, k;
    for (i = 0; i < A.wverts.length; i++) {
      var n = A.wnormals[i], minB = Infinity, maxA = -Infinity, d;
      for (k = 0; k < A.wverts.length; k++) {
        d = V.dot(n, A.wverts[k]);
        if (d > maxA) maxA = d;
      }
      for (k = 0; k < B.wverts.length; k++) {
        d = V.dot(n, B.wverts[k]);
        if (d < minB) minB = d;
      }
      var sep = minB - maxA;
      if (sep > best) { best = sep; idx = i; }
    }
    return { sep: best, idx: idx };
  }

  function clipSeg(p1, p2, n, o) {
    var out = [], d1 = V.dot(n, p1) - o, d2 = V.dot(n, p2) - o;
    if (d1 <= 0) out.push(p1);
    if (d2 <= 0) out.push(p2);
    if (d1 * d2 < 0) {
      var t = d1 / (d1 - d2);
      out.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
    }
    return out;
  }

  function polyPoly(A, B) {
    var fa = findLeastPen(A, B);
    if (fa.sep >= 0) return null;
    var fb = findLeastPen(B, A);
    if (fb.sep >= 0) return null;

    var refP, incP, refIdx, flip;
    if (fa.sep > fb.sep) { refP = A; incP = B; refIdx = fa.idx; flip = false; }
    else { refP = B; incP = A; refIdx = fb.idx; flip = true; }

    var rv1 = refP.wverts[refIdx];
    var rv2 = refP.wverts[(refIdx + 1) % refP.wverts.length];
    var side = V.norm(V.sub(rv2, rv1));
    var rn = { x: side.y, y: -side.x };
    var rc = V.dot(rn, rv1);

    var minD = Infinity, ii = 0, i;
    for (i = 0; i < incP.wnormals.length; i++) {
      var d = V.dot(incP.wnormals[i], rn);
      if (d < minD) { minD = d; ii = i; }
    }
    var iv1 = incP.wverts[ii];
    var iv2 = incP.wverts[(ii + 1) % incP.wverts.length];

    var pts = clipSeg(iv1, iv2, V.neg(side), -V.dot(side, rv1));
    if (pts.length < 2) return null;
    pts = clipSeg(pts[0], pts[1], side, V.dot(side, rv2));
    if (pts.length < 2) return null;

    var cs = [], maxPen = 0;
    for (i = 0; i < pts.length; i++) {
      var sep = V.dot(rn, pts[i]) - rc;
      if (sep <= 0.001) { cs.push(pts[i]); maxPen = Math.max(maxPen, -sep); }
    }
    if (!cs.length) return null;
    return {
      a: A, b: B, normal: flip ? V.neg(rn) : rn,
      penetration: maxPen, points: cs
    };
  }

  function collide(A, B) {
    var ta = A.shape.type, tb = B.shape.type, m;
    if (ta === 'circle' && tb === 'circle') return circleCircle(A, B);
    if (ta === 'circle' && tb === 'poly') return circlePoly(A, B);
    if (ta === 'poly' && tb === 'circle') {
      m = circlePoly(B, A);
      if (!m) return null;
      return { a: m.b, b: m.a, normal: V.neg(m.normal), penetration: m.penetration, points: m.points };
    }
    return polyPoly(A, B);
  }

  /* ---------------- World ---------------- */
  function World(o) {
    o = o || {};
    this.bodies = [];
    this.gravity = o.gravity || { x: 0, y: 1900 };
    this.fixedDt = 1 / 180;
    this.iterations = 24;
    this.acc = 0;
    this.bias = 0.75;
    this.slop = 0.3;
    this.restThreshold = 85;   // 低速接触不弹跳，保证堆叠稳定
  }

  World.prototype.add = function (b) { this.bodies.push(b); return b; };

  World.prototype.remove = function (b) {
    var i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    b.alive = false;
  };

  World.prototype.step = function (dt) {
    if (dt > 0.06) dt = 0.06;
    /* 每帧开始时清空撞击记录，帧内所有子步取峰值 */
    for (var i = 0; i < this.bodies.length; i++) {
      this.bodies[i].impactSpeed = 0;
      this.bodies[i].impactMass = 0;
    }
    this.acc += dt;
    var g = 0;
    while (this.acc >= this.fixedDt && g < 16) {
      this.substep(this.fixedDt);
      this.acc -= this.fixedDt;
      g++;
    }
  };

  World.prototype.substep = function (dt) {
    var bs = this.bodies, i, j, k, b;

    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      b.contacts = 0;
      if (b.isStatic) continue;
      if (b.asleep) {           // 休眠体：不施加重力、不积分，等被撞醒
        b.vel.x = 0; b.vel.y = 0; b.angVel = 0;
        continue;
      }
      b.vel.x += this.gravity.x * dt;
      b.vel.y += this.gravity.y * dt;
      b.vel.x *= 0.9996;
      b.vel.y *= 0.9996;
      b.angVel *= 0.997;
    }

    var contacts = [];
    for (i = 0; i < bs.length; i++) {
      var A = bs[i];
      for (j = i + 1; j < bs.length; j++) {
        var B = bs[j];
        if (A.isStatic && B.isStatic) continue;
        var dx = Math.abs(A.pos.x - B.pos.x), dy = Math.abs(A.pos.y - B.pos.y);
        var rad = A.boundR + B.boundR + 8;
        if (dx > rad || dy > rad) continue;
        var m = collide(A, B);
        if (m) { contacts.push(m); A.contacts++; B.contacts++; }
      }
    }

    /* 唤醒：被快速运动的物体撞到就醒；失去所有支撑也醒 */
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.isStatic || !b.asleep) continue;
      if (b.contacts === 0) { b.asleep = false; b.sleepT = 0; continue; }
      for (j = 0; j < contacts.length; j++) {
        var ct = contacts[j];
        var other = ct.a === b ? ct.b : (ct.b === b ? ct.a : null);
        if (other && !other.asleep && !other.isStatic &&
            (other.speed() > 45 || Math.abs(other.angVel) > 3)) {
          b.asleep = false; b.sleepT = 0; break;
        }
      }
    }

    /* 撞击强度（给上层做伤害计算） */
    for (i = 0; i < contacts.length; i++) {
      var c = contacts[i];
      var red = 1 / (c.a.invMass + c.b.invMass + EPS);
      for (k = 0; k < c.points.length; k++) {
        var rA = V.sub(c.points[k], c.a.pos), rB = V.sub(c.points[k], c.b.pos);
        var vA = V.add(c.a.vel, V.crossSV(c.a.angVel, rA));
        var vB = V.add(c.b.vel, V.crossSV(c.b.angVel, rB));
        var ap = -V.dot(V.sub(vB, vA), c.normal);
        if (ap > c.a.impactSpeed) { c.a.impactSpeed = ap; c.a.impactMass = red; }
        if (ap > c.b.impactSpeed) { c.b.impactSpeed = ap; c.b.impactMass = red; }
      }
    }

    for (var it = 0; it < this.iterations; it++) {
      for (i = 0; i < contacts.length; i++) this.solve(contacts[i]);
    }

    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.isStatic) continue;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.angle += b.angVel * dt;
    }

    /* 休眠判定：有支撑且几乎静止持续一段时间 → 睡眠 */
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.isStatic || b.asleep) continue;
      if (b.contacts > 0 && b.speed() < 18 && Math.abs(b.angVel) < 0.35) {
        b.sleepT += dt;
      } else {
        b.sleepT = 0;
      }
      if (b.sleepT > 0.7) {
        b.asleep = true;
        b.vel.x = 0; b.vel.y = 0; b.angVel = 0;
      }
    }

    for (i = 0; i < contacts.length; i++) {
      var cc = contacts[i], pen = cc.penetration - this.slop;
      if (pen <= 0) continue;
      var inv = cc.a.invMass + cc.b.invMass;
      if (inv <= 0) continue;
      var cor = V.mul(cc.normal, (pen / inv) * this.bias);
      if (!cc.a.isStatic) { cc.a.pos.x -= cor.x * cc.a.invMass; cc.a.pos.y -= cor.y * cc.a.invMass; }
      if (!cc.b.isStatic) { cc.b.pos.x += cor.x * cc.b.invMass; cc.b.pos.y += cor.y * cc.b.invMass; }
    }

    /* 滚动阻力：接触状态下的物体会慢慢停下来，
       否则圆形（小鸟/猪）会在地面上永远滚下去，永远无法进入休眠 */
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.isStatic || b.asleep || b.contacts === 0) continue;
      b.angVel *= 0.985;
      if (b.shape.type === 'circle') {
        /* 关键：线速度与角速度同比例衰减。
           否则"纯滚动"状态下摩擦力会把线性阻尼抵消，小球会永远滚下去 */
        b.vel.x *= 0.985;
        b.vel.y *= 0.996;
      }
    }

    for (i = 0; i < bs.length; i++) bs[i].updateWorld();
  };

  World.prototype.solve = function (c) {
    var A = c.a, B = c.b, n = c.normal;
    var eMax = Math.min(A.restitution, B.restitution);
    var mu = Math.sqrt(Math.max(A.friction, 0.001) * Math.max(B.friction, 0.001));
    var cnt = c.points.length || 1;
    for (var k = 0; k < c.points.length; k++) {
      var p = c.points[k];
      var rA = V.sub(p, A.pos), rB = V.sub(p, B.pos);
      var rel = V.sub(V.add(B.vel, V.crossSV(B.angVel, rB)),
                      V.add(A.vel, V.crossSV(A.angVel, rA)));
      var vn = V.dot(rel, n);
      if (vn > 0) continue;
      var e = vn < -this.restThreshold ? eMax : 0;
      var ra = V.cross(rA, n), rb = V.cross(rB, n);
      var inv = A.invMass + B.invMass + ra * ra * A.invInertia + rb * rb * B.invInertia;
      if (inv <= 0) continue;
      var j = -(1 + e) * vn / inv / cnt;
      var imp = V.mul(n, j);
      A.applyImpulse(V.neg(imp), rA);
      B.applyImpulse(imp, rB);

      var rel2 = V.sub(V.add(B.vel, V.crossSV(B.angVel, rB)),
                       V.add(A.vel, V.crossSV(A.angVel, rA)));
      var t = V.sub(rel2, V.mul(n, V.dot(rel2, n)));
      if (V.len2(t) < 1e-8) continue;
      t = V.norm(t);
      var raT = V.cross(rA, t), rbT = V.cross(rB, t);
      var invT = A.invMass + B.invMass + raT * raT * A.invInertia + rbT * rbT * B.invInertia;
      if (invT <= 0) continue;
      var jt = -V.dot(rel2, t) / invT / cnt;
      var mx = Math.abs(j) * mu;
      jt = Math.max(-mx, Math.min(mx, jt));
      var impT = V.mul(t, jt);
      A.applyImpulse(V.neg(impT), rA);
      B.applyImpulse(impT, rB);
    }
  };

  /* 爆炸 / 冲击波：对半径内所有动态体施加冲量 */
  World.prototype.blast = function (cx, cy, radius, power) {
    var REF = 800, K = 360;
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i];
      if (b.isStatic) continue;
      var d = V.sub(b.pos, { x: cx, y: cy });
      var dist = V.len(d) || 0.001;
      if (dist > radius) continue;
      b.wake();
      var f = 1 - dist / radius;
      var dir = V.mul(d, 1 / dist);
      /* 按质量归一化：越重的物体被推得越少 */
      var scale = power * f * (REF / b.mass) * K;
      b.vel.x += dir.x * scale;
      b.vel.y += dir.y * scale - 130 * f;
      b.angVel += (Math.random() - 0.5) * 10 * f;
    }
  };

  global.ABPhysics = {
    V: V,
    Body: Body,
    World: World,
    collide: collide,
    rectVerts: function (w, h) {
      return [
        { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 }
      ];
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
