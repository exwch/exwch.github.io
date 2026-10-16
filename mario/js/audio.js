/* ============================================================
   WebAudio 音效合成：不依赖任何音频文件
   ============================================================ */
const AudioFX = {
  ctx: null,
  master: null,
  muted: false,

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null;
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  },

  /** 单个音符 */
  tone({ freq = 440, to = null, dur = 0.12, type = 'square', vol = 0.5, delay = 0 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  noise({ dur = 0.16, vol = 0.4, delay = 0, lp = 1200 }) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t0);
  },

  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone({ freq: 420, to: 780, dur: 0.13, type: 'square', vol: 0.35 });
        break;
      case 'bigjump':
        this.tone({ freq: 360, to: 980, dur: 0.2, type: 'square', vol: 0.4 });
        break;
      case 'fly':
        this.tone({ freq: 220, to: 620, dur: 0.22, type: 'triangle', vol: 0.3 });
        break;
      case 'coin':
        this.tone({ freq: 988, dur: 0.08, type: 'square', vol: 0.36 });
        this.tone({ freq: 1319, dur: 0.16, type: 'square', vol: 0.34, delay: 0.07 });
        break;
      case 'block':
        this.tone({ freq: 300, to: 120, dur: 0.1, type: 'square', vol: 0.4 });
        this.noise({ dur: 0.08, vol: 0.22, lp: 900 });
        break;
      case 'brick':
        this.noise({ dur: 0.22, vol: 0.4, lp: 2600 });
        break;
      case 'stomp':
        this.tone({ freq: 180, to: 520, dur: 0.12, type: 'square', vol: 0.4 });
        this.noise({ dur: 0.1, vol: 0.2, lp: 1500 });
        break;
      case 'hurt':
        this.tone({ freq: 420, to: 90, dur: 0.34, type: 'sawtooth', vol: 0.42 });
        break;
      case 'skill':
        this.tone({ freq: 660, to: 990, dur: 0.1, type: 'square', vol: 0.34 });
        break;
      case 'fire':
        this.tone({ freq: 900, to: 220, dur: 0.16, type: 'sawtooth', vol: 0.3 });
        break;
      case 'dash':
        this.noise({ dur: 0.24, vol: 0.34, lp: 3200 });
        this.tone({ freq: 300, to: 900, dur: 0.18, type: 'triangle', vol: 0.3 });
        break;
      case 'spring':
        this.tone({ freq: 300, to: 1200, dur: 0.2, type: 'square', vol: 0.36 });
        break;
      case 'ko':
        this.tone({ freq: 380, to: 70, dur: 0.6, type: 'triangle', vol: 0.45 });
        break;
      case 'revive':
        [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.14, vol: 0.32, delay: i * 0.09 }));
        break;
      case 'goal':
        [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.18, vol: 0.36, delay: i * 0.12 }));
        break;
      case 'start':
        [392, 523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.15, vol: 0.34, delay: i * 0.1 }));
        break;
      case 'gameover':
        [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, dur: 0.26, vol: 0.4, delay: i * 0.18 }));
        break;
      default: break;
    }
  },
};
