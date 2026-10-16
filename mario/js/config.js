/* ============================================================
   全局配置：所有手感参数集中在这里，方便调参
   ============================================================ */
const CONFIG = {
  TILE: 32,
  VIEW_W: 960,
  VIEW_H: 544,

  /* ---- 重力与下落 ---- */
  GRAVITY: 2100,        // 正常重力 px/s^2
  GRAVITY_HOLD: 1000,   // 按住跳跃键且正在上升时的重力（可变跳高）
  MAX_FALL: 1250,       // 最大下落速度
  JUMP_V: 620,          // 起跳初速度
  JUMP_HOLD_MAX: 0.30,  // 可变跳最长时间，超过则全重力
  JUMP_CUT_V: 340,      // 上升中松开跳跃键，速度立刻衰减到此值（小跳）
  COYOTE: 0.10,         // 土狼时间
  JUMP_BUFFER: 0.12,    // 跳跃输入缓冲

  /* ---- 移动 ---- */
  RUN_MAX: 205,         // 普通最高速
  SPRINT_MAX: 350,      // 冲刺最高速
  RUN_ACC: 1500,        // 普通加速度
  SPRINT_ACC: 2100,     // 冲刺加速度
  AIR_ACC: 1200,        // 空中加速度
  GROUND_FRICTION: 2600,
  AIR_FRICTION: 320,
  TURN_DECEL: 4200,     // 反向转身减速

  /* ---- 飞行（最多 5 秒） ---- */
  FLY_MAX: 5.0,         // 单次飞行总时长（秒）
  FLY_THRUST: 2300,     // 向上推力
  FLY_UP_MAX: 300,      // 飞行最大上升速度
  FLY_GRAVITY: 520,     // 飞行中的重力
  FLY_REFILL: 1.4,      // 落地每秒回充（秒/秒）
  FLY_COIN: 0.8,        // 吃金币补充的飞行时间
  FLY_ACC_MULT: 1.3,    // 飞行时空中操控加成
  FLY_MIN_TAKEOFF: 0.12,

  /* ---- 身体 ---- */
  PLAYER_W: 22,
  PLAYER_H: 30,
  PLAYER_MAX_HP: 3,
  INVULN_TIME: 1.5,
  KO_REVIVE: 8.0,

  /* ---- 技能 ---- */
  FIRE_CD: 0.85,        // 火焰弹冷却
  FIRE_SPEED: 470,
  FIRE_LIFE: 2.6,
  DASH_CD: 2.2,         // 旋风冲刺冷却
  DASH_TIME: 0.40,
  DASH_SPEED: 560,

  /* ---- 敌人与关卡物件 ---- */
  ENEMY_SPEED: 62,
  FLYER_SPEED: 78,
  STOMP_BOUNCE: 430,
  SPRING_V: 1020,
  COMBO_TIME: 2.0,

  /* ---- 分数 ---- */
  SCORE_COIN: 100,
  SCORE_BLOCK: 200,
  SCORE_STOMP: 200,
  SCORE_GOAL: 1000,
  TIME_BONUS: 20,       // 每剩余（未超时）1 秒的分数权重
  PAR_TIME: 180,        // 标准通关时间，用于时间奖励
};

/* 玩家配色 */
const PALETTES = [
  { name: '小红', cap: '#e63b3b', capDark: '#a81f26', shirt: '#e63b3b', shirtDark: '#a81f26',
    pants: '#2f5bd8', pantsDark: '#1f3d9c', skin: '#ffcfa3', skinDark: '#e0a273', hair: '#4a2812',
    shoe: '#5b3312', accent: '#ff5a5f', ui: '#ff5a5f' },
  { name: '小绿', cap: '#2fbf63', capDark: '#1c8746', shirt: '#2fbf63', shirtDark: '#1c8746',
    pants: '#2f5bd8', pantsDark: '#1f3d9c', skin: '#ffcfa3', skinDark: '#e0a273', hair: '#4a2812',
    shoe: '#5b3312', accent: '#46d17f', ui: '#46d17f' },
];

/* 小工具 */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const approach = (v, target, delta) => (v < target ? Math.min(v + delta, target) : Math.max(v - delta, target));
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
