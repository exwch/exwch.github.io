/* ============================================================
 *  data.js — 配置数据：材料 / 小鸟 / 卡牌 / 关卡
 *  浏览器与 Node 测试共用
 * ============================================================ */
(function (global) {
  'use strict';

  var CONFIG = {
    W: 1280,
    H: 720,
    GROUND: 640,
    SLING: { x: 200, y: 452 },
    PULL_MAX: 118,       // 最大拉杆距离(px)
    K_PULL: 14.2,        // 拉杆距离 → 初速度
    MAX_SPEED: 1700,     // 发射速度上限
    DMG_REF_MASS: 800,   // 伤害公式参考质量
    DMG_K: 0.22,         // 伤害系数
    DMG_THRESHOLD: 150,      // 建筑：低于此撞击速度不掉血（轻微碰撞无效）
    DMG_THRESHOLD_PIG: 260,  // 猪：门槛更高，只有像样的冲击才算数
    PIG_DMG_MUL: 1.35,       // 猪比建材脆
    PIG_HP: 120,
    HAND_MAX: 8
  };

  /* ---------------- 材料 ---------------- */
  var MAT = {
    wood: {
      hp: 100, density: 0.85, friction: 0.62, restitution: 0.14, score: 500,
      name: '木板', c1: '#d59a55', c2: '#a4703a', edge: '#6d4520'
    },
    stone: {
      hp: 560, density: 2.4, friction: 0.68, restitution: 0.08, score: 900,
      name: '石头', c1: '#b9c4ce', c2: '#8794a1', edge: '#5b6672'
    },
    ice: {
      hp: 52, density: 0.55, friction: 0.24, restitution: 0.22, score: 400,
      name: '冰块', c1: '#cdeeff', c2: '#8fd3f0', edge: '#5fa8cc'
    }
  };

  /* ---------------- 小鸟 ---------------- */
  var BIRDS = {
    red: { name: '红鸟', r: 13, density: 1.6, friction: 0.62, restitution: 0.30,
      body: '#e0392f', belly: '#ffd9c9', line: '#97211a', abil: '怒吼冲击波' },
    blue: { name: '蓝鸟', r: 10, density: 1.0, friction: 0.50, restitution: 0.36,
      body: '#3d9fdc', belly: '#dff2ff', line: '#1e6a9e', abil: '空中分裂三只' },
    yellow: { name: '黄鸟', r: 11, density: 1.3, friction: 0.50, restitution: 0.24,
      body: '#f4c62f', belly: '#fff2c4', line: '#b3891a', abil: '冲刺加速' },
    black: { name: '黑鸟', r: 15, density: 3.1, friction: 0.70, restitution: 0.12,
      body: '#3a3f47', belly: '#9aa3ad', line: '#16191d', abil: '引爆' },
    white: { name: '白鸟', r: 14, density: 1.8, friction: 0.60, restitution: 0.30,
      body: '#f2f2f2', belly: '#ffffff', line: '#b9b9b9', abil: '下蛋轰炸' },
    green: { name: '绿鸟', r: 12, density: 1.4, friction: 0.55, restitution: 0.28,
      body: '#5cb84a', belly: '#e2ffd8', line: '#2f7a24', abil: '回旋逆转' }
  };

  /* ---------------- 卡牌库 ---------------- */
  var LIB = {
    red: { k: 'bird', nm: '红鸟', cost: 1, ico: '🔴', ds: '均衡战士，点击释放怒吼冲击波', bird: 'red' },
    blue: { k: 'bird', nm: '蓝鸟', cost: 1, ico: '🔵', ds: '轻巧灵快，点击分裂成三只', bird: 'blue' },
    yellow: { k: 'bird', nm: '黄鸟', cost: 2, ico: '🟡', ds: '高速穿刺，点击瞬间加速', bird: 'yellow' },
    black: { k: 'bird', nm: '黑鸟', cost: 3, ico: '⚫', ds: '重型炸弹，点击当场引爆', bird: 'black' },
    white: { k: 'bird', nm: '白鸟', cost: 3, ico: '⚪', ds: '点击下蛋轰炸，自身反弹', bird: 'white' },
    green: { k: 'bird', nm: '绿鸟', cost: 2, ico: '🟢', ds: '回旋鸟，点击后急速回转', bird: 'green' },

    power: { k: 'tactic', nm: '大力神臂', cost: 1, ico: '💪', ds: '本回合发射力度 +45%' },
    aim: { k: 'tactic', nm: '瞄准镜', cost: 1, ico: '🎯', ds: '本回合显示完整弹道预测' },
    frost: { k: 'tactic', nm: '冰霜诅咒', cost: 1, ico: '❄️', ds: '建筑变脆，本回合受伤 +70%' },
    boost: { k: 'tactic', nm: '狂暴药剂', cost: 2, ico: '🔥', ds: '本回合小鸟撞击伤害 +60%' },
    charge: { k: 'tactic', nm: '能量充能', cost: 0, ico: '⚡', ds: '立刻获得 2 点能量' },
    scout: { k: 'tactic', nm: '侦察', cost: 0, ico: '🔍', ds: '立即抽 2 张牌' },
    demo: { k: 'tactic', nm: '定向爆破', cost: 2, ico: '💣', ds: '选择一处建筑，立即摧毁' },
    fire: { k: 'tactic', nm: '烈焰风暴', cost: 3, ico: '🌋', ds: '对所有建筑造成 95 点伤害' },
    quake: { k: 'tactic', nm: '大地震', cost: 3, ico: '🌀', ds: '全场冲击，建筑与猪受 75 伤害' },
    summon: { k: 'tactic', nm: '召唤鸟群', cost: 2, ico: '🐦', ds: '向弹射架加入 2 只蓝鸟' },
    heavy: { k: 'tactic', nm: '重炮支援', cost: 2, ico: '🧨', ds: '向弹射架加入 1 只黑鸟' },
    slow: { k: 'tactic', nm: '时间缓流', cost: 1, ico: '⏳', ds: '本回合物理速度减半' }
  };

  /* 牌组构成 */
  var DECK = ('red red red blue blue blue yellow yellow black black white green green ' +
              'power power aim frost frost boost boost charge charge scout scout ' +
              'demo fire quake summon summon heavy slow').split(' ');

  /* ---------------- 关卡 ----------------
   * 地面高度 y = 640；y 向下为正。
   * blocks: 中心点 + 宽高 + 材料 */
  var LEVELS = [
    {
      nm: '木棚小屋', rounds: 5, par: 3,
      pigs: [{ x: 950, y: 622 }, { x: 1160, y: 622 }],
      blocks: [
        { x: 880, y: 575, w: 20, h: 130, m: 'wood' },
        { x: 1020, y: 575, w: 20, h: 130, m: 'wood' },
        { x: 950, y: 500, w: 180, h: 20, m: 'wood' },
        { x: 1100, y: 600, w: 20, h: 80, m: 'ice' },
        { x: 1220, y: 600, w: 20, h: 80, m: 'ice' },
        { x: 1160, y: 550, w: 160, h: 20, m: 'wood' }
      ]
    },
    {
      nm: '冰霜哨塔', rounds: 6, par: 4,
      pigs: [{ x: 910, y: 622 }, { x: 910, y: 452 }, { x: 1100, y: 502 }],
      blocks: [
        { x: 860, y: 565, w: 20, h: 150, m: 'wood' },
        { x: 960, y: 565, w: 20, h: 150, m: 'wood' },
        { x: 910, y: 480, w: 140, h: 20, m: 'wood' },
        { x: 880, y: 420, w: 20, h: 100, m: 'ice' },
        { x: 940, y: 420, w: 20, h: 100, m: 'ice' },
        { x: 910, y: 360, w: 120, h: 20, m: 'wood' },
        { x: 1100, y: 610, w: 60, h: 60, m: 'ice' },
        { x: 1100, y: 550, w: 60, h: 60, m: 'ice' },
        { x: 1240, y: 580, w: 40, h: 120, m: 'stone' }
      ]
    },
    {
      nm: '石壁要塞', rounds: 7, par: 5,
      pigs: [{ x: 1000, y: 622 }, { x: 1000, y: 472 }, { x: 1000, y: 342 }, { x: 1000, y: 252 }],
      blocks: [
        { x: 880, y: 575, w: 24, h: 130, m: 'stone' },
        { x: 1120, y: 575, w: 24, h: 130, m: 'stone' },
        { x: 1000, y: 500, w: 290, h: 20, m: 'wood' },
        { x: 940, y: 435, w: 20, h: 110, m: 'wood' },
        { x: 1060, y: 435, w: 20, h: 110, m: 'wood' },
        { x: 1000, y: 370, w: 180, h: 20, m: 'wood' },
        { x: 960, y: 325, w: 18, h: 70, m: 'ice' },
        { x: 1040, y: 325, w: 18, h: 70, m: 'ice' },
        { x: 1000, y: 280, w: 110, h: 20, m: 'wood' },
        { x: 740, y: 600, w: 40, h: 80, m: 'ice' },
        { x: 740, y: 520, w: 40, h: 80, m: 'ice' },
        { x: 740, y: 440, w: 40, h: 80, m: 'ice' }
      ]
    }
  ];

  /* ---------------- 世界构建（游戏与测试共用） ---------------- */
  function buildLevel(world, lv) {
    var P = global.ABPhysics;
    var blocks = [], pigs = [];

    /* 地面 */
    world.add(new P.Body({
      x: 640, y: CONFIG.GROUND + 400, isStatic: true, friction: 0.8, restitution: 0.05,
      tag: 'ground',
      shape: {
        type: 'poly',
        verts: [{ x: -2600, y: -400 }, { x: 2000, y: -400 },
                { x: 2000, y: 400 }, { x: -2600, y: 400 }]
      }
    }));

    lv.blocks.forEach(function (b) {
      var m = MAT[b.m];
      var bd = new P.Body({
        x: b.x, y: b.y, angle: 0, density: m.density, friction: m.friction,
        restitution: m.restitution, tag: 'block',
        data: { mat: b.m, hp: m.hp, maxHp: m.hp, w: b.w, h: b.h }
      });
      bd.setShape({ type: 'poly', verts: P.rectVerts(b.w, b.h) });
      world.add(bd);
      blocks.push(bd);
    });

    lv.pigs.forEach(function (p) {
      var bd = new P.Body({
        x: p.x, y: p.y, density: 0.55, friction: 0.5, restitution: 0.22,
      tag: 'pig', data: { hp: CONFIG.PIG_HP, maxHp: CONFIG.PIG_HP, blink: Math.random() * 6 }
      });
      bd.setShape({ type: 'circle', r: 18 });
      world.add(bd);
      pigs.push(bd);
    });

    return { blocks: blocks, pigs: pigs };
  }

  global.ABData = {
    CONFIG: CONFIG, MAT: MAT, BIRDS: BIRDS, LIB: LIB, DECK: DECK,
    LEVELS: LEVELS, buildLevel: buildLevel
  };
})(typeof window !== 'undefined' ? window : globalThis);
