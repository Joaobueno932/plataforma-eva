/* =============================================================
   Eva no Lixo Zero — plataforma
   v2.0 — arte, áudio e feedback reconstruídos
   ============================================================= */
(() => {
  'use strict';

  /* =========================================================
     1. DOM
     ========================================================= */
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const overlay = document.getElementById('overlay');
  const overlayKicker = document.getElementById('overlayKicker');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayBody = document.getElementById('overlayBody');
  const overlayActions = document.getElementById('overlayActions');
  const loader = document.getElementById('loader');

  const soundBtn = document.getElementById('soundBtn');
  const soundGlyph = document.getElementById('soundGlyph');
  const howBtn = document.getElementById('howBtn');
  const helpDialog = document.getElementById('helpDialog');
  const closeHelp = document.getElementById('closeHelp');
  const touchControls = document.getElementById('touchControls');

  const musicVolInput = document.getElementById('musicVol');
  const sfxVolInput = document.getElementById('sfxVol');
  const musicVolOut = document.getElementById('musicVolOut');
  const sfxVolOut = document.getElementById('sfxVolOut');

  const hud = {
    level: document.getElementById('hudLevel'),
    levelName: document.getElementById('hudLevelName'),
    score: document.getElementById('hudScore'),
    lives: document.getElementById('hudLives'),
    collect: document.getElementById('hudCollect'),
    meter: document.getElementById('hudMeter'),
    meterFill: document.getElementById('meterFill'),
    time: document.getElementById('hudTime'),
    bestScore: document.getElementById('bestScore'),
    bestTime: document.getElementById('bestTime')
  };

  const VW = 960;
  const VH = 540;
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     2. Áudio: trilha procedural + efeitos sintetizados
     ========================================================= */
  const Sound = (() => {
    let ac = null;
    let master, comp, musicBus, sfxBus, echo, echoGain;
    let noiseBuffer = null;
    let muted = false;
    let musicVol = 0.55;
    let sfxVol = 0.75;

    let timerId = null;
    let nextStepTime = 0;
    let stepIndex = 0;
    let theme = null;
    const LOOKAHEAD = 0.12;
    const TICK_MS = 25;

    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function boot() {
      if (ac) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();

      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 22;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      comp.connect(ac.destination);

      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(comp);

      musicBus = ac.createGain();
      musicBus.gain.value = musicVol;
      musicBus.connect(master);

      sfxBus = ac.createGain();
      sfxBus.gain.value = sfxVol;
      sfxBus.connect(master);

      // eco curto para dar ar de "espaço" às notas agudas
      echo = ac.createDelay(1);
      echo.delayTime.value = 0.24;
      const fb = ac.createGain();
      fb.gain.value = 0.24;
      const damp = ac.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2000;
      echo.connect(damp);
      damp.connect(fb);
      fb.connect(echo);
      echoGain = ac.createGain();
      echoGain.gain.value = 0.5;
      echo.connect(echoGain);
      echoGain.connect(master);

      const len = ac.sampleRate * 1.2;
      noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      return ac;
    }

    function unlock() {
      boot();
      if (ac && ac.state === 'suspended') ac.resume();
    }

    /* ---- blocos básicos ---- */
    function tone(o) {
      if (!ac) return;
      const t0 = o.at != null ? o.at : ac.currentTime;
      const dur = o.dur || 0.2;
      const dest = o.bus || sfxBus;
      const osc = ac.createOscillator();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);

      let node = osc;
      if (o.cutoff) {
        const f = ac.createBiquadFilter();
        f.type = o.filterType || 'lowpass';
        f.frequency.setValueAtTime(o.cutoff, t0);
        if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.cutoffTo), t0 + dur);
        f.Q.value = o.q || 1;
        node.connect(f);
        node = f;
      }

      const g = ac.createGain();
      const peak = o.gain != null ? o.gain : 0.12;
      const atk = o.attack != null ? o.attack : 0.008;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      node.connect(g);
      g.connect(dest);
      if (o.send) {
        const s = ac.createGain();
        s.gain.value = o.send;
        g.connect(s);
        s.connect(echo);
      }

      // segundo oscilador levemente desafinado engrossa o timbre
      if (o.detune) {
        const osc2 = ac.createOscillator();
        osc2.type = o.type || 'square';
        osc2.frequency.setValueAtTime(o.freq, t0);
        if (o.to) osc2.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
        osc2.detune.value = o.detune;
        const g2 = ac.createGain();
        g2.gain.setValueAtTime(0.0001, t0);
        g2.gain.linearRampToValueAtTime(peak * 0.5, t0 + atk);
        g2.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc2.connect(g2);
        g2.connect(dest);
        osc2.start(t0);
        osc2.stop(t0 + dur + 0.05);
      }

      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function noise(o) {
      if (!ac || !noiseBuffer) return;
      const t0 = o.at != null ? o.at : ac.currentTime;
      const dur = o.dur || 0.1;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = o.filterType || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + dur);
      f.Q.value = o.q || 1;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(o.gain != null ? o.gain : 0.08, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(o.bus || sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    /* ---- efeitos ---- */
    const KIND_STEP = { paper: 0, plastic: 2, metal: 4, glass: 7 };

    const sfx = {
      jump() {
        const t = ac.currentTime;
        tone({ at: t, freq: 300, to: 620, dur: 0.11, type: 'square', gain: 0.11, cutoff: 2600 });
        noise({ at: t, freq: 900, to: 2600, dur: 0.09, gain: 0.035, filterType: 'highpass' });
      },
      land() {
        const t = ac.currentTime;
        tone({ at: t, freq: 150, to: 58, dur: 0.13, type: 'sine', gain: 0.13 });
        noise({ at: t, freq: 700, to: 220, dur: 0.11, gain: 0.05, filterType: 'lowpass' });
      },
      coin(kind) {
        const t = ac.currentTime;
        const base = 76 + (KIND_STEP[kind] || 0);
        [0, 4, 7].forEach((iv, i) => {
          tone({
            at: t + i * 0.045, freq: mtof(base + iv), dur: 0.14,
            type: 'triangle', gain: 0.11, send: 0.22, detune: 6
          });
        });
        noise({ at: t, freq: 7000, dur: 0.06, gain: 0.03, filterType: 'highpass' });
      },
      unlock() {
        const t = ac.currentTime;
        [72, 76, 79, 84, 88].forEach((n, i) => {
          tone({ at: t + i * 0.08, freq: mtof(n), dur: 0.35, type: 'triangle', gain: 0.1, send: 0.4 });
        });
      },
      hurt() {
        const t = ac.currentTime;
        tone({ at: t, freq: 320, to: 70, dur: 0.34, type: 'sawtooth', gain: 0.13, cutoff: 1600, cutoffTo: 260 });
        noise({ at: t, freq: 1400, to: 300, dur: 0.3, gain: 0.06, filterType: 'bandpass', q: 0.8 });
      },
      levelWin() {
        const t = ac.currentTime;
        [72, 76, 79, 84].forEach((n, i) => {
          tone({ at: t + i * 0.1, freq: mtof(n), dur: 0.32, type: 'triangle', gain: 0.12, send: 0.3, detune: 8 });
        });
        tone({ at: t + 0.4, freq: mtof(48), dur: 0.6, type: 'sine', gain: 0.12 });
      },
      gameWin() {
        const t = ac.currentTime;
        [72, 74, 76, 79, 81, 84, 88].forEach((n, i) => {
          tone({ at: t + i * 0.11, freq: mtof(n), dur: 0.4, type: 'triangle', gain: 0.12, send: 0.35, detune: 8 });
        });
        [60, 64, 67, 72].forEach((n) => {
          tone({ at: t + 0.8, freq: mtof(n), dur: 1.4, type: 'sine', gain: 0.08, send: 0.3 });
        });
      },
      gameOver() {
        const t = ac.currentTime;
        [69, 65, 62, 57].forEach((n, i) => {
          tone({ at: t + i * 0.16, freq: mtof(n), dur: 0.5, type: 'sawtooth', gain: 0.09, cutoff: 1100, send: 0.25 });
        });
      },
      ui() {
        tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.05, cutoff: 3000 });
      },
      pause() {
        const t = ac.currentTime;
        tone({ at: t, freq: 520, dur: 0.09, type: 'triangle', gain: 0.08 });
        tone({ at: t + 0.07, freq: 340, dur: 0.12, type: 'triangle', gain: 0.08 });
      },
      resume() {
        const t = ac.currentTime;
        tone({ at: t, freq: 340, dur: 0.09, type: 'triangle', gain: 0.08 });
        tone({ at: t + 0.07, freq: 560, dur: 0.12, type: 'triangle', gain: 0.08 });
      }
    };

    function play(name, arg) {
      if (muted) return;
      boot();
      if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      const fn = sfx[name];
      if (fn) fn(arg);
    }

    /* ---- trilhas ---- */
    // Cada tema tem 4 compassos. Melodia e baixo em colcheias, bateria em semicolcheias.
    const THEMES = [
      {
        name: 'manha',
        bpm: 108,
        wave: 'square',
        prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
        melody: [
          72, null, 76, 79, null, 76, 72, null,
          69, null, 72, 76, null, 72, 69, null,
          65, 69, 72, null, 74, 72, 69, null,
          67, 71, 74, null, 79, 78, 79, null
        ],
        bassPat: [0, null, 12, null, 7, null, 0, 7],
        kick: [1, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0.5, 0],
        snare: [0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0.3],
        hat: [0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.3, 0, 0.5, 0, 0.35, 0.2],
        padGain: 0.035,
        leadGain: 0.075
      },
      {
        name: 'entardecer',
        bpm: 122,
        wave: 'sawtooth',
        prog: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]],
        melody: [
          69, null, 72, 74, 76, null, 74, 72,
          65, null, 69, 72, 74, null, 72, 69,
          67, null, 72, 76, 79, null, 76, 72,
          74, 72, 71, 69, 67, null, 69, null
        ],
        bassPat: [0, null, 0, 7, null, 12, 7, null],
        kick: [1, 0, 0, 0.4, 0, 0, 0.6, 0, 0.9, 0, 0, 0, 0, 0, 0.6, 0],
        snare: [0, 0, 0, 0, 0.85, 0, 0, 0.2, 0, 0, 0, 0, 0.85, 0, 0, 0.35],
        hat: [0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.35, 0.2, 0.5, 0.2, 0.45, 0.3],
        padGain: 0.04,
        leadGain: 0.07
      },
      {
        name: 'noite',
        bpm: 134,
        wave: 'square',
        prog: [[64, 67, 71], [60, 64, 67], [55, 59, 62], [62, 66, 69]],
        melody: [
          76, null, 79, 83, null, 81, 79, 76,
          72, null, 76, 79, null, 76, 72, null,
          74, 78, 81, null, 83, 81, 78, 74,
          81, 79, 78, 76, 74, null, 71, null
        ],
        bassPat: [0, 0, 12, 0, 7, 0, 12, 7],
        kick: [1, 0, 0, 0.5, 0, 0, 0.7, 0, 0.95, 0, 0.4, 0, 0, 0.5, 0.6, 0],
        snare: [0, 0, 0, 0, 0.9, 0, 0, 0.25, 0, 0, 0, 0.2, 0.9, 0, 0, 0.4],
        hat: [0.55, 0.25, 0.4, 0.25, 0.55, 0.25, 0.4, 0.25, 0.55, 0.25, 0.4, 0.25, 0.55, 0.3, 0.5, 0.35],
        padGain: 0.045,
        leadGain: 0.08
      }
    ];

    function kickAt(t, v) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.32 * v, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g);
      g.connect(musicBus);
      osc.start(t);
      osc.stop(t + 0.24);
    }

    function snareAt(t, v) {
      noise({ at: t, freq: 1900, dur: 0.14, gain: 0.09 * v, filterType: 'bandpass', q: 0.7, bus: musicBus });
      tone({ at: t, freq: 210, to: 150, dur: 0.09, type: 'triangle', gain: 0.05 * v, bus: musicBus });
    }

    function hatAt(t, v) {
      noise({ at: t, freq: 8200, dur: 0.035, gain: 0.028 * v, filterType: 'highpass', bus: musicBus });
    }

    function scheduleStep(t, s) {
      const bars = theme.prog.length;
      const total = bars * 16;
      const pos = s % total;
      const bar = Math.floor(pos / 16);
      const i16 = pos % 16;
      const chord = theme.prog[bar];

      if (theme.kick[i16]) kickAt(t, theme.kick[i16]);
      if (theme.snare[i16]) snareAt(t, theme.snare[i16]);
      if (theme.hat[i16]) hatAt(t, theme.hat[i16]);

      const beat = 60 / theme.bpm;

      if (i16 % 2 === 0) {
        const i8 = pos / 2;
        const mel = theme.melody[i8];
        if (mel != null) {
          tone({
            at: t, freq: mtof(mel), dur: beat * 0.46, type: theme.wave,
            gain: theme.leadGain, cutoff: 3200, cutoffTo: 1400, send: 0.2, detune: 7, bus: musicBus
          });
        }
        const bp = theme.bassPat[i8 % 8];
        if (bp != null) {
          tone({
            at: t, freq: mtof(chord[0] - 24 + bp), dur: beat * 0.42,
            type: 'triangle', gain: 0.14, cutoff: 900, bus: musicBus
          });
        }
      }

      // pad no início de cada compasso
      if (i16 === 0) {
        chord.forEach((n) => {
          tone({
            at: t, freq: mtof(n), dur: beat * 3.6, type: 'sine',
            gain: theme.padGain, attack: 0.25, send: 0.25, bus: musicBus
          });
        });
      }
    }

    function tick() {
      if (!ac || !theme) return;
      const stepDur = 60 / theme.bpm / 4;
      while (nextStepTime < ac.currentTime + LOOKAHEAD) {
        scheduleStep(nextStepTime, stepIndex);
        nextStepTime += stepDur;
        stepIndex++;
      }
    }

    function startMusic(index) {
      boot();
      if (!ac) return;
      if (ac.state === 'suspended') ac.resume();
      stopMusic();
      theme = THEMES[index % THEMES.length];
      stepIndex = 0;
      nextStepTime = ac.currentTime + 0.08;
      timerId = setInterval(tick, TICK_MS);
    }

    function stopMusic() {
      if (timerId) clearInterval(timerId);
      timerId = null;
    }

    function pauseMusic() { stopMusic(); }

    function resumeMusic() {
      if (!ac || !theme || timerId) return;
      if (ac.state === 'suspended') ac.resume();
      nextStepTime = ac.currentTime + 0.08;
      timerId = setInterval(tick, TICK_MS);
    }

    function setMuted(v) {
      muted = v;
      if (master && ac) {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setTargetAtTime(v ? 0 : 1, ac.currentTime, 0.05);
      }
      if (v) stopMusic();
    }

    function setMusicVol(v) {
      musicVol = v;
      if (musicBus && ac) musicBus.gain.setTargetAtTime(v, ac.currentTime, 0.05);
    }

    function setSfxVol(v) {
      sfxVol = v;
      if (sfxBus && ac) sfxBus.gain.setTargetAtTime(v, ac.currentTime, 0.05);
    }

    return {
      unlock, play, startMusic, stopMusic, pauseMusic, resumeMusic,
      setMuted, setMusicVol, setSfxVol,
      isMuted: () => muted,
      isPlaying: () => !!timerId
    };
  })();

  /* =========================================================
     3. Fases e paletas
     ========================================================= */
  const levels = [
    {
      name: 'Parque da Reciclagem',
      period: 'Manhã',
      width: 2400,
      spawn: { x: 120, y: 360 },
      portal: { x: 2250, y: 310, w: 56, h: 80 },
      platforms: [
        { x: 0, y: 470, w: 2400, h: 100, type: 'ground' },
        { x: 280, y: 385, w: 220, h: 22 },
        { x: 590, y: 330, w: 150, h: 22 },
        { x: 835, y: 280, w: 180, h: 22 },
        { x: 1080, y: 350, w: 170, h: 22 },
        { x: 1320, y: 300, w: 170, h: 22 },
        { x: 1570, y: 245, w: 160, h: 22 },
        { x: 1780, y: 370, w: 220, h: 22 }
      ],
      collectibles: [
        { x: 355, y: 345, kind: 'paper' },
        { x: 640, y: 290, kind: 'plastic' },
        { x: 905, y: 240, kind: 'metal' },
        { x: 1155, y: 310, kind: 'glass' },
        { x: 1410, y: 260, kind: 'paper' },
        { x: 1645, y: 205, kind: 'plastic' },
        { x: 1885, y: 330, kind: 'metal' }
      ],
      enemies: [
        { x: 720, y: 438, w: 36, h: 32, left: 660, right: 980, speed: 90 },
        { x: 1480, y: 438, w: 36, h: 32, left: 1360, right: 1740, speed: 75 }
      ],
      seed: 1
    },
    {
      name: 'Distrito Sustentável',
      period: 'Entardecer',
      width: 2900,
      spawn: { x: 120, y: 360 },
      portal: { x: 2745, y: 320, w: 56, h: 80 },
      platforms: [
        { x: 0, y: 470, w: 2900, h: 100, type: 'ground' },
        { x: 240, y: 390, w: 160, h: 22 },
        { x: 500, y: 330, w: 160, h: 22 },
        { x: 770, y: 265, w: 150, h: 22 },
        { x: 980, y: 205, w: 150, h: 22 },
        { x: 1220, y: 275, w: 180, h: 22 },
        { x: 1460, y: 350, w: 150, h: 22 },
        { x: 1720, y: 295, w: 190, h: 22 },
        { x: 2010, y: 235, w: 150, h: 22 },
        { x: 2260, y: 315, w: 170, h: 22 },
        { x: 2490, y: 250, w: 160, h: 22 }
      ],
      collectibles: [
        { x: 300, y: 350, kind: 'glass' },
        { x: 565, y: 290, kind: 'paper' },
        { x: 830, y: 225, kind: 'plastic' },
        { x: 1040, y: 165, kind: 'metal' },
        { x: 1310, y: 235, kind: 'glass' },
        { x: 1535, y: 310, kind: 'paper' },
        { x: 1805, y: 255, kind: 'plastic' },
        { x: 2065, y: 195, kind: 'metal' },
        { x: 2340, y: 275, kind: 'glass' },
        { x: 2565, y: 210, kind: 'paper' }
      ],
      enemies: [
        { x: 640, y: 438, w: 36, h: 32, left: 540, right: 880, speed: 85 },
        { x: 1650, y: 438, w: 36, h: 32, left: 1500, right: 1930, speed: 110 },
        { x: 2390, y: 438, w: 36, h: 32, left: 2280, right: 2640, speed: 90 }
      ],
      seed: 2
    },
    {
      name: 'Rota Lixo Zero',
      period: 'Noite',
      width: 3400,
      spawn: { x: 120, y: 360 },
      portal: { x: 3220, y: 300, w: 56, h: 80 },
      platforms: [
        { x: 0, y: 470, w: 3400, h: 100, type: 'ground' },
        { x: 270, y: 380, w: 170, h: 22 },
        { x: 520, y: 300, w: 170, h: 22 },
        { x: 760, y: 225, w: 170, h: 22 },
        { x: 1010, y: 290, w: 160, h: 22 },
        { x: 1260, y: 350, w: 180, h: 22 },
        { x: 1540, y: 275, w: 180, h: 22 },
        { x: 1800, y: 215, w: 180, h: 22 },
        { x: 2050, y: 285, w: 180, h: 22 },
        { x: 2330, y: 355, w: 180, h: 22 },
        { x: 2600, y: 290, w: 180, h: 22 },
        { x: 2860, y: 225, w: 180, h: 22 }
      ],
      collectibles: [
        { x: 335, y: 340, kind: 'paper' },
        { x: 595, y: 260, kind: 'metal' },
        { x: 835, y: 185, kind: 'glass' },
        { x: 1085, y: 250, kind: 'plastic' },
        { x: 1360, y: 310, kind: 'paper' },
        { x: 1635, y: 235, kind: 'metal' },
        { x: 1890, y: 175, kind: 'glass' },
        { x: 2145, y: 245, kind: 'plastic' },
        { x: 2415, y: 315, kind: 'paper' },
        { x: 2695, y: 250, kind: 'metal' },
        { x: 2950, y: 185, kind: 'glass' }
      ],
      enemies: [
        { x: 700, y: 438, w: 36, h: 32, left: 610, right: 975, speed: 115 },
        { x: 1710, y: 438, w: 36, h: 32, left: 1600, right: 1990, speed: 95 },
        { x: 2520, y: 438, w: 36, h: 32, left: 2400, right: 2810, speed: 120 }
      ],
      seed: 3
    }
  ];

  const PALETTES = [
    { // manhã
      night: false,
      sky: [[0, '#4FBFEC'], [0.4, '#93DEF2'], [0.72, '#D6F4E4'], [1, '#F1FBE6']],
      celestial: { x: 0.8, y: 0.15, r: 46, core: '#FFF6C4', glow: 'rgba(255,240,160,0.34)' },
      cloud: 'rgba(255,255,255,0.82)',
      far: '#9AD3B6', mid: '#6FBB8E', near: '#4E9E72',
      tree: '#3E8C60', treeDark: '#2F7350',
      city: '#88CBA9', window: null,
      turbine: 'rgba(255,255,255,0.55)',
      soil: ['#8A5C36', '#5E3B22'],
      grass: ['#8FDE79', '#4FA65B'],
      plank: ['#A9713F', '#7A4C28'],
      fog: 'rgba(210,245,225,0.10)',
      ambient: { kind: 'pollen', color: 'rgba(255,255,205,0.8)' },
      vignette: 0.2,
      textOnLight: true
    },
    { // entardecer
      night: false,
      sky: [[0, '#2F5D9E'], [0.34, '#8A6BB0'], [0.62, '#FF9A62'], [0.86, '#FFC98A'], [1, '#FFE3B8']],
      celestial: { x: 0.72, y: 0.55, r: 58, core: '#FFE7A8', glow: 'rgba(255,170,90,0.4)' },
      cloud: 'rgba(255,205,175,0.72)',
      far: '#7B6E9E', mid: '#5C6A83', near: '#3E5A5C',
      tree: '#2F4F4C', treeDark: '#233D3D',
      city: '#6B6790', window: 'rgba(255,196,110,0.85)',
      turbine: 'rgba(255,225,200,0.45)',
      soil: ['#7A4E33', '#4B2F1F'],
      grass: ['#71A867', '#3D7A4C'],
      plank: ['#96613A', '#6A4124'],
      fog: 'rgba(255,170,110,0.12)',
      ambient: { kind: 'leaf', color: 'rgba(255,190,120,0.75)' },
      vignette: 0.3,
      textOnLight: true
    },
    { // noite
      night: true,
      sky: [[0, '#071429'], [0.4, '#0F2544'], [0.72, '#1B3C5E'], [1, '#2A5470']],
      celestial: { x: 0.78, y: 0.16, r: 34, core: '#F3F7FF', glow: 'rgba(190,220,255,0.28)' },
      cloud: 'rgba(140,175,210,0.28)',
      far: '#1B3550', mid: '#16293E', near: '#122234',
      tree: '#0E1D2C', treeDark: '#0A1621',
      city: '#182F49', window: 'rgba(255,198,110,0.9)',
      turbine: 'rgba(180,210,240,0.35)',
      soil: ['#3B2E44', '#241D2C'],
      grass: ['#3E8C6B', '#215744'],
      plank: ['#5A4230', '#3A2A1E'],
      fog: 'rgba(60,110,160,0.14)',
      ambient: { kind: 'firefly', color: 'rgba(180,255,170,0.95)' },
      vignette: 0.42,
      textOnLight: false
    }
  ];

  const KIND_COLORS = {
    paper: { main: '#BFE4FF', edge: '#5EA7DE', aura: 'rgba(120,200,255,0.55)' },
    plastic: { main: '#FFE49A', edge: '#D9A63C', aura: 'rgba(255,215,120,0.55)' },
    metal: { main: '#DDE6F2', edge: '#8FA0B8', aura: 'rgba(200,220,245,0.5)' },
    glass: { main: '#A9F3D0', edge: '#3FA97C', aura: 'rgba(120,240,190,0.5)' }
  };

  const KIND_LABEL = { paper: 'Papel', plastic: 'Plástico', metal: 'Metal', glass: 'Vidro' };

  /* =========================================================
     4. Estado
     ========================================================= */
  const STORAGE_KEY = 'eva_lixo_zero_platformer_records';
  const SETTINGS_KEY = 'eva_lixo_zero_settings';

  const GRAVITY = 2000;
  const MAX_FALL = 1500;
  const MODE = { LOADING: 'loading', MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', DIALOG: 'dialog' };

  const sprites = {};
  const spriteSources = {
    idle: 'assets/eva_idle.png',
    run1: 'assets/eva_run1.png',
    run2: 'assets/eva_run2.png',
    jump: 'assets/eva_jump.png'
  };

  const keys = { left: false, right: false, jump: false };
  let jumpQueued = false;
  let jumpReleased = true;

  const state = {
    mode: MODE.LOADING,
    levelIndex: 0,
    score: 0,
    lives: 3,
    levelElapsed: 0,
    totalElapsed: 0,
    cameraX: 0,
    shake: 0,
    hitstop: 0,
    time: 0,
    flash: { text: '', sub: '', timer: 0 },
    banner: { text: '', sub: '', timer: 0 },
    tint: { color: null, alpha: 0 },
    player: null,
    level: null,
    palette: PALETTES[0],
    decor: null
  };

  let records = loadJSON(STORAGE_KEY, { bestScore: 0, bestTime: null });
  const settings = loadJSON(SETTINGS_KEY, { muted: false, music: 55, sfx: 75 });

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* modo privado */ }
  }

  function createPlayer() {
    return {
      x: 0, y: 0, w: 56, h: 72,
      vx: 0, vy: 0,
      speed: 320, jumpPower: 760,
      onGround: false, facing: 1,
      animTime: 0, sprite: 'idle',
      respawnX: 0, respawnY: 0,
      hurtCooldown: 0,
      coyote: 0, buffer: 0,
      squash: 0, dustTimer: 0
    };
  }

  /* =========================================================
     5. Partículas, popups, decoração
     ========================================================= */
  const particles = [];
  const popups = [];
  const MAX_PARTICLES = REDUCED ? 60 : 260;

  function emit(cfg, count) {
    if (REDUCED && cfg.kind !== 'ring') count = Math.ceil(count / 3);
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const spread = cfg.spread != null ? cfg.spread : Math.PI * 2;
      const angle = (cfg.angle != null ? cfg.angle : 0) + (Math.random() - 0.5) * spread;
      const speed = cfg.speed * (0.45 + Math.random() * 0.75);
      const life = cfg.life * (0.65 + Math.random() * 0.6);
      particles.push({
        kind: cfg.kind || 'dust',
        x: cfg.x + (Math.random() - 0.5) * (cfg.jitter || 0),
        y: cfg.y + (Math.random() - 0.5) * (cfg.jitter || 0),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        grav: cfg.grav != null ? cfg.grav : 0,
        drag: cfg.drag != null ? cfg.drag : 1.4,
        size: cfg.size * (0.6 + Math.random() * 0.8),
        color: cfg.color,
        life, maxLife: life,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 8
      });
    }
  }

  function emitRing(x, y, color, radius) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      kind: 'ring', x, y, vx: 0, vy: 0, grav: 0, drag: 1,
      size: radius, color, life: 0.45, maxLife: 0.45, rot: 0, vr: 0
    });
  }

  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 1.05, maxLife: 1.05 });
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt * 0.3;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const q = popups[i];
      q.life -= dt;
      q.y -= 34 * dt;
      if (q.life <= 0) popups.splice(i, 1);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const t = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, t));
      if (p.kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - t * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === 'dust' ? (1.3 - t * 0.4) : t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPopups() {
    ctx.save();
    ctx.textAlign = 'center';
    for (const q of popups) {
      const t = q.life / q.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.font = '700 19px "JetBrains Mono", monospace';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(6,20,14,0.65)';
      ctx.strokeText(q.text, q.x, q.y);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.restore();
  }

  // ruído determinístico para decoração estável
  function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function buildDecor(level, palette) {
    const seed = level.seed * 100;
    const clouds = [];
    const cloudCount = palette.night ? 5 : 9;
    for (let i = 0; i < cloudCount; i++) {
      clouds.push({
        x: hash(seed + i) * level.width,
        y: 40 + hash(seed + i * 3.7) * 130,
        s: 0.55 + hash(seed + i * 5.1) * 0.9,
        speed: 4 + hash(seed + i * 2.3) * 9
      });
    }
    const stars = [];
    if (palette.night) {
      for (let i = 0; i < 90; i++) {
        stars.push({
          x: hash(seed + i * 1.7) * VW,
          y: hash(seed + i * 9.3) * 300,
          r: 0.6 + hash(seed + i * 4.4) * 1.4,
          ph: hash(seed + i * 6.6) * 6.28
        });
      }
    }
    const trees = [];
    for (let i = 0; i < Math.ceil(level.width / 150); i++) {
      trees.push({
        x: i * 150 + hash(seed + i * 8.2) * 90,
        s: 0.7 + hash(seed + i * 3.3) * 0.7,
        tone: hash(seed + i * 7.1)
      });
    }
    const turbines = [];
    for (let i = 0; i < 5; i++) {
      turbines.push({
        x: 120 + i * 260 + hash(seed + i * 11.3) * 70,
        h: 90 + hash(seed + i * 2.9) * 55,
        ph: hash(seed + i * 5.5) * 6.28,
        sp: 0.6 + hash(seed + i * 1.9) * 0.5
      });
    }
    const ambient = [];
    const ambCount = REDUCED ? 8 : 26;
    for (let i = 0; i < ambCount; i++) {
      ambient.push({
        x: Math.random() * VW,
        y: Math.random() * VH,
        s: 0.8 + Math.random() * 1.8,
        vx: -6 - Math.random() * 16,
        vy: -3 + Math.random() * 12,
        ph: Math.random() * 6.28
      });
    }
    return { clouds, stars, trees, turbines, ambient };
  }

  /* =========================================================
     6. Ciclo de vida das fases
     ========================================================= */
  function cloneLevel(data) {
    return {
      ...data,
      platforms: data.platforms.map(p => ({ ...p })),
      collectibles: data.collectibles.map(c => ({ ...c, collected: false, bob: Math.random() * Math.PI * 2 })),
      enemies: data.enemies.map(e => ({ ...e, dir: 1, wobble: Math.random() * 6.28 }))
    };
  }

  function loadLevel(index) {
    state.levelIndex = index;
    state.level = cloneLevel(levels[index]);
    state.palette = PALETTES[index % PALETTES.length];
    state.decor = buildDecor(levels[index], state.palette);
    state.levelElapsed = 0;
    state.cameraX = 0;
    particles.length = 0;
    popups.length = 0;

    const p = state.player = createPlayer();
    p.x = state.level.spawn.x;
    p.y = state.level.spawn.y;
    p.respawnX = p.x;
    p.respawnY = p.y;

    showBanner(`Fase ${index + 1}`, `${levels[index].name} · ${levels[index].period}`);
    Sound.startMusic(index);
    forceHUD();
  }

  function resetGame() {
    state.levelIndex = 0;
    state.score = 0;
    state.lives = 3;
    state.totalElapsed = 0;
    loadLevel(0);
  }

  function showBanner(text, sub) {
    state.banner.text = text;
    state.banner.sub = sub || '';
    state.banner.timer = 2.6;
  }

  function showFlash(text) {
    state.flash.text = text;
    state.flash.timer = 1.6;
  }

  function tintScreen(color, alpha) {
    state.tint.color = color;
    state.tint.alpha = alpha;
  }

  function addShake(v) {
    if (REDUCED) return;
    state.shake = Math.min(18, state.shake + v);
  }

  /* =========================================================
     7. Simulação
     ========================================================= */
  function step(dt) {
    state.time += dt;
    updateAmbient(dt);

    if (state.mode !== MODE.PLAYING) {
      updateParticles(dt);
      decayEffects(dt);
      return;
    }

    if (state.hitstop > 0) {
      state.hitstop -= dt;
      decayEffects(dt);
      return;
    }

    state.levelElapsed += dt;
    const p = state.player;
    const level = state.level;

    // --- movimento horizontal com aceleração ---
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const accel = p.onGround ? 2800 : 1900;
    const target = dir * p.speed;
    if (dir !== 0) {
      p.vx += Math.sign(target - p.vx) * accel * dt;
      if ((target > 0 && p.vx > target) || (target < 0 && p.vx < target)) p.vx = target;
      p.facing = dir > 0 ? 1 : -1;
    } else {
      const friction = (p.onGround ? 3200 : 900) * dt;
      if (Math.abs(p.vx) <= friction) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * friction;
    }

    // --- pulo com coyote time e buffer ---
    p.coyote = p.onGround ? 0.11 : Math.max(0, p.coyote - dt);
    if (jumpQueued) { p.buffer = 0.14; jumpQueued = false; }
    else p.buffer = Math.max(0, p.buffer - dt);

    // segurar o botão faz a Eva pular de novo ao tocar o chão (mais amigável)
    if ((p.buffer > 0 || keys.jump) && p.coyote > 0) {
      p.vy = -p.jumpPower;
      p.onGround = false;
      p.coyote = 0;
      p.buffer = 0;
      p.squash = -0.35;
      Sound.play('jump');
      emit({
        kind: 'dust', x: p.x + p.w / 2, y: p.y + p.h, jitter: 20,
        angle: Math.PI / 2, spread: 2.2, speed: 90, life: 0.4, size: 5,
        color: 'rgba(255,255,255,0.55)', grav: 260
      }, 7);
    }

    // pulo variável: soltar cedo encurta a subida
    if (jumpReleased && p.vy < -260) p.vy = -260;

    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    p.hurtCooldown = Math.max(0, p.hurtCooldown - dt);
    p.animTime += dt;

    const wasOnGround = p.onGround;
    const fallSpeed = p.vy;

    p.x += p.vx * dt;
    resolveCollisions(p, level.platforms, 'x');
    p.x = Math.max(0, Math.min(level.width - p.w, p.x));

    p.y += p.vy * dt;
    p.onGround = false;
    resolveCollisions(p, level.platforms, 'y');

    // aterrissagem
    if (!wasOnGround && p.onGround) {
      const force = Math.min(1, fallSpeed / 900);
      p.squash = 0.3 * force + 0.1;
      if (force > 0.35) {
        Sound.play('land');
        emit({
          kind: 'dust', x: p.x + p.w / 2, y: p.y + p.h, jitter: 26,
          angle: Math.PI, spread: Math.PI * 1.6, speed: 130 * force, life: 0.45, size: 6,
          color: 'rgba(255,255,255,0.5)', grav: 120
        }, Math.round(6 + force * 8));
        addShake(force * 3);
      }
    }

    // poeira ao correr
    if (p.onGround && Math.abs(p.vx) > 180) {
      p.dustTimer -= dt;
      if (p.dustTimer <= 0) {
        p.dustTimer = 0.09;
        emit({
          kind: 'dust', x: p.x + p.w / 2 - p.facing * 12, y: p.y + p.h - 3, jitter: 8,
          angle: -p.facing > 0 ? 0 : Math.PI, spread: 1.2, speed: 55, life: 0.34, size: 4,
          color: 'rgba(255,255,255,0.4)', grav: 90
        }, 1);
      }
    }

    p.squash += (0 - p.squash) * Math.min(1, dt * 11);

    if (p.y > VH + 320) { loseLife('A Eva caiu!'); return; }

    // --- inimigos ---
    for (const enemy of level.enemies) {
      enemy.x += enemy.speed * enemy.dir * dt;
      enemy.wobble += dt * 7;
      if (enemy.x < enemy.left) { enemy.x = enemy.left; enemy.dir = 1; }
      if (enemy.x + enemy.w > enemy.right) { enemy.x = enemy.right - enemy.w; enemy.dir = -1; }
      if (p.hurtCooldown <= 0 && rectOverlap(p.x + 8, p.y + 8, p.w - 16, p.h - 10, enemy.x, enemy.y, enemy.w, enemy.h)) {
        loseLife('Eva encostou no lixo!');
        return;
      }
    }

    // --- coletáveis ---
    for (const item of level.collectibles) {
      item.bob += dt * 2.4;
      if (item.collected) continue;
      if (rectOverlap(p.x, p.y, p.w, p.h, item.x - 16, item.y - 16, 32, 32)) {
        item.collected = true;
        state.score += 100;
        const c = KIND_COLORS[item.kind];
        Sound.play('coin', item.kind);
        addPopup(item.x, item.y - 12, '+100', c.main);
        emitRing(item.x, item.y, c.aura, 16);
        emit({
          kind: 'spark', x: item.x, y: item.y, speed: 170, life: 0.55, size: 3.6,
          color: c.main, grav: 220, drag: 1.1
        }, 14);
        state.hitstop = REDUCED ? 0 : 0.03;

        const remaining = level.collectibles.filter(c2 => !c2.collected).length;
        if (remaining === 0) {
          Sound.play('unlock');
          showFlash('Portal aberto! Corra até ele');
          tintScreen('rgba(120,255,180,0.35)', 0.35);
          addShake(5);
          emitRing(level.portal.x + level.portal.w / 2, level.portal.y + level.portal.h / 2, 'rgba(120,255,180,0.8)', 40);
        } else {
          showFlash(`${KIND_LABEL[item.kind]} reciclado · faltam ${remaining}`);
        }
      }
    }

    // --- portal ---
    const open = level.collectibles.every(c => c.collected);
    if (open && rectOverlap(p.x, p.y, p.w, p.h, level.portal.x, level.portal.y, level.portal.w, level.portal.h)) {
      finishLevel();
      return;
    }
    if (open && !REDUCED && Math.random() < 0.35) {
      emit({
        kind: 'spark', x: level.portal.x + level.portal.w / 2 + (Math.random() - 0.5) * 40,
        y: level.portal.y + level.portal.h, speed: 40, life: 0.9, size: 2.6,
        color: 'rgba(140,255,190,0.9)', grav: -110, drag: 0.6, angle: -Math.PI / 2, spread: 0.8
      }, 1);
    }

    // --- câmera com antecipação ---
    const lookAhead = p.facing * 70;
    const targetX = p.x + p.w / 2 - VW * 0.45 + lookAhead;
    state.cameraX += (targetX - state.cameraX) * Math.min(1, dt * 4.5);
    state.cameraX = clamp(state.cameraX, 0, level.width - VW);

    // --- sprite ---
    if (!p.onGround) p.sprite = 'jump';
    else if (Math.abs(p.vx) > 20) p.sprite = Math.floor(p.animTime * 11) % 2 === 0 ? 'run1' : 'run2';
    else p.sprite = 'idle';

    updateParticles(dt);
    decayEffects(dt);
    updateHUD();
  }

  function decayEffects(dt) {
    if (state.flash.timer > 0) state.flash.timer -= dt;
    if (state.banner.timer > 0) state.banner.timer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.tint.alpha > 0) state.tint.alpha = Math.max(0, state.tint.alpha - dt * 1.6);
  }

  function updateAmbient(dt) {
    if (!state.decor) return;
    for (const a of state.decor.ambient) {
      a.x += a.vx * dt;
      a.y += Math.sin(state.time * 1.4 + a.ph) * 8 * dt + a.vy * dt * 0.4;
      a.ph += dt;
      if (a.x < -20) { a.x = VW + 20; a.y = Math.random() * VH; }
      if (a.y < -20) a.y = VH + 20;
      if (a.y > VH + 20) a.y = -20;
    }
    for (const c of state.decor.clouds) {
      c.x -= c.speed * dt;
      if (c.x < -260) c.x = (state.level ? state.level.width : VW) + 200;
    }
  }

  function resolveCollisions(p, platforms, axis) {
    for (const plat of platforms) {
      if (!rectOverlap(p.x, p.y, p.w, p.h, plat.x, plat.y, plat.w, plat.h)) continue;
      if (axis === 'x') {
        if (p.vx > 0) { p.x = plat.x - p.w; p.vx = 0; }
        else if (p.vx < 0) { p.x = plat.x + plat.w; p.vx = 0; }
      } else {
        if (p.vy > 0) { p.y = plat.y - p.h; p.vy = 0; p.onGround = true; }
        else if (p.vy < 0) { p.y = plat.y + plat.h; p.vy = 0; }
      }
    }
  }

  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function loseLife(msg) {
    const p = state.player;
    state.lives -= 1;
    Sound.play('hurt');
    addShake(12);
    tintScreen('rgba(255,90,70,0.4)', 0.45);
    state.hitstop = REDUCED ? 0 : 0.09;
    emit({
      kind: 'shard', x: p.x + p.w / 2, y: p.y + p.h / 2, speed: 240, life: 0.7, size: 7,
      color: '#FF8B7A', grav: 700, drag: 0.8
    }, 16);
    emitRing(p.x + p.w / 2, p.y + p.h / 2, 'rgba(255,120,100,0.8)', 24);

    if (state.lives <= 0) {
      Sound.stopMusic();
      Sound.play('gameOver');
      if (state.score > (records.bestScore || 0)) { records.bestScore = state.score; saveJSON(STORAGE_KEY, records); }
      state.mode = MODE.MENU;
      forceHUD();
      openOverlay({
        kicker: 'Fim de jogo',
        title: 'A Eva não resistiu',
        body: `<p>${msg}</p>${statsHTML([
          { label: 'Pontos', value: state.score },
          { label: 'Fase', value: `${state.levelIndex + 1}/${levels.length}`, gold: true },
          { label: 'Recorde', value: records.bestScore }
        ])}`,
        actions: [{ label: 'Tentar de novo', primary: true, onClick: startGame }]
      });
      return;
    }

    showFlash(msg);
    p.x = p.respawnX;
    p.y = p.respawnY;
    p.vx = 0;
    p.vy = 0;
    p.hurtCooldown = 1.3;
    state.cameraX = clamp(p.x - VW * 0.45, 0, state.level.width - VW);
    forceHUD();
  }

  function finishLevel() {
    const timeBonus = Math.max(0, Math.floor(1000 - state.levelElapsed * 30));
    state.score += 500 + timeBonus;
    state.totalElapsed += state.levelElapsed;
    state.mode = MODE.MENU;
    Sound.stopMusic();
    addShake(6);
    tintScreen('rgba(255,255,255,0.5)', 0.5);
    forceHUD();

    const isLast = state.levelIndex >= levels.length - 1;
    if (!isLast) {
      Sound.play('levelWin');
      const next = state.levelIndex + 1;
      openOverlay({
        kicker: 'Fase concluída',
        title: levels[state.levelIndex].name,
        body: `<p>Percurso limpo. A próxima etapa é <strong>${levels[next].name}</strong>.</p>${statsHTML([
          { label: 'Bônus de tempo', value: timeBonus, gold: true },
          { label: 'Pontos', value: state.score },
          { label: 'Tempo da fase', value: `${state.levelElapsed.toFixed(1)}s` }
        ])}`,
        actions: [{
          label: `Ir para a fase ${next + 1}`, primary: true,
          onClick: () => { loadLevel(next); state.mode = MODE.PLAYING; }
        }]
      });
    } else {
      Sound.play('gameWin');
      const totalTime = state.totalElapsed;
      let recordeNovo = false;
      if (state.score > (records.bestScore || 0)) { records.bestScore = state.score; recordeNovo = true; }
      if (records.bestTime == null || totalTime < records.bestTime) { records.bestTime = totalTime; recordeNovo = true; }
      saveJSON(STORAGE_KEY, records);
      updateRecordsUI();
      openOverlay({
        kicker: 'Jornada completa',
        title: 'Lixo Zero alcançado',
        body: `<p>A Eva atravessou as três etapas e deixou o caminho limpo.</p>${
          recordeNovo ? '<p><strong>Novo recorde registrado.</strong></p>' : ''
        }${statsHTML([
          { label: 'Pontuação final', value: state.score, gold: true },
          { label: 'Tempo total', value: `${totalTime.toFixed(1)}s` },
          { label: 'Recorde', value: records.bestScore }
        ])}`,
        actions: [{ label: 'Jogar de novo', primary: true, onClick: startGame }]
      });
    }
  }

  function statsHTML(items) {
    return '<div class="overlay-stats">' + items.map(i =>
      `<div class="stat${i.gold ? ' gold' : ''}"><span>${i.label}</span><strong>${i.value}</strong></div>`
    ).join('') + '</div>';
  }

  /* =========================================================
     8. Desenho
     ========================================================= */
  let dpr = 1;
  function fitCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(VW * dpr);
    canvas.height = Math.round(VH * dpr);
  }

  function render() {
    const pal = state.palette;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);

    let sx = 0, sy = 0;
    if (state.shake > 0.1) {
      sx = (Math.random() - 0.5) * state.shake;
      sy = (Math.random() - 0.5) * state.shake;
    }
    ctx.save();
    ctx.translate(sx, sy);

    drawSky(pal);
    drawCelestial(pal);
    if (pal.night) drawStars(pal);
    drawClouds(pal);
    drawHills(pal, 'far');
    drawSkyline(pal);
    drawHills(pal, 'mid');
    drawTurbines(pal);
    drawTreeline(pal);

    ctx.save();
    ctx.translate(-Math.round(state.cameraX), 0);
    const level = state.level;
    if (level) {
      const open = level.collectibles.every(c => c.collected);
      for (const plat of level.platforms) drawPlatform(plat, pal);
      drawPortal(level.portal, open, level.collectibles.filter(c => !c.collected).length, pal);
      for (const item of level.collectibles) if (!item.collected) drawCollectible(item);
      for (const enemy of level.enemies) drawEnemy(enemy, pal);
      drawParticles();
      if (state.player) drawPlayer(state.player, level.platforms);
      drawPopups();
    }
    ctx.restore();

    drawAmbient(pal);
    drawGrade(pal);
    ctx.restore();

    drawBanner();
    drawFlash();
    if (state.mode === MODE.PAUSED) drawPauseScreen();
  }

  function drawSky(pal) {
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    for (const [stop, color] of pal.sky) g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  function drawCelestial(pal) {
    const c = pal.celestial;
    const x = VW * c.x;
    const y = VH * c.y;
    const glow = ctx.createRadialGradient(x, y, c.r * 0.4, x, y, c.r * 4.4);
    glow.addColorStop(0, c.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, c.r * 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.core;
    ctx.beginPath();
    ctx.arc(x, y, c.r, 0, Math.PI * 2);
    ctx.fill();
    if (pal.night) {
      // recorte de crescente
      ctx.fillStyle = pal.sky[0][1];
      ctx.beginPath();
      ctx.arc(x + c.r * 0.42, y - c.r * 0.26, c.r * 0.94, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawStars(pal) {
    for (const s of state.decor.stars) {
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(state.time * 1.6 + s.ph));
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#EAF3FF';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds(pal) {
    ctx.fillStyle = pal.cloud;
    for (const c of state.decor.clouds) {
      const x = c.x - state.cameraX * 0.12;
      const wrapped = ((x % (VW + 500)) + VW + 500) % (VW + 500) - 220;
      puff(wrapped, c.y, c.s);
    }
    function puff(x, y, s) {
      ctx.beginPath();
      ctx.arc(x, y, 26 * s, 0, Math.PI * 2);
      ctx.arc(x + 30 * s, y - 12 * s, 33 * s, 0, Math.PI * 2);
      ctx.arc(x + 66 * s, y + 2 * s, 25 * s, 0, Math.PI * 2);
      ctx.arc(x + 34 * s, y + 14 * s, 28 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHills(pal, layer) {
    const seed = state.level ? state.level.seed : 1;
    if (layer === 'far') hillLayer(pal.far, 0.1, 320, 54, 170, seed * 31);
    else hillLayer(pal.mid, 0.2, 372, 66, 210, seed * 57);

    function hillLayer(color, factor, base, amp, wave, seed) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 8) {
        const wx = x + state.cameraX * factor;
        const y = base
          + Math.sin((wx + seed) / wave) * amp
          + Math.cos((wx + seed * 0.4) / (wave * 0.45)) * amp * 0.28;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(VW, VH);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTurbines(pal) {
    ctx.save();
    ctx.strokeStyle = pal.turbine;
    ctx.fillStyle = pal.turbine;
    ctx.lineWidth = 3;
    for (const t of state.decor.turbines) {
      const x = t.x - state.cameraX * 0.24;
      const wrapped = ((x % (VW + 400)) + VW + 400) % (VW + 400) - 200;
      const baseY = 372;
      ctx.beginPath();
      ctx.moveTo(wrapped, baseY);
      ctx.lineTo(wrapped, baseY - t.h);
      ctx.stroke();
      const hx = wrapped;
      const hy = baseY - t.h;
      const a = state.time * t.sp + t.ph;
      for (let i = 0; i < 3; i++) {
        const ang = a + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(ang) * 30, hy + Math.sin(ang) * 30);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSkyline(pal) {
    const baseY = 418;
    for (let i = 0; i < 20; i++) {
      const raw = i * 165 - (state.cameraX * 0.16) % 165;
      const x = raw - 40;
      const h = 78 + ((i * 37) % 5) * 26;
      const w = 78 + ((i * 53) % 3) * 16;
      ctx.fillStyle = pal.city;
      ctx.fillRect(x, baseY - h, w, h);
      if (pal.window) {
        ctx.fillStyle = pal.window;
        for (let wy = baseY - h + 12; wy < baseY - 14; wy += 20) {
          for (let wx = x + 10; wx < x + w - 12; wx += 18) {
            if (hash(wx * 0.7 + wy * 1.3 + i) > 0.52) {
              ctx.globalAlpha = 0.5 + hash(wx + wy) * 0.5;
              ctx.fillRect(wx, wy, 6, 8);
            }
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawTreeline(pal) {
    const baseY = 452;
    ctx.save();
    for (const t of state.decor.trees) {
      const x = t.x - state.cameraX * 0.55;
      if (x < -80 || x > VW + 80) continue;
      const s = t.s;
      ctx.fillStyle = pal.treeDark;
      ctx.fillRect(x - 3 * s, baseY - 34 * s, 6 * s, 36 * s);
      ctx.fillStyle = t.tone > 0.5 ? pal.tree : pal.treeDark;
      ctx.beginPath();
      ctx.arc(x, baseY - 44 * s, 20 * s, 0, Math.PI * 2);
      ctx.arc(x - 15 * s, baseY - 33 * s, 15 * s, 0, Math.PI * 2);
      ctx.arc(x + 15 * s, baseY - 33 * s, 15 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatform(plat, pal) {
    const isGround = plat.type === 'ground';
    const x = plat.x, y = plat.y, w = plat.w, h = plat.h;

    // fora da tela? pula
    if (x + w < state.cameraX - 60 || x > state.cameraX + VW + 60) return;

    if (isGround) {
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, pal.soil[0]);
      g.addColorStop(1, pal.soil[1]);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);

      // faixa de grama
      const gg = ctx.createLinearGradient(0, y - 6, 0, y + 16);
      gg.addColorStop(0, pal.grass[0]);
      gg.addColorStop(1, pal.grass[1]);
      ctx.fillStyle = gg;
      ctx.fillRect(x, y - 5, w, 20);

      // tufos e pedrinhas determinísticos
      const from = Math.max(x, Math.floor((state.cameraX - 40) / 26) * 26);
      const to = Math.min(x + w, state.cameraX + VW + 40);
      ctx.strokeStyle = pal.grass[0];
      ctx.lineWidth = 2;
      for (let gx = from; gx < to; gx += 26) {
        const j = hash(gx) * 8;
        ctx.beginPath();
        ctx.moveTo(gx + j, y - 4);
        ctx.lineTo(gx + j + 3, y - 13 - hash(gx * 1.7) * 5);
        ctx.lineTo(gx + j + 6, y - 4);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      for (let rx = from; rx < to; rx += 74) {
        const r = 2 + hash(rx * 3.1) * 3;
        ctx.beginPath();
        ctx.arc(rx + hash(rx) * 40, y + 32 + hash(rx * 2.2) * 44, r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // plataforma suspensa: prancha de madeira reaproveitada com grama por cima
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    roundRect(x + 3, y + 5, w, h, 8);
    ctx.fill();

    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, pal.plank[0]);
    g.addColorStop(1, pal.plank[1]);
    ctx.fillStyle = g;
    roundRect(x, y, w, h, 8);
    ctx.fill();

    // veios da madeira
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(x + 4, y + (h / 4) * i);
      ctx.lineTo(x + w - 4, y + (h / 4) * i);
      ctx.stroke();
    }

    // capa de grama
    const gg = ctx.createLinearGradient(0, y - 7, 0, y + 6);
    gg.addColorStop(0, pal.grass[0]);
    gg.addColorStop(1, pal.grass[1]);
    ctx.fillStyle = gg;
    roundRect(x - 1, y - 7, w + 2, 13, 6);
    ctx.fill();

    ctx.strokeStyle = pal.grass[0];
    ctx.lineWidth = 2;
    for (let gx = x + 9; gx < x + w - 8; gx += 22) {
      ctx.beginPath();
      ctx.moveTo(gx, y - 5);
      ctx.lineTo(gx + 3, y - 13 - hash(gx * 1.3) * 4);
      ctx.lineTo(gx + 6, y - 5);
      ctx.stroke();
    }

    // trepadeiras penduradas
    ctx.strokeStyle = pal.grass[1];
    ctx.lineWidth = 2;
    [x + 16, x + w - 20].forEach((vx, i) => {
      const len = 14 + hash(vx + i) * 16;
      const sway = Math.sin(state.time * 1.6 + vx * 0.05) * 3;
      ctx.beginPath();
      ctx.moveTo(vx, y + h - 2);
      ctx.quadraticCurveTo(vx + sway, y + h + len * 0.6, vx + sway * 1.6, y + h + len);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawCollectible(item) {
    const c = KIND_COLORS[item.kind];
    const bob = Math.sin(item.bob) * 5;
    const x = item.x, y = item.y + bob;

    ctx.save();
    ctx.translate(x, y);

    // aura pulsante
    const pulse = 0.82 + Math.sin(item.bob * 1.6) * 0.18;
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 26 * pulse);
    glow.addColorStop(0, c.aura);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // anel giratório
    ctx.save();
    ctx.rotate(item.bob * 0.6);
    ctx.strokeStyle = c.edge;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([5, 7]);
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#123322';
    ctx.fillStyle = c.main;

    if (item.kind === 'paper') {
      roundRect(-8, -11, 16, 22, 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-5, -5 + i * 5);
        ctx.lineTo(5, -5 + i * 5);
        ctx.stroke();
      }
    } else if (item.kind === 'plastic') {
      ctx.beginPath();
      ctx.moveTo(-3, -12); ctx.lineTo(3, -12); ctx.lineTo(3, -7);
      ctx.quadraticCurveTo(8, -4, 8, 3);
      ctx.quadraticCurveTo(8, 12, 0, 12);
      ctx.quadraticCurveTo(-8, 12, -8, 3);
      ctx.quadraticCurveTo(-8, -4, -3, -7);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.edge;
      roundRect(-4, -15, 8, 4, 1.5); ctx.fill();
    } else if (item.kind === 'metal') {
      roundRect(-7, -11, 14, 22, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.edge;
      ctx.fillRect(-7, -3, 14, 5);
      ctx.beginPath();
      ctx.ellipse(0, -11, 7, 2.6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(7, 4);
      ctx.quadraticCurveTo(7, 12, 0, 12);
      ctx.quadraticCurveTo(-7, 12, -7, 4);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.edge;
      roundRect(-7, -14, 14, 5, 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(enemy, pal) {
    if (enemy.x + enemy.w < state.cameraX - 60 || enemy.x > state.cameraX + VW + 60) return;
    const w = enemy.w, h = enemy.h;
    const bounce = Math.abs(Math.sin(enemy.wobble * 0.5)) * 5;
    const squash = 1 + Math.sin(enemy.wobble) * 0.06;
    const cx = enemy.x + w / 2;
    const cy = enemy.y + h - bounce;

    ctx.save();
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, enemy.y + h + 3, w * 0.48, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.translate(cx, cy);
    ctx.scale(1 / squash, squash);

    // corpo do saco de lixo
    const g = ctx.createLinearGradient(0, -h, 0, 0);
    g.addColorStop(0, '#5D6D75');
    g.addColorStop(1, '#333F46');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.quadraticCurveTo(-w / 2 - 3, -h * 0.7, -6, -h * 0.86);
    ctx.lineTo(-4, -h - 5);
    ctx.lineTo(4, -h - 5);
    ctx.lineTo(6, -h * 0.86);
    ctx.quadraticCurveTo(w / 2 + 3, -h * 0.7, w / 2, 0);
    ctx.closePath();
    ctx.fill();

    // brilho
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.ellipse(-w * 0.2, -h * 0.55, 5, 10, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // nó
    ctx.strokeStyle = '#26313A';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-5, -h - 2);
    ctx.lineTo(5, -h - 2);
    ctx.stroke();

    // olhos acompanhando a Eva
    const px = state.player ? state.player.x + state.player.w / 2 : cx;
    const look = clamp((px - cx) / 120, -1, 1) * 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-7, -h * 0.6, 5, 0, Math.PI * 2);
    ctx.arc(7, -h * 0.6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#161C21';
    ctx.beginPath();
    ctx.arc(-7 + look, -h * 0.6, 2.4, 0, Math.PI * 2);
    ctx.arc(7 + look, -h * 0.6, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // sobrancelhas bravas
    ctx.strokeStyle = '#1B2227';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-11, -h * 0.78); ctx.lineTo(-3, -h * 0.7);
    ctx.moveTo(11, -h * 0.78); ctx.lineTo(3, -h * 0.7);
    ctx.stroke();
    ctx.restore();

    // moscas em volta
    if (!REDUCED) {
      ctx.fillStyle = pal.night ? 'rgba(200,220,240,0.7)' : 'rgba(40,50,55,0.75)';
      for (let i = 0; i < 2; i++) {
        const a = state.time * (2.2 + i * 0.8) + i * 2.4 + enemy.wobble * 0.2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (20 + i * 6), cy - h - 6 + Math.sin(a * 1.7) * 7, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPortal(portal, open, remaining, pal) {
    const x = portal.x, y = portal.y, w = portal.w, h = portal.h;
    if (x + w < state.cameraX - 200 || x > state.cameraX + VW + 200) return;
    const cx = x + w / 2;

    ctx.save();

    // campo de energia
    if (open) {
      const g = ctx.createLinearGradient(0, y - 10, 0, y + h);
      g.addColorStop(0, 'rgba(120,255,180,0.05)');
      g.addColorStop(0.5, 'rgba(90,235,155,0.34)');
      g.addColorStop(1, 'rgba(60,210,130,0.12)');
      ctx.fillStyle = g;
      roundRect(x, y, w, h, 10);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      roundRect(x, y, w, h, 10);
      ctx.clip();
      ctx.strokeStyle = 'rgba(190,255,215,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const oy = ((state.time * 46 + i * 18) % (h + 20)) - 10;
        ctx.beginPath();
        ctx.moveTo(x, y + h - oy);
        ctx.lineTo(x + w, y + h - oy - 6);
        ctx.stroke();
      }
      ctx.restore();

      const halo = ctx.createRadialGradient(cx, y + h / 2, 6, cx, y + h / 2, 90);
      halo.addColorStop(0, 'rgba(110,250,175,0.28)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, 90, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(120,140,130,0.16)';
      roundRect(x, y, w, h, 10);
      ctx.fill();
    }

    // pórtico
    const frame = open ? '#3FD983' : '#6E8A7C';
    ctx.strokeStyle = frame;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h);
    ctx.lineTo(x - 4, y + 8);
    ctx.quadraticCurveTo(cx, y - 26, x + w + 4, y + 8);
    ctx.lineTo(x + w + 4, y + h);
    ctx.stroke();

    // lâmpadas
    [x - 4, x + w + 4].forEach((lx) => {
      ctx.fillStyle = open ? '#B6FFD3' : '#5D7268';
      ctx.beginPath();
      ctx.arc(lx, y + 10, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // símbolo de reciclagem girando
    ctx.save();
    ctx.translate(cx, y + h / 2);
    ctx.rotate(open ? state.time * 0.9 : 0);
    ctx.strokeStyle = open ? '#D9FFE9' : '#7D9488';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // três setas formando o triângulo de Möbius da reciclagem
    const R = 13;
    const verts = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6].map(a => [Math.cos(a) * R, Math.sin(a) * R]);
    for (let i = 0; i < 3; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % 3];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const sx = a[0] + ux * len * 0.2, sy = a[1] + uy * len * 0.2;
      const ex = a[0] + ux * len * 0.86, ey = a[1] + uy * len * 0.86;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // ponta da seta
      const head = 6;
      const ang = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.5) * head, ey - Math.sin(ang - 0.5) * head);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang + 0.5) * head, ey - Math.sin(ang + 0.5) * head);
      ctx.stroke();
    }
    ctx.restore();

    // rótulo
    ctx.textAlign = 'center';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    const label = open ? 'ENTRE' : `FALTAM ${remaining}`;
    const lw = ctx.measureText(label).width + 20;
    const ly = y - 48;
    ctx.fillStyle = open ? 'rgba(20,70,45,0.82)' : 'rgba(24,40,32,0.72)';
    roundRect(cx - lw / 2, ly - 13, lw, 22, 11);
    ctx.fill();
    ctx.strokeStyle = open ? 'rgba(120,255,180,0.6)' : 'rgba(160,185,170,0.4)';
    ctx.lineWidth = 1.2;
    roundRect(cx - lw / 2, ly - 13, lw, 22, 11);
    ctx.stroke();
    ctx.fillStyle = open ? '#B6FFD3' : '#C7D8CD';
    ctx.fillText(label, cx, ly + 4);
    ctx.restore();
  }

  function groundBelow(p, platforms) {
    let best = VH + 200;
    for (const plat of platforms) {
      if (p.x + p.w * 0.5 < plat.x || p.x + p.w * 0.5 > plat.x + plat.w) continue;
      if (plat.y >= p.y + p.h - 2 && plat.y < best) best = plat.y;
    }
    return best;
  }

  function drawPlayer(player, platforms) {
    const img = sprites[player.sprite] || sprites.idle;
    const cx = player.x + player.w / 2;

    // sombra projetada no chão
    const gy = groundBelow(player, platforms);
    if (gy < VH + 100) {
      const dist = clamp((gy - (player.y + player.h)) / 220, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.3 * (1 - dist);
      ctx.fillStyle = '#0A1A12';
      ctx.beginPath();
      ctx.ellipse(cx, gy + 2, 24 * (1 - dist * 0.45), 6.5 * (1 - dist * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (!img) return;

    const sq = player.squash;
    const scaleY = 1 - sq * 0.55;
    const scaleX = 1 + sq * 0.45;

    ctx.save();
    ctx.translate(cx, player.y + player.h);
    ctx.scale(player.facing * scaleX, scaleY);
    if (player.hurtCooldown > 0 && Math.floor(player.hurtCooldown * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    // os sprites têm a base do desenho em ~97% da altura da imagem,
    // então o deslocamento coloca os pés exatamente na superfície
    const drawW = 96, drawH = 96;
    ctx.drawImage(img, -drawW / 2, -93, drawW, drawH);
    ctx.restore();
  }

  function drawAmbient(pal) {
    const a = pal.ambient;
    ctx.save();
    for (const p of state.decor.ambient) {
      if (a.kind === 'firefly') {
        const blink = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 2.2 + p.ph));
        ctx.globalAlpha = blink * 0.9;
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = blink * 0.22;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (a.kind === 'leaf') {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = a.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(state.time * 1.2 + p.ph);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.s * 3, p.s * 1.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(state.time + p.ph);
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawGrade(pal) {
    // névoa de cor da hora do dia
    ctx.fillStyle = pal.fog;
    ctx.fillRect(0, 0, VW, VH);

    // vinheta
    const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.42, VW / 2, VH / 2, VH * 1.05);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(4,12,8,${pal.vignette})`);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VW, VH);

    if (state.tint.alpha > 0.01 && state.tint.color) {
      ctx.globalAlpha = state.tint.alpha;
      ctx.fillStyle = state.tint.color;
      ctx.fillRect(0, 0, VW, VH);
      ctx.globalAlpha = 1;
    }
  }

  function drawBanner() {
    const b = state.banner;
    if (b.timer <= 0) return;
    const t = b.timer;
    const inAnim = clamp((2.6 - t) / 0.32, 0, 1);
    const outAnim = clamp(t / 0.5, 0, 1);
    const alpha = Math.min(inAnim, outAnim);
    const slide = (1 - inAnim) * -40;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(VW / 2, 92 + slide);
    ctx.textAlign = 'center';

    ctx.fillStyle = 'rgba(8,24,16,0.72)';
    roundRect(-190, -38, 380, 76, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,179,71,0.55)';
    ctx.lineWidth = 1.5;
    roundRect(-190, -38, 380, 76, 16);
    ctx.stroke();

    ctx.fillStyle = '#FFB347';
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillText(b.text.toUpperCase(), 0, -12);
    ctx.fillStyle = '#EAF6EE';
    ctx.font = '600 21px "Space Grotesk", Arial';
    ctx.fillText(b.sub, 0, 18);
    ctx.restore();
  }

  function drawFlash() {
    const f = state.flash;
    if (f.timer <= 0 || !f.text) return;
    ctx.save();
    ctx.globalAlpha = clamp(f.timer / 0.45, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = '600 16px "Space Grotesk", Arial';
    const w = ctx.measureText(f.text).width + 34;
    ctx.fillStyle = 'rgba(8,24,16,0.66)';
    roundRect(VW / 2 - w / 2, VH - 66, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#C9F5DA';
    ctx.fillText(f.text, VW / 2, VH - 42);
    ctx.restore();
  }

  function drawPauseScreen() {
    ctx.save();
    ctx.fillStyle = 'rgba(6,18,12,0.62)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFB347';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText('PAUSADO', VW / 2, VH / 2 - 26);
    ctx.fillStyle = '#EAF6EE';
    ctx.font = '600 30px "Space Grotesk", Arial';
    ctx.fillText('Respire e volte quando quiser', VW / 2, VH / 2 + 10);
    ctx.fillStyle = 'rgba(201,245,218,0.75)';
    ctx.font = '400 15px Inter, Arial';
    ctx.fillText('Pressione P ou Esc para continuar', VW / 2, VH / 2 + 40);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* =========================================================
     9. HUD e overlays
     ========================================================= */
  const hudCache = { level: '', score: -1, lives: -1, collect: '', time: '' };

  function forceHUD() {
    hudCache.level = ''; hudCache.score = -1; hudCache.lives = -1;
    hudCache.collect = ''; hudCache.time = '';
    updateHUD();
  }

  function updateHUD() {
    const level = state.level;
    if (!level) return;

    const lvlText = `${state.levelIndex + 1}/${levels.length}`;
    if (lvlText !== hudCache.level) {
      hudCache.level = lvlText;
      hud.level.textContent = lvlText;
      hud.levelName.textContent = levels[state.levelIndex].name;
    }

    if (state.score !== hudCache.score) {
      hudCache.score = state.score;
      hud.score.textContent = state.score;
      hud.score.classList.remove('bump');
      void hud.score.offsetWidth;
      hud.score.classList.add('bump');
    }

    if (state.lives !== hudCache.lives) {
      hudCache.lives = state.lives;
      hud.lives.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const pip = document.createElement('span');
        pip.className = 'pip' + (i < state.lives ? '' : ' empty');
        hud.lives.appendChild(pip);
      }
    }

    const total = level.collectibles.length;
    const got = level.collectibles.filter(c => c.collected).length;
    const cText = `${got}/${total}`;
    if (cText !== hudCache.collect) {
      hudCache.collect = cText;
      hud.collect.textContent = cText;
      const pct = total ? (got / total) * 100 : 0;
      hud.meterFill.style.width = pct + '%';
      hud.meter.setAttribute('aria-valuenow', Math.round(pct));
      hud.meter.classList.toggle('full', got === total && total > 0);
    }

    const tText = `${(state.totalElapsed + state.levelElapsed).toFixed(1)}s`;
    if (tText !== hudCache.time) {
      hudCache.time = tText;
      hud.time.textContent = tText;
    }
  }

  function updateRecordsUI() {
    hud.bestScore.textContent = records.bestScore || 0;
    hud.bestTime.textContent = records.bestTime != null ? `${records.bestTime.toFixed(1)}s` : '--';
  }

  function openOverlay({ kicker, title, body, actions }) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayBody.innerHTML = body;
    overlayActions.innerHTML = '';
    (actions || []).forEach(a => {
      const btn = document.createElement('button');
      btn.className = a.primary ? 'primary-btn' : 'ghost-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        Sound.unlock();
        Sound.play('ui');
        closeOverlay();
        a.onClick();
      });
      overlayActions.appendChild(btn);
    });
    overlay.classList.add('visible');
    const first = overlayActions.querySelector('button');
    if (first) first.focus();
  }

  function closeOverlay() {
    overlay.classList.remove('visible');
  }

  function openMenu() {
    state.mode = MODE.MENU;
    openOverlay({
      kicker: 'Missão ambiental',
      title: 'Eva no Lixo Zero',
      body: `
        <p>Três cenários, três horários do dia. Recolha todo o material reciclável do percurso,
        escape dos sacos de lixo e atravesse o portal antes que o cronômetro coma seus pontos.</p>
        <ul class="overlay-keys">
          <li><strong>Mover:</strong> A/D ou setas ←/→</li>
          <li><strong>Pular:</strong> W, ↑ ou Espaço (segure para pular mais alto)</li>
          <li><strong>No celular:</strong> use os botões abaixo do cenário</li>
        </ul>
      `,
      actions: [{ label: 'Começar', primary: true, onClick: startGame }]
    });
  }

  function startGame() {
    Sound.unlock();
    resetGame();
    state.mode = MODE.PLAYING;
  }

  function togglePause(force) {
    if (state.mode === MODE.PLAYING && force !== false) {
      state.mode = MODE.PAUSED;
      Sound.pauseMusic();
      Sound.play('pause');
    } else if (state.mode === MODE.PAUSED && force !== true) {
      state.mode = MODE.PLAYING;
      Sound.resumeMusic();
      Sound.play('resume');
    }
  }

  /* =========================================================
     10. Entrada
     ========================================================= */
  const LEFT_KEYS = ['ArrowLeft', 'a', 'A'];
  const RIGHT_KEYS = ['ArrowRight', 'd', 'D'];
  const JUMP_KEYS = ['ArrowUp', 'w', 'W', ' ', 'Spacebar'];

  window.addEventListener('keydown', (e) => {
    if (helpDialog.open) return;
    if (LEFT_KEYS.includes(e.key)) { keys.left = true; e.preventDefault(); }
    if (RIGHT_KEYS.includes(e.key)) { keys.right = true; e.preventDefault(); }
    if (JUMP_KEYS.includes(e.key)) {
      e.preventDefault();
      if (!keys.jump) { jumpQueued = true; jumpReleased = false; }
      keys.jump = true;
      Sound.unlock();
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') togglePause();
    if (e.key === 'm' || e.key === 'M') setMuted(!Sound.isMuted());
    if ((e.key === 'r' || e.key === 'R') && state.mode !== MODE.LOADING) {
      closeOverlay();
      startGame();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (LEFT_KEYS.includes(e.key)) keys.left = false;
    if (RIGHT_KEYS.includes(e.key)) keys.right = false;
    if (JUMP_KEYS.includes(e.key)) { keys.jump = false; jumpReleased = true; }
  });

  touchControls.querySelectorAll('.touch-btn').forEach(btn => {
    const key = btn.dataset.key;
    const set = (value) => {
      if (key === 'left') keys.left = value;
      else if (key === 'right') keys.right = value;
      else if (key === 'jump') {
        if (value && !keys.jump) { jumpQueued = true; jumpReleased = false; }
        if (!value) jumpReleased = true;
        keys.jump = value;
      }
    };
    const down = (e) => { e.preventDefault(); Sound.unlock(); set(true); };
    const up = (e) => { e.preventDefault(); set(false); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  window.addEventListener('blur', () => {
    keys.left = keys.right = keys.jump = false;
    if (state.mode === MODE.PLAYING) togglePause(true);
  });

  /* =========================================================
     11. Controles de som na interface
     ========================================================= */
  function setMuted(v) {
    Sound.setMuted(v);
    settings.muted = v;
    saveJSON(SETTINGS_KEY, settings);
    soundBtn.setAttribute('aria-pressed', String(v));
    soundGlyph.textContent = v ? '✕' : '♪';
    soundBtn.querySelector('.icon-btn-label').textContent = v ? 'Mudo' : 'Som';
    if (!v && state.mode === MODE.PLAYING) Sound.startMusic(state.levelIndex);
  }

  soundBtn.addEventListener('click', () => {
    Sound.unlock();
    setMuted(!Sound.isMuted());
    if (!Sound.isMuted()) Sound.play('ui');
  });

  musicVolInput.addEventListener('input', () => {
    const v = Number(musicVolInput.value);
    musicVolOut.textContent = v;
    settings.music = v;
    Sound.setMusicVol(v / 100);
    saveJSON(SETTINGS_KEY, settings);
  });

  sfxVolInput.addEventListener('input', () => {
    const v = Number(sfxVolInput.value);
    sfxVolOut.textContent = v;
    settings.sfx = v;
    Sound.setSfxVol(v / 100);
    saveJSON(SETTINGS_KEY, settings);
  });

  sfxVolInput.addEventListener('change', () => { Sound.unlock(); Sound.play('coin', 'glass'); });

  howBtn.addEventListener('click', () => { Sound.play('ui'); helpDialog.showModal(); });
  closeHelp.addEventListener('click', () => helpDialog.close());
  helpDialog.addEventListener('click', (e) => {
    const r = helpDialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) helpDialog.close();
  });

  function applySettings() {
    musicVolInput.value = settings.music;
    sfxVolInput.value = settings.sfx;
    musicVolOut.textContent = settings.music;
    sfxVolOut.textContent = settings.sfx;
    Sound.setMusicVol(settings.music / 100);
    Sound.setSfxVol(settings.sfx / 100);
    soundBtn.setAttribute('aria-pressed', String(!!settings.muted));
    soundGlyph.textContent = settings.muted ? '✕' : '♪';
    soundBtn.querySelector('.icon-btn-label').textContent = settings.muted ? 'Mudo' : 'Som';
    Sound.setMuted(!!settings.muted);
  }

  /* =========================================================
     12. Loop e boot
     ========================================================= */
  let lastTime = 0;
  function frame(ts) {
    const dt = Math.max(0, Math.min(0.033, (ts - lastTime) / 1000 || 0));
    lastTime = ts;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  function loadImages() {
    return Promise.all(Object.entries(spriteSources).map(([key, src]) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { sprites[key] = img; resolve(); };
      img.onerror = () => reject(new Error(src));
      img.src = src;
    })));
  }

  fitCanvas();
  window.addEventListener('resize', fitCanvas);
  applySettings();
  updateRecordsUI();

  loadImages().then(() => {
    loader.classList.add('hidden');
    state.levelIndex = 0;
    state.level = cloneLevel(levels[0]);
    state.palette = PALETTES[0];
    state.decor = buildDecor(levels[0], PALETTES[0]);
    state.player = createPlayer();
    state.player.x = levels[0].spawn.x;
    state.player.y = levels[0].spawn.y;
    forceHUD();
    openMenu();
    lastTime = performance.now();
    requestAnimationFrame(frame);
  }).catch((err) => {
    console.error(err);
    loader.classList.add('hidden');
    openOverlay({
      kicker: 'Arquivos ausentes',
      title: 'Não foi possível carregar os sprites',
      body: '<p>A pasta <strong>assets</strong> precisa estar na mesma pasta do <strong>index.html</strong>. Extraia o ZIP inteiro antes de abrir o jogo.</p>',
      actions: [{ label: 'Recarregar', primary: true, onClick: () => location.reload() }]
    });
  });
})();
