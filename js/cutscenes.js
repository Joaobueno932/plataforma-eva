/* =============================================================
   Eva no Lixo Zero — CutsceneManager
   Reproduz os MP4 sobre o canvas, com Skip por botao ou teclado.
   Um video ausente nunca trava a campanha: resolve na hora.
   ============================================================= */
(function (global) {
  'use strict';

  var ASSETS = global.Assets.ASSETS;
  var encodePath = global.Assets.encodePath;

  var SKIP_KEYS = ['Escape', 'Enter', ' ', 'Spacebar'];
  var FAILSAFE_EXTRA_MS = 4000;

  function CutsceneManager(layer, video, skipBtn) {
    this.layer = layer;
    this.video = video;
    this.skipBtn = skipBtn;
    this.active = false;
    this._resolve = null;
    this._cleanup = null;
    this._onSkipped = null;

    var self = this;
    this.skipBtn.addEventListener('click', function () { self.skip(); });
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');
  }

  CutsceneManager.prototype.isActive = function () { return this.active; };

  /** Toca uma cena. Sempre resolve (fim natural, skip ou erro). */
  CutsceneManager.prototype.play = function (key, opts) {
    opts = opts || {};
    var src = ASSETS.cutscenes[key];
    var self = this;

    if (this.active) this.skip();

    return new Promise(function (resolve) {
      if (!src) {
        console.warn('[cutscene] cena desconhecida:', key);
        resolve('missing');
        return;
      }

      var settled = false;
      var timer = null;

      function finish(reason) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        self.video.removeEventListener('ended', onEnded);
        self.video.removeEventListener('error', onError);
        self.video.removeEventListener('loadedmetadata', onMeta);
        global.removeEventListener('keydown', onKey, true);
        self.active = false;
        self._resolve = null;
        self._cleanup = null;
        try { self.video.pause(); } catch (e) { /* ok */ }
        self.video.removeAttribute('src');
        try { self.video.load(); } catch (e) { /* ok */ }
        self.layer.hidden = true;
        global.audio.duck(1, 400);
        if (self._onSkipped) { self._onSkipped(reason); }
        resolve(reason);
      }

      function onEnded() { finish('ended'); }
      function onError() {
        console.warn('[cutscene] nao foi possivel reproduzir:', src);
        finish('error');
      }
      function onMeta() {
        // rede de seguranca: se o "ended" nao disparar, encerra sozinho
        var ms = (self.video.duration || 12) * 1000 + FAILSAFE_EXTRA_MS;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { finish('timeout'); }, ms);
      }
      function onKey(e) {
        if (e.repeat) { e.preventDefault(); return; }
        if (SKIP_KEYS.indexOf(e.key) >= 0) {
          e.preventDefault();
          e.stopPropagation();
          finish('skipped');
        }
      }

      self.active = true;
      self._cleanup = finish;
      self.layer.hidden = false;
      self.skipBtn.hidden = false;
      global.audio.duck(0, 200);

      self.video.muted = !!global.audio.isMuted();
      self.video.volume = Math.max(0, Math.min(1, opts.volume != null ? opts.volume : 1));
      self.video.loop = false;
      self.video.addEventListener('ended', onEnded);
      self.video.addEventListener('error', onError);
      self.video.addEventListener('loadedmetadata', onMeta);
      global.addEventListener('keydown', onKey, true);

      self.video.src = encodePath(src);
      var p = self.video.play();
      if (p && p.catch) {
        p.catch(function () {
          // alguns navegadores bloqueiam audio antes de interacao:
          // tenta de novo sem som em vez de abortar a campanha
          self.video.muted = true;
          var q = self.video.play();
          if (q && q.catch) q.catch(function () { finish('blocked'); });
        });
      }

      // se nem o metadata chegar, encerra em 15 s
      timer = setTimeout(function () { finish('timeout'); }, 15000);
      self.skipBtn.focus({ preventScroll: true });
    });
  };

  /** Toca uma lista em sequencia. */
  CutsceneManager.prototype.playSequence = function (keys) {
    var self = this;
    return keys.reduce(function (chain, key) {
      return chain.then(function () { return self.play(key); });
    }, Promise.resolve());
  };

  CutsceneManager.prototype.skip = function () {
    if (this._cleanup) this._cleanup('skipped');
  };

  CutsceneManager.prototype.setMuted = function (muted) {
    if (this.active) this.video.muted = !!muted;
  };

  CutsceneManager.prototype.setVolume = function (v) {
    this.video.volume = Math.max(0, Math.min(1, v));
  };

  global.CutsceneManager = CutsceneManager;
})(window);
