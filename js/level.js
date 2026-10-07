/* ============================================================
   关卡数据与生成器
   图块字符：
     .  空气          #  地面/实心砖        B  可破坏砖块
     ?  问号砖块      X  已使用砖块         =  单向平台（可从下方穿过）
     C  金币          E  行走敌人           V  飞行敌人
     S  弹簧          ^  尖刺               ~  熔岩
     F  终点旗杆
   ============================================================ */

const SOLID_CHARS = new Set(['#', 'B', '?', 'X', 'S']);
const HAZARD_CHARS = new Set(['^', '~']);

class LevelBuilder {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.g = [];
    for (let y = 0; y < h; y++) this.g.push(new Array(w).fill('.'));
  }
  set(x, y, ch) {
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.g[y][x] = ch;
    return this;
  }
  rect(x0, y0, x1, y1, ch) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  ground(x0, x1, top = 15, ch = '#') {
    return this.rect(x0, top, x1, this.h - 1, ch);
  }
  platform(x, y, len, ch = '=') {
    for (let i = 0; i < len; i++) this.set(x + i, y, ch);
    return this;
  }
  coins(x0, x1, y) {
    for (let x = x0; x <= x1; x++) this.set(x, y, 'C');
    return this;
  }
  blocks(x0, x1, y, ch = 'B') {
    for (let x = x0; x <= x1; x++) this.set(x, y, ch);
    return this;
  }
  enemies(xs, y = 14) {
    xs.forEach((x) => this.set(x, y, 'E'));
    return this;
  }
  flyer(x, y) { return this.set(x, y, 'V'); }
  spikes(x0, x1, y = 14) { return this.rect(x0, y, x1, y, '^'); }
  lava(x0, x1, y = 16) { return this.rect(x0, y, x1, y, '~'); }
  spring(x, y = 14) { return this.set(x, y, 'S'); }
  /** 阶梯：从 x 开始向右逐级升高 h 级 */
  stairs(x, h, top = 15) {
    for (let i = 0; i < h; i++) this.rect(x + i, top - 1 - i, x + i, top - 1, '#');
    return this;
  }
  /** 旗杆：pole 是触发器（非实心），底座是实心台 */
  flag(x, top = 15, h = 9) {
    this.rect(x, top - h, x, top - 2, 'F');
    this.set(x, top - 1, 'X');
    return this;
  }
}

const LEVELS = [
  /* ------------------------------ 1-1 青青草原 ------------------------------ */
  {
    name: '1-1 青青草原',
    theme: 'day',
    width: 212,
    height: 17,
    spawns: [{ x: 3, y: 14 }, { x: 5, y: 14 }],
    build(b) {
      b.ground(0, 26);
      b.coins(6, 9, 12);
      b.set(18, 11, '?'); b.set(19, 11, 'B'); b.set(20, 11, '?');
      b.enemies([13, 23]);
      b.flyer(29, 9);
      // 第一个坑
      b.ground(33, 64);
      b.platform(38, 12, 4);
      b.coins(38, 41, 11);
      b.enemies([45, 48]);
      b.set(52, 11, 'B'); b.set(53, 11, '?'); b.set(54, 11, 'B');
      b.coins(52, 54, 10);
      // 第二个坑
      b.flyer(67, 7);
      b.ground(71, 104);
      b.blocks(74, 78, 11, 'B');
      b.enemies([84, 86]);
      b.spring(95, 14);
      b.coins(96, 99, 8);
      b.coins(96, 99, 7);
      // 宽阔大坑（需要冲刺跳或者飞过去）
      b.flyer(108, 8);
      b.ground(113, 152);
      b.platform(118, 11, 5);
      b.coins(118, 122, 10);
      b.enemies([130, 133, 136]);
      b.spikes(144, 146, 14);
      b.flyer(148, 6);
      b.platform(140, 6, 4);
      b.coins(140, 143, 5);
      // 第三个坑
      b.ground(159, 211);
      b.enemies([166, 170]);
      b.platform(172, 12, 3);
      b.coins(172, 174, 11);
      b.blocks(180, 182, 11, 'B');
      b.set(181, 11, '?');
      b.coins(186, 189, 12);
      b.stairs(190, 4);
      b.flag(200, 15, 9);
      b.coins(203, 206, 12);
    },
  },

  /* ------------------------------ 1-2 熔岩夜窟 ------------------------------ */
  {
    name: '1-2 熔岩夜窟',
    theme: 'night',
    width: 244,
    height: 17,
    spawns: [{ x: 3, y: 14 }, { x: 5, y: 14 }],
    build(b) {
      b.ground(0, 22);
      b.coins(5, 8, 12);
      b.enemies([12, 15]);
      b.set(18, 11, '?'); b.set(19, 11, '?');
      // 熔岩沟
      b.lava(23, 30, 16);
      b.flyer(26, 8);
      b.ground(31, 52);
      b.blocks(35, 38, 11, 'B');
      b.set(36, 11, '?');
      b.platform(41, 11, 4);
      b.coins(41, 44, 10);
      b.enemies([46, 49]);
      b.flyer(45, 7);
      b.lava(53, 58, 16);
      b.ground(59, 86);
      b.spikes(64, 67, 14);
      b.platform(70, 12, 4);
      b.coins(70, 73, 11);
      b.enemies([78, 81]);
      b.flyer(60, 6);
      b.lava(87, 94, 16);
      b.platform(89, 11, 3);
      b.coins(89, 91, 10);
      b.ground(95, 126);
      b.spring(100, 14);
      b.platform(104, 7, 8);
      b.coins(104, 111, 6);
      b.enemies([116, 119]);
      b.set(113, 11, '?'); b.set(114, 11, 'B');
      b.flyer(122, 8);
      b.lava(127, 134, 16);
      b.platform(129, 11, 3);
      b.coins(129, 131, 10);
      b.flyer(131, 6);
      b.ground(135, 168);
      b.spikes(141, 143, 14);
      b.enemies([148, 151, 154]);
      b.blocks(157, 160, 11, 'B');
      b.coins(157, 160, 10);
      b.platform(163, 9, 4);
      b.coins(163, 166, 8);
      b.lava(169, 176, 16);
      b.platform(171, 12, 3);
      b.coins(171, 173, 11);
      b.flyer(174, 7);
      b.ground(177, 243);
      b.enemies([184, 188]);
      b.coins(192, 196, 12);
      b.spring(198, 14);
      b.platform(201, 7, 6);
      b.coins(201, 206, 6);
      b.stairs(214, 5);
      b.flag(228, 15, 10);
      b.coins(231, 234, 12);
    },
  },
];

function buildLevel(def) {
  const builder = new LevelBuilder(def.width, def.height);
  def.build(builder);
  return {
    name: def.name,
    theme: def.theme,
    width: def.width,
    height: def.height,
    grid: builder.g,
    spawns: def.spawns,
    pixelWidth: def.width * CONFIG.TILE,
    pixelHeight: def.height * CONFIG.TILE,
  };
}

/** 取图块字符，越界：左右视为墙，上/下视为空气 */
function tileAt(level, tx, ty) {
  if (tx < 0 || tx >= level.width) return '#';
  if (ty < 0 || ty >= level.height) return '.';
  return level.grid[ty][tx];
}

function isSolidTile(level, tx, ty) {
  if (tx < 0 || tx >= level.width) return true;
  if (ty < 0 || ty >= level.height) return false;
  return SOLID_CHARS.has(level.grid[ty][tx]);
}

function isHazardTile(level, tx, ty) {
  if (tx < 0 || tx >= level.width || ty < 0 || ty >= level.height) return false;
  return HAZARD_CHARS.has(level.grid[ty][tx]);
}
