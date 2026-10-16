/* ============================================================
   键盘输入：支持按住 / 本帧按下（边沿）两种查询
   ============================================================ */
const Input = (() => {
  const down = new Set();      // 当前按住的键
  const pressed = new Set();   // 本帧刚按下的键
  const released = new Set();

  const MAP = [
    { // 玩家 1
      left: ['KeyA'],
      right: ['KeyD'],
      jump: ['KeyW'],
      fly: ['KeyS'],
      sprint: ['ShiftLeft'],
      skill: ['KeyJ', 'KeyK'],
    },
    { // 玩家 2
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      jump: ['ArrowUp'],
      fly: ['ArrowDown'],
      sprint: ['ShiftRight', 'Numpad0'],
      skill: ['Slash', 'Numpad1'],
    },
  ];

  const GLOBAL = {
    confirm: ['Enter', 'Space', 'NumpadEnter'],
    pause: ['Escape', 'KeyP'],
    restart: ['KeyR'],
    mute: ['KeyM'],
    debug: ['F3'],
  };

  const BLOCK = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash',
    'Tab', 'Enter', 'Numpad0', 'Numpad1', 'F3',
  ]);

  function onKeyDown(e) {
    if (BLOCK.has(e.code) || e.code === 'Space') e.preventDefault();
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
  }

  function onKeyUp(e) {
    down.delete(e.code);
    released.add(e.code);
  }

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { down.clear(); pressed.clear(); });

  function any(codes) {
    for (let i = 0; i < codes.length; i++) if (down.has(codes[i])) return true;
    return false;
  }
  function anyPressed(codes) {
    for (let i = 0; i < codes.length; i++) if (pressed.has(codes[i])) return true;
    return false;
  }

  return {
    /** 某玩家某动作是否按住 */
    hold(p, action) {
      const codes = MAP[p][action];
      return codes ? any(codes) : false;
    },
    /** 某玩家某动作本帧是否刚按下 */
    hit(p, action) {
      const codes = MAP[p][action];
      return codes ? anyPressed(codes) : false;
    },
    /** 全局动作：按住 */
    down(action) { return any(GLOBAL[action]); },
    /** 全局动作：本帧按下 */
    press(action) { return anyPressed(GLOBAL[action]); },
    /** 每帧末尾清理边沿状态 */
    endFrame() { pressed.clear(); released.clear(); },
    get keys() { return MAP; },
    get global() { return GLOBAL; },
  };
})();
