/* =============================================================
   Eva no Lixo Zero — AudioManager
   Uma unica BGM por vez (MP3 real) + efeitos em pool +
   sintese Web Audio apenas como reserva para pulo/aterrissagem/UI.
   ============================================================= */
(function (global) {
  'use strict';

  var ASSETS = global.Assets.ASSETS;
  var encodePath = global.Assets.encodePath;

  var SFX_VOICES = 3;      // instancias por efeito
  var FADE_STEP_MS = 40;

  /* ---------------------------------------------------- sintese reserva */

  var Synth = (function () {
    var ac = null, master = null, sfxBus = null, noiseBuffer = null;
    var enabled = true;

    function boot() {
      if (ac) return ac;
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { enabled = false; return null; }
      try { ac = new AC(); } catch (e) { enabled = false; return null; }
      master = ac.createGain();
      master.gain.value = 1;
      master.connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = 0.75;
      sfxBus.connect(master);
      var len = Math.floor(ac.sampleRate * 0.6);
      noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return ac;
    }

    function resume() {
      boot();
      if (ac && ac.state === 'suspended') ac.resume();
    }

    function setVolume(v) { if (sfxBus) sfxBus.gain.value = v; }

    function tone(o) {
      if (!enabled || !boot()) return;
      var t0 = ac.currentTime;
      var dur = o.dur || 0.18;
      var osc = ac.createOscillator();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
      var node = osc;
      if (o.cutoff) {
        var f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(o.cutoff, t0);
        node.connect(f);
        node = f;
      }
      var g = ac.createGain();
      var peak = o.gain != null ? o.gain : 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      node.connect(g);
      g.connect(sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }

    function noise(o) {
      if (!enabled || !boot() || !noiseBuffer) return;
      var t0 = ac.currentTime;
      var dur = o.dur || 0.1;
      var src = ac.createBufferSource();
      src.buffer = noiseBuffer;
      src.loop = true;
      var f = ac.createBiquadFilter();
      f.type = o.filterType || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, o.to), t0 + dur);
      var g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(o.gain != null ? o.gain : 0.07, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    var voices = {
      jump: function () {
        tone({ freq: 300, to: 620, dur: 0.11, type: 'square', gain: 0.1, cutoff: 2600 });
        noise({ freq: 900, to: 2600, dur: 0.09, gain: 0.03, filterType: 'highpass' });
      },
      land: function () {
        tone({ freq: 150, to: 58, dur: 0.13, type: 'sine', gain: 0.12 });
        noise({ freq: 700, to: 220, dur: 0.11, gain: 0.045, filterType: 'lowpass' });
      },
      ui: function () {
        tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.08 });
      },
      punch: function () {
        tone({ freq: 220, to: 90, dur: 0.1, type: 'square', gain: 0.09, cutoff: 1800 });
        noise({ freq: 2200, to: 500, dur: 0.09, gain: 0.05 });
      },
      eco: function () {
        tone({ freq: 420, to: 1180, dur: 0.3, type: 'triangle', gain: 0.1 });
        noise({ freq: 3200, to: 900, dur: 0.28, gain: 0.035, filterType: 'bandpass' });
      },
      unlock: function () {
        [660, 830, 990, 1320].forEach(function (f, i) {
          setTimeout(function () { tone({ freq: f, dur: 0.28, type: 'triangle', gain: 0.09 }); }, i * 85);
        });
      },
      portal: function () {
        tone({ freq: 180, to: 720, dur: 0.5, type: 'sine', gain: 0.1 });
      },
      checkpoint: function () {
        tone({ freq: 520, to: 880, dur: 0.2, type: 'triangle', gain: 0.09 });
      }
    };

    return {
      resume: resume,
      setVolume: setVolume,
      play: function (name) { if (voices[name]) voices[name](); }
    };
  })();

  /* ---------------------------------------------------- AudioManager */

  function AudioManager() {
    this.musicVolume = 0.6;
    this.sfxVolume = 0.8;
    this.muted = false;
    this.currentMusic = null;   // chave
    this._musicEl = null;       // elemento tocando
    this._musicPool = {};       // chave -> Audio
    this._sfxPool = {};         // chave -> [Audio]
    this._sfxIndex = {};
    this._sfxLast = {};
    this._loops = {};           // efeitos em loop ativos (ex.: lowHealth)
    this._fades = {};
    this._duck = 1;             // abafamento durante cutscene
    this._pausedByUser = false;
  }

  AudioManager.prototype._musicTarget = function () {
    return this.muted ? 0 : this.musicVolume * this._duck;
  };

  AudioManager.prototype._makeMusic = function (key) {
    var src = ASSETS.music[key];
    if (!src) return null;
    if (this._musicPool[key]) return this._musicPool[key];
    var el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    el.volume = 0;
    el.src = encodePath(src);
    el.addEventListener('error', function () {
      console.warn('[audio] musica indisponivel:', src);
    });
    this._musicPool[key] = el;
    return el;
  };

  /** Pre-carrega uma musica sem toca-la (chamado antes de entrar na fase). */
  AudioManager.prototype.preloadMusic = function (key) {
    var el = this._makeMusic(key);
    if (el && el.readyState === 0) { try { el.load(); } catch (e) { /* ok */ } }
    return Promise.resolve();
  };

  AudioManager.prototype._fadeTo = function (el, target, ms, onDone) {
    var self = this;
    var id = el.src;
    if (this._fades[id]) { clearInterval(this._fades[id]); delete this._fades[id]; }
    if (ms <= 0) {
      el.volume = Math.max(0, Math.min(1, target));
      if (onDone) onDone();
      return;
    }
    var steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
    var from = el.volume;
    var i = 0;
    this._fades[id] = setInterval(function () {
      i++;
      var v = from + (target - from) * (i / steps);
      el.volume = Math.max(0, Math.min(1, v));
      if (i >= steps) {
        clearInterval(self._fades[id]);
        delete self._fades[id];
        if (onDone) onDone();
      }
    }, FADE_STEP_MS);
  };

  /** Toca uma BGM. Nunca deixa duas trilhas simultaneas. */
  AudioManager.prototype.playMusic = function (key, opts) {
    opts = opts || {};
    if (this.currentMusic === key && this._musicEl && !this._musicEl.paused) {
      this._fadeTo(this._musicEl, this._musicTarget(), 200);
      return;
    }
    var next = this._makeMusic(key);
    var prev = this._musicEl;
    var fade = opts.fade != null ? opts.fade : 600;

    if (prev && prev !== next) {
      this._fadeTo(prev, 0, fade, function () { prev.pause(); prev.currentTime = 0; });
    }
    this.currentMusic = key;
    this._musicEl = next;
    this._pausedByUser = false;
    if (!next) return;

    next.loop = opts.loop !== false;
    if (opts.restart !== false) { try { next.currentTime = 0; } catch (e) { /* ok */ } }
    next.volume = 0;
    var self = this;
    var p = next.play();
    if (p && p.catch) {
      p.catch(function () { /* autoplay bloqueado: destrava no primeiro clique */ });
    }
    this._fadeTo(next, self._musicTarget(), fade);
  };

  AudioManager.prototype.stopMusic = function (fade) {
    var el = this._musicEl;
    this.currentMusic = null;
    this._musicEl = null;
    if (!el) return;
    this._fadeTo(el, 0, fade != null ? fade : 400, function () {
      el.pause();
      try { el.currentTime = 0; } catch (e) { /* ok */ }
    });
  };

  AudioManager.prototype.pauseMusic = function () {
    this._pausedByUser = true;
    if (this._musicEl) this._musicEl.pause();
    this.stopLoop('lowHealth');
  };

  AudioManager.prototype.resumeMusic = function () {
    if (!this._musicEl || !this._pausedByUser) return;
    this._pausedByUser = false;
    if (this._musicEl.paused) {
      var p = this._musicEl.play();
      if (p && p.catch) p.catch(function () {});
    }
    this._musicEl.volume = this._musicTarget();
  };

  /** Abafa a trilha (usado por cutscenes: o video tem audio proprio). */
  AudioManager.prototype.duck = function (amount, fade) {
    this._duck = amount;
    if (this._musicEl) this._fadeTo(this._musicEl, this._musicTarget(), fade != null ? fade : 250);
  };

  /* ------------------------------------------------------------ efeitos */

  AudioManager.prototype._sfxVoices = function (key) {
    if (this._sfxPool[key]) return this._sfxPool[key];
    var def = ASSETS.sfx[key];
    if (!def) return null;
    var pool = [];
    var count = def.loop ? 1 : SFX_VOICES;
    for (var i = 0; i < count; i++) {
      var el = new Audio();
      el.preload = 'auto';
      el.src = encodePath(def.src);
      el.loop = !!def.loop;
      pool.push(el);
    }
    pool[0].addEventListener('error', function () {
      console.warn('[audio] efeito indisponivel:', def.src);
    });
    this._sfxPool[key] = pool;
    this._sfxIndex[key] = 0;
    return pool;
  };

  AudioManager.prototype.preloadSfx = function (keys) {
    var self = this;
    (keys || Object.keys(ASSETS.sfx)).forEach(function (k) { self._sfxVoices(k); });
  };

  AudioManager.prototype.playSfx = function (key, volumeScale) {
    if (this.muted) return;
    var def = ASSETS.sfx[key];
    if (!def) { Synth.play(key); return; }

    var now = performance.now() / 1000;
    var gap = def.throttle || 0;
    if (gap && this._sfxLast[key] && now - this._sfxLast[key] < gap) return;
    this._sfxLast[key] = now;

    var pool = this._sfxVoices(key);
    if (!pool) return;
    var i = this._sfxIndex[key] % pool.length;
    this._sfxIndex[key] = i + 1;
    var el = pool[i];
    el.volume = Math.max(0, Math.min(1, this.sfxVolume * (def.volume != null ? def.volume : 1) * (volumeScale || 1)));
    try { el.currentTime = 0; } catch (e) { /* ok */ }
    var p = el.play();
    if (p && p.catch) p.catch(function () {});

    if (def.maxTime) {
      var self = this;
      if (el._cut) clearTimeout(el._cut);
      el._cut = setTimeout(function () {
        el._cut = null;
        if (!el.paused) { el.pause(); try { el.currentTime = 0; } catch (e) { /* ok */ } }
      }, def.maxTime * 1000);
      void self;
    }
  };

  /** Efeito continuo (vida critica). Iniciar duas vezes nao reinicia o som. */
  AudioManager.prototype.startLoop = function (key) {
    if (this._loops[key] || this.muted) return;
    var pool = this._sfxVoices(key);
    if (!pool) return;
    var el = pool[0];
    el.loop = true;
    el.volume = Math.max(0, Math.min(1, this.sfxVolume * (ASSETS.sfx[key].volume || 1)));
    try { el.currentTime = 0; } catch (e) { /* ok */ }
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
    this._loops[key] = el;
  };

  AudioManager.prototype.stopLoop = function (key) {
    var el = this._loops[key];
    if (!el) return;
    el.pause();
    try { el.currentTime = 0; } catch (e) { /* ok */ }
    delete this._loops[key];
  };

  AudioManager.prototype.stopAllLoops = function () {
    var self = this;
    Object.keys(this._loops).forEach(function (k) { self.stopLoop(k); });
  };

  /** Efeitos sem arquivo dedicado caem na sintese (pulo, passos, UI). */
  AudioManager.prototype.playCue = function (name) {
    if (this.muted) return;
    Synth.play(name);
  };

  /* ------------------------------------------------------------ ajustes */

  AudioManager.prototype.unlock = function () {
    Synth.resume();
    if (this._musicEl && this._musicEl.paused && !this._pausedByUser && this.currentMusic) {
      var p = this._musicEl.play();
      if (p && p.catch) p.catch(function () {});
      this._musicEl.volume = this._musicTarget();
    }
  };

  AudioManager.prototype.setMusicVolume = function (v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this._musicEl) this._musicEl.volume = this._musicTarget();
  };

  AudioManager.prototype.setSfxVolume = function (v) {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    Synth.setVolume(this.sfxVolume);
    var self = this;
    Object.keys(this._loops).forEach(function (k) {
      self._loops[k].volume = self.sfxVolume * (ASSETS.sfx[k].volume || 1);
    });
  };

  AudioManager.prototype.setMuted = function (v) {
    this.muted = !!v;
    if (this._musicEl) this._musicEl.volume = this._musicTarget();
    if (this.muted) this.stopAllLoops();
  };

  AudioManager.prototype.isMuted = function () { return this.muted; };

  global.audio = new AudioManager();
})(window);
