/* =============================================================
   Eva no Lixo Zero — motor, máquina de estados e campanha
   v3.0
   ============================================================= */
(function (global) {
  'use strict';

  var E = global.Entities;
  var L = global.Levels;
  var Assets = global.Assets;
  var audio = global.audio;

  var VW = global.Renderer.VW;
  var VH = global.Renderer.VH;
  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var STORAGE_KEY = 'eva_lixo_zero_platformer_records';
  var SETTINGS_KEY = 'eva_lixo_zero_settings';

  var STATE = {
    BOOT: 'boot',
    MAIN_MENU: 'main_menu',
    SETTINGS: 'settings',
    CUTSCENE: 'cutscene',
    TUTORIAL: 'tutorial',
    PLAYING: 'playing',
    PAUSED: 'paused',
    LEVEL_COMPLETE: 'level_complete',
    BOSS: 'boss',
    CREDITS: 'credits',
    ABOUT: 'about',
    GAME_OVER: 'game_over'
  };

  var START_LIVES = 3;
  var MAX_LIVES = 5;
  var MAX_PARTICLES = REDUCED ? 70 : 280;

  /* ================================================================ DOM */

  var $ = function (id) { return document.getElementById(id); };

  var dom = {
    canvas: $('game'),
    hud: $('hud'),
    level: $('hudLevel'),
    levelName: $('hudLevelName'),
    lives: $('hudLives'),
    score: $('hudScore'),
    best: $('hudBest'),
    meter: $('hudMeter'),
    meterFill: $('meterFill'),
    collect: $('hudCollect'),
    recycle: $('hudRecycle'),
    eco: $('hudEco'),
    ecoFill: $('ecoFill'),
    bossBar: $('bossBar'),
    bossTrack: $('bossTrack'),
    bossFill: $('bossFill'),
    bossPhase: $('bossPhase'),
    pauseBtn: $('pauseBtn'),
    touch: $('touchControls'),
    loader: $('loader'),
    loaderText: $('loaderText'),
    menu: $('menuScreen'),
    menuRecord: $('menuRecord'),
    settings: $('settingsScreen'),
    about: $('aboutScreen'),
    pause: $('pauseScreen'),
    dialog: $('dialogScreen'),
    dialogKicker: $('dialogKicker'),
    dialogTitle: $('dialogTitle'),
    dialogBody: $('dialogBody'),
    dialogActions: $('dialogActions'),
    tutorial: $('tutorialScreen'),
    credits: $('creditsScreen'),
    creditsScroll: $('creditsScroll'),
    skipCredits: $('btnSkipCredits'),
    banner: $('banner'),
    bannerTitle: $('bannerTitle'),
    bannerSub: $('bannerSub'),
    toast: $('toast'),
    musicVol: $('musicVol'),
    sfxVol: $('sfxVol'),
    musicVolOut: $('musicVolOut'),
    sfxVolOut: $('sfxVolOut'),
    btnMute: $('btnMute'),
    btnFullscreen: $('btnFullscreen')
  };

  var SCREENS = [dom.loader, dom.menu, dom.settings, dom.about, dom.pause, dom.dialog,
                 dom.tutorial, dom.credits];

  var renderer = new global.Renderer(dom.canvas);
  var cutscenes = new global.CutsceneManager($('cutsceneLayer'), $('cutsceneVideo'), $('skipCutscene'));

  /* ============================================================ storage */

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? Object.assign({}, fallback, JSON.parse(raw)) : Object.assign({}, fallback);
    } catch (e) {
      return Object.assign({}, fallback);
    }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* modo privado */ }
  }

  var records = loadJSON(STORAGE_KEY, { bestScore: 0, bestTime: null });
  var settings = loadJSON(SETTINGS_KEY, { muted: false, music: 60, sfx: 80 });

  /* ============================================================== input */

  var input = {
    left: false, right: false, down: false, jump: false,
    jumpQueued: false, jumpReleased: true,
    jumpHeld: false,    // estado fisico da tecla, independente da trava
    jumpLocked: false
  };

  function clearInput() {
    input.left = input.right = input.down = input.jump = false;
    input.jumpQueued = false;
    input.jumpReleased = true;
    /* So trava se a tecla continua fisicamente pressionada (por exemplo o
       Espaco que acabou de pular a cutscene). Travar sempre engoliria o
       primeiro pulo de cada fase. */
    input.jumpLocked = input.jumpHeld;
    Array.prototype.forEach.call(dom.touch.querySelectorAll('.tbtn'), function (b) {
      b.removeAttribute('data-on');
    });
  }

  var LEFT_KEYS = ['ArrowLeft', 'a', 'A'];
  var RIGHT_KEYS = ['ArrowRight', 'd', 'D'];
  var DOWN_KEYS = ['ArrowDown', 's', 'S'];
  var JUMP_KEYS = ['ArrowUp', 'w', 'W', ' ', 'Spacebar'];
  var PUNCH_KEYS = ['j', 'J', 'z', 'Z'];
  var ECO_KEYS = ['k', 'K', 'x', 'X'];

  function inArray(list, v) { return list.indexOf(v) >= 0; }

  global.addEventListener('keydown', function (e) {
    if (cutscenes.isActive()) return;
    if (e.repeat && !inArray(LEFT_KEYS, e.key) && !inArray(RIGHT_KEYS, e.key) &&
        !inArray(DOWN_KEYS, e.key)) return;

    if (inArray(LEFT_KEYS, e.key)) { input.left = true; e.preventDefault(); }
    if (inArray(RIGHT_KEYS, e.key)) { input.right = true; e.preventDefault(); }
    if (inArray(DOWN_KEYS, e.key)) { input.down = true; e.preventDefault(); }
    if (inArray(JUMP_KEYS, e.key)) {
      e.preventDefault();
      audio.unlock();
      input.jumpHeld = true;
      if (!input.jumpLocked && !input.jump) { input.jumpQueued = true; input.jumpReleased = false; }
      if (!input.jumpLocked) input.jump = true;
    }
    if (inArray(PUNCH_KEYS, e.key)) { e.preventDefault(); tryPunch(); }
    if (inArray(ECO_KEYS, e.key)) { e.preventDefault(); tryEco(); }

    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (game.state === STATE.PLAYING || game.state === STATE.BOSS) togglePause(true);
      else if (game.state === STATE.PAUSED) togglePause(false);
    }
    if (e.key === 'm' || e.key === 'M') setMuted(!audio.isMuted());
    if ((e.key === 'r' || e.key === 'R') &&
        (game.state === STATE.PLAYING || game.state === STATE.BOSS || game.state === STATE.PAUSED)) {
      restartLevel();
    }
  });

  global.addEventListener('keyup', function (e) {
    if (inArray(LEFT_KEYS, e.key)) input.left = false;
    if (inArray(RIGHT_KEYS, e.key)) input.right = false;
    if (inArray(DOWN_KEYS, e.key)) input.down = false;
    if (inArray(JUMP_KEYS, e.key)) {
      input.jump = false;
      input.jumpHeld = false;
      input.jumpReleased = true;
      input.jumpLocked = false;
    }
  });

  /* Modais navegaveis por teclado: o Tab circula dentro da tela aberta e
     o Esc volta, em vez de vazar o foco para o jogo atras. */
  var MODALS = ['settingsScreen', 'aboutScreen', 'pauseScreen', 'dialogScreen', 'tutorialScreen'];
  var ESC_CLOSES = { settingsScreen: 'btnCloseSettings', aboutScreen: 'btnCloseAbout' };

  function openModal() {
    for (var i = 0; i < MODALS.length; i++) {
      var el = $(MODALS[i]);
      if (el && !el.hidden) return el;
    }
    return null;
  }

  global.addEventListener('keydown', function (e) {
    var modal = openModal();
    if (!modal) return;
    if (e.key === 'Tab') {
      var items = modal.querySelectorAll('button:not([disabled]), input, [href], select, textarea');
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!modal.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    } else if (e.key === 'Escape' && ESC_CLOSES[modal.id]) {
      e.preventDefault();
      $(ESC_CLOSES[modal.id]).click();
    }
  }, true);

  global.addEventListener('blur', function () {
    clearInput();
    if (game.state === STATE.PLAYING || game.state === STATE.BOSS) togglePause(true);
  });

  /* ---- toque com suporte a multi-touch ---- */
  Array.prototype.forEach.call(dom.touch.querySelectorAll('.tbtn'), function (btn) {
    var act = btn.dataset.act;
    function set(on) {
      if (on) btn.setAttribute('data-on', '1'); else btn.removeAttribute('data-on');
      if (act === 'left') input.left = on;
      else if (act === 'right') input.right = on;
      else if (act === 'crouch') input.down = on;
      else if (act === 'jump') {
        if (on && !input.jump) { input.jumpQueued = true; input.jumpReleased = false; }
        if (!on) input.jumpReleased = true;
        input.jump = on;
      } else if (on && act === 'punch') tryPunch();
      else if (on && act === 'eco') tryEco();
    }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      audio.unlock();
      btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
      set(true);
    });
    ['pointerup', 'pointercancel'].forEach(function (evt) {
      btn.addEventListener(evt, function (e) { e.preventDefault(); set(false); });
    });
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  function detectTouch() {
    var touch = ('ontouchstart' in global) || (navigator.maxTouchPoints > 0);
    dom.touch.hidden = !touch;
  }

  function tryPunch() {
    if (!isPlayable() || !world.player) return;
    world.player.startPunch(world);
  }
  function tryEco() {
    if (!isPlayable() || !world.player) return;
    world.player.startEco(world);
  }
  function isPlayable() {
    return game.state === STATE.PLAYING || game.state === STATE.BOSS;
  }

  /* =============================================================== mundo */

  var world = {
    level: null,
    player: null,
    enemies: [],
    projectiles: [],
    particles: [],
    popups: [],
    scraps: [],
    boss: null,
    cameraX: 0,
    shake: 0,
    hitstop: 0,
    time: 0,
    tint: { color: null, alpha: 0 },
    audio: audio,
    lowHealthOn: false
  };

  world.emit = function (cfg, count) {
    if (REDUCED && cfg.kind !== 'ring') count = Math.ceil(count / 3);
    for (var i = 0; i < count; i++) {
      if (world.particles.length >= MAX_PARTICLES) world.particles.shift();
      var spread = cfg.spread != null ? cfg.spread : Math.PI * 2;
      var angle = (cfg.angle != null ? cfg.angle : 0) + (Math.random() - 0.5) * spread;
      var speed = cfg.speed * (0.45 + Math.random() * 0.75);
      var life = cfg.life * (0.65 + Math.random() * 0.6);
      world.particles.push({
        kind: cfg.kind || 'dust',
        x: cfg.x + (Math.random() - 0.5) * (cfg.jitter || 0),
        y: cfg.y + (Math.random() - 0.5) * (cfg.jitter || 0),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        grav: cfg.grav != null ? cfg.grav : 0,
        drag: cfg.drag != null ? cfg.drag : 1.4,
        size: cfg.size * (0.6 + Math.random() * 0.8),
        color: cfg.color,
        life: life, maxLife: life,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 8
      });
    }
  };

  world.emitRing = function (x, y, color, radius) {
    if (world.particles.length >= MAX_PARTICLES) world.particles.shift();
    world.particles.push({
      kind: 'ring', x: x, y: y, vx: 0, vy: 0, grav: 0, drag: 1,
      size: radius, color: color, life: 0.45, maxLife: 0.45, rot: 0, vr: 0
    });
  };

  world.addPopup = function (x, y, text, color) {
    world.popups.push({ x: x, y: y, text: text, color: color, life: 0.9, maxLife: 0.9 });
  };

  world.addShake = function (v) {
    if (REDUCED) return;
    world.shake = Math.min(20, world.shake + v);
  };

  world.toast = function (text) {
    dom.toast.textContent = text;
    dom.toast.hidden = true;
    void dom.toast.offsetWidth;
    dom.toast.hidden = false;
  };

  world.splash = function (x, y, kind) {
    world.emit({
      kind: 'spark', x: x, y: y, speed: 150, life: 0.45, size: 3.6,
      color: kind === 'slime' ? 'rgba(190,240,90,0.95)' : 'rgba(160,190,120,0.9)',
      grav: 400, drag: 1, angle: -Math.PI / 2, spread: 2.2
    }, 10);
  };

  world.spawnEcoWave = function (p) {
    var w = 52;
    world.projectiles.push(new E.Projectile({
      kind: 'eco',
      x: p.facing > 0 ? p.x + p.w - 6 : p.x - w + 6,
      y: p.y + 4,
      w: w, h: w,
      vx: p.facing * 520, vy: 0, grav: 0,
      life: 1.05, damage: E.EVA.ECO_DAMAGE, owner: 'player', pierce: true
    }));
    audio.playCue('eco');
    world.addShake(3);
    world.emitRing(p.x + p.w / 2, p.y + p.h / 2, 'rgba(160,255,190,0.85)', 26);
  };

  world.spawnTrashBall = function (e, p) {
    var from = e.center();
    var ballAnim = ((Assets.SPRITES.mosca || {}).anim || {}).ball;
    var t = 0.9;
    var dx = (p.x + p.w / 2) - from.x;
    var dy = (p.y + p.h / 2) - from.y;
    var grav = 320;
    world.projectiles.push(new E.Projectile({
      kind: 'trash',
      frame: ballAnim ? ballAnim[0] : null,
      x: from.x - 13, y: from.y - 6,
      w: 26, h: 26,
      vx: dx / t, vy: (dy - 0.5 * grav * t * t) / t,
      grav: grav, life: 3.2, damage: 1, owner: 'enemy', spin: 5,
      color: '#7E8C4A'
    }));
  };

  world.spawnBossSlime = function (b, count) {
    var from = { x: b.x + b.w / 2, y: b.y + 40 };
    for (var i = 0; i < count; i++) {
      var spread = (i - (count - 1) / 2) * 0.32;
      var speed = 380 + i * 24;
      world.projectiles.push(new E.Projectile({
        kind: 'slime',
        x: from.x, y: from.y, w: 30, h: 30,
        vx: b.facing * Math.cos(spread) * speed,
        vy: -260 + Math.abs(spread) * 120,
        grav: 620, life: 3.5, damage: 1, owner: 'enemy', spin: 7,
        color: '#A8E24A'
      }));
    }
  };

  world.spawnShockwaves = function (b) {
    var y = world.level.ground - 34;
    [-1, 1].forEach(function (dir) {
      world.projectiles.push(new E.Projectile({
        kind: 'shock',
        x: b.x + b.w / 2 - 22, y: y,
        w: 60, h: 34,
        vx: dir * 330, vy: 0, grav: 0,
        life: 2.2, damage: 1, owner: 'enemy'
      }));
    });
    world.emit({
      kind: 'dust', x: b.x + b.w / 2, y: world.level.ground, jitter: 60,
      angle: Math.PI, spread: Math.PI, speed: 220, life: 0.6, size: 8,
      color: 'rgba(200,230,150,0.6)', grav: 240
    }, 16);
  };

  world.spawnMinion = function (b) {
    var type = Math.random() < 0.5 ? 'goblin' : 'mosca';
    var side = Math.random() < 0.5 ? -1 : 1;
    var x = E.clamp(b.x + side * 320, 90, world.level.width - 140);
    var def = {
      type: type, x: x, left: Math.max(60, x - 260), right: Math.min(world.level.width - 80, x + 260),
      fromBoss: true
    };
    if (type === 'mosca') def.y = world.level.ground - 200;
    var minion = new E.Enemy(def, world.level);
    world.enemies.push(minion);
    world.emitRing(x, world.level.ground - 40, 'rgba(190,120,255,0.8)', 34);
  };

  world.hasBossMinion = function () {
    return world.enemies.some(function (e) { return e.fromBoss && !e.dead; });
  };

  world.onEnemyDefeated = function (e) {
    game.score += e.def.score;
    world.addPopup(e.x + e.w / 2, e.y, '+' + e.def.score, '#FFE49A');
    world.addShake(3);
    world.hitstop = REDUCED ? 0 : 0.04;
  };

  world.onBossPhase = function (phase) {
    world.toast('Lixórion muda de padrão — fase ' + phase);
    world.addShake(9);
    audio.playSfx('bossSpawn');
    dom.bossBar.setAttribute('data-phase', String(phase));
    dom.bossPhase.textContent = 'Fase ' + phase;
  };

  world.onBossDefeated = function () {
    audio.stopMusic(1200);
    audio.stopLoop('lowHealth');
    world.addShake(16);
    world.emit({
      kind: 'spark', x: world.boss.x + world.boss.w / 2, y: world.boss.y + world.boss.h / 2,
      speed: 320, life: 1.1, size: 6, color: 'rgba(200,255,150,0.95)', grav: 320, drag: 0.8
    }, 40);
    game.bossBeaten = true;
  };

  /* ============================================================== jogo */

  var game = {
    state: STATE.BOOT,
    levelIndex: 0,
    score: 0,
    scoreAtLevelStart: 0,
    lives: START_LIVES,
    levelElapsed: 0,
    totalElapsed: 0,
    running: false,
    bossBeaten: false,
    resolver: null,
    lastCheckpoint: null,
    deathTimer: 0,
    endTimer: 0,
    ending: false
  };

  function setState(s) { game.state = s; }

  /* ---------------------------------------------------------- telas */

  function hideScreens() {
    SCREENS.forEach(function (el) { if (el) el.hidden = true; });
  }

  function showScreen(el) {
    hideScreens();
    if (el) {
      el.hidden = false;
      var focusable = el.querySelector('button, [href], input, select, textarea');
      if (focusable) focusable.focus({ preventScroll: true });
    }
  }

  function setHudVisible(on, boss) {
    dom.hud.setAttribute('data-hidden', on ? 'false' : 'true');
    dom.bossBar.hidden = !boss;
    dom.recycle.hidden = !!boss;
  }

  function showBanner(title, sub) {
    dom.bannerTitle.textContent = title;
    dom.bannerSub.textContent = sub || '';
    dom.banner.hidden = true;
    void dom.banner.offsetWidth;
    dom.banner.hidden = false;
  }

  function openDialog(opts) {
    dom.dialogKicker.textContent = opts.kicker || '';
    dom.dialogTitle.textContent = opts.title || '';
    dom.dialogBody.innerHTML = opts.body || '';
    dom.dialogActions.innerHTML = '';
    (opts.actions || []).forEach(function (a) {
      var btn = document.createElement('button');
      btn.className = a.primary ? 'btn btn-primary' : 'btn';
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        audio.unlock();
        audio.playCue('ui');
        a.onClick();
      });
      dom.dialogActions.appendChild(btn);
    });
    showScreen(dom.dialog);
  }

  function statsHTML(items) {
    return '<div class="overlay-stats">' + items.map(function (i) {
      return '<div class="stat' + (i.gold ? ' gold' : '') + '"><span>' + i.label +
             '</span><strong>' + i.value + '</strong></div>';
    }).join('') + '</div>';
  }

  /* ---------------------------------------------------------- HUD */

  var hudCache = { level: '', score: -1, lives: -1, collect: '', eco: -1, boss: -1 };

  function forceHUD() {
    hudCache.level = ''; hudCache.score = -1; hudCache.lives = -1;
    hudCache.collect = ''; hudCache.eco = -1; hudCache.boss = -1;
    updateHUD();
  }

  function updateHUD() {
    var level = world.level;
    if (!level) return;

    var lvlText = level.isBoss ? 'BOSS' : String(level.id);
    if (lvlText !== hudCache.level) {
      hudCache.level = lvlText;
      dom.level.textContent = lvlText;
      dom.levelName.textContent = level.name;
    }

    if (game.score !== hudCache.score) {
      hudCache.score = game.score;
      dom.score.textContent = game.score;
      dom.score.classList.remove('bump');
      void dom.score.offsetWidth;
      dom.score.classList.add('bump');
    }

    if (game.lives !== hudCache.lives) {
      hudCache.lives = game.lives;
      dom.lives.innerHTML = '';
      for (var i = 0; i < MAX_LIVES; i++) {
        if (i >= Math.max(START_LIVES, game.lives)) break;
        var pip = document.createElement('i');
        if (i >= game.lives) pip.className = 'empty';
        dom.lives.appendChild(pip);
      }
      dom.lives.setAttribute('aria-label', game.lives + ' vidas restantes');
    }

    if (!level.isBoss) {
      var total = level.collectibles.length;
      var got = 0;
      for (var k = 0; k < total; k++) if (level.collectibles[k].collected) got++;
      var cText = got + '/' + total;
      if (cText !== hudCache.collect) {
        hudCache.collect = cText;
        dom.collect.textContent = cText;
        var pct = total ? (got / total) * 100 : 100;
        dom.meterFill.style.width = pct + '%';
        dom.meter.setAttribute('aria-valuenow', Math.round(pct));
        dom.meter.classList.toggle('full', got === total && total > 0);
      }
    }

    var eco = world.player ? Math.round(world.player.ecoMeter * 100) : 0;
    if (eco !== hudCache.eco) {
      hudCache.eco = eco;
      dom.ecoFill.style.width = eco + '%';
      dom.eco.setAttribute('aria-valuenow', eco);
    }

    if (world.boss) {
      var bp = Math.round(world.boss.ratio() * 100);
      if (bp !== hudCache.boss) {
        hudCache.boss = bp;
        dom.bossFill.style.width = bp + '%';
        dom.bossTrack.setAttribute('aria-valuenow', bp);
      }
    }
  }

  function updateRecordsUI() {
    dom.best.textContent = records.bestScore || 0;
    dom.menuRecord.textContent = records.bestScore
      ? 'Recorde: ' + records.bestScore + ' pontos' +
        (records.bestTime != null ? ' · ' + records.bestTime.toFixed(1) + 's' : '')
      : '';
  }

  /* ---------------------------------------------------- carregamento */

  function setLoading(text) {
    dom.loaderText.textContent = text;
    showScreen(dom.loader);
  }

  function levelAssetKeys(data) {
    var keys = [data.map, data.set];
    (data.enemyTypes || []).forEach(function (t) { if (keys.indexOf(t) < 0) keys.push(t); });
    if (data.isBoss) keys.push('lixorion');
    return keys.filter(function (k) { return !!Assets.ASSETS.images[k]; });
  }

  function prepareLevel(data) {
    setLoading('Carregando ' + data.name + '…');
    return Assets.loadGroup(levelAssetKeys(data)).then(function (failedKeys) {
      if (failedKeys.length) {
        console.warn('[fase] assets ausentes:', failedKeys.join(', '));
      }
      return audio.preloadMusic(data.music);
    });
  }

  /* ------------------------------------------------------ ciclo de fase */

  function buildWorld(data, keepScore) {
    world.level = L.build(data);
    world.enemies = (data.enemies || []).map(function (d) { return new E.Enemy(d, world.level); });
    world.projectiles.length = 0;
    world.particles.length = 0;
    world.popups.length = 0;
    world.scraps = (data.scrapSpots || []).map(function (s) {
      return { x: s.x, y: data.ground - 30, kind: s.kind, ready: true, timer: 0, bob: Math.random() * 6.28 };
    });
    world.boss = data.boss ? new E.Boss(data.boss, world.level) : null;
    world.cameraX = 0;
    world.shake = 0;
    world.hitstop = 0;
    world.tint.alpha = 0;
    world.lowHealthOn = false;
    audio.stopLoop('lowHealth');

    var p = new E.Player(world.level.spawn.x, world.level.spawn.y);
    p.respawn = { x: world.level.spawn.x, y: world.level.spawn.y };
    world.player = p;
    game.lastCheckpoint = null;
    game.levelElapsed = 0;
    game.deathTimer = 0;
    game.ending = false;
    if (!keepScore) game.scoreAtLevelStart = game.score;
    forceHUD();
  }

  function startLevelSession(data) {
    buildWorld(data, false);
    setHudVisible(true, !!data.isBoss);
    if (data.isBoss) {
      dom.bossBar.setAttribute('data-phase', '1');
      dom.bossPhase.textContent = 'Fase 1';
      dom.bossFill.style.width = '100%';
      audio.playSfx('bossSpawn');
    }
    showBanner(data.isBoss ? 'Lixórion' : 'Fase ' + data.id, data.name);
    audio.playMusic(data.music, { fade: 800 });
    clearInput();
    setState(data.isBoss ? STATE.BOSS : STATE.PLAYING);
    hideScreens();
  }

  /** Roda uma fase ate a conclusao. Resolve com 'complete' | 'menu'. */
  function runLevelOnce(data) {
    return new Promise(function (resolve) {
      game.resolver = resolve;
      prepareLevel(data).then(function () {
        startLevelSession(data);
      });
    });
  }

  function playLevel(data) {
    return runLevelOnce(data).then(function (res) {
      if (res === 'retry') {
        game.lives = START_LIVES;
        game.score = game.scoreAtLevelStart;
        return playLevel(data);
      }
      return res;
    });
  }

  function finishLevel() {
    if (game.ending) return;
    game.ending = true;
    var level = world.level;
    var timeBonus = Math.max(0, Math.floor(1200 - game.levelElapsed * 22));
    game.score += 500 + timeBonus;
    game.totalElapsed += game.levelElapsed;
    game.lives = Math.min(MAX_LIVES, game.lives + 1);
    audio.stopLoop('lowHealth');
    audio.playSfx('stageComplete');
    /* tela de balanco entre fases: eva_stage_select entra como interludio */
    audio.playMusic('select', { fade: 900 });
    world.addShake(6);
    world.tint.color = 'rgba(255,255,255,0.55)';
    world.tint.alpha = 0.55;
    setState(STATE.LEVEL_COMPLETE);
    setHudVisible(false, false);

    if (game.score > (records.bestScore || 0)) {
      records.bestScore = game.score;
      saveJSON(STORAGE_KEY, records);
      updateRecordsUI();
    }

    openDialog({
      kicker: 'Fase concluída',
      title: level.name,
      body: '<p>Percurso limpo. A Eva segue em frente.</p>' + statsHTML([
        { label: 'Bônus de tempo', value: timeBonus, gold: true },
        { label: 'Pontos', value: game.score },
        { label: 'Tempo', value: game.levelElapsed.toFixed(1) + 's' },
        { label: 'Vidas', value: game.lives }
      ]),
      actions: [{
        label: 'Continuar', primary: true,
        onClick: function () { hideScreens(); resolveLevel('complete'); }
      }]
    });
  }

  function finishBoss() {
    if (game.ending) return;
    game.ending = true;
    game.score += 3000;
    game.totalElapsed += game.levelElapsed;
    setState(STATE.LEVEL_COMPLETE);
    setHudVisible(false, false);
    if (game.score > (records.bestScore || 0)) records.bestScore = game.score;
    if (records.bestTime == null || game.totalElapsed < records.bestTime) {
      records.bestTime = game.totalElapsed;
    }
    saveJSON(STORAGE_KEY, records);
    updateRecordsUI();
    hideScreens();
    resolveLevel('complete');
  }

  function resolveLevel(result) {
    var r = game.resolver;
    game.resolver = null;
    if (r) r(result);
  }

  function gameOver() {
    setState(STATE.GAME_OVER);
    setHudVisible(false, false);
    audio.stopLoop('lowHealth');
    audio.stopMusic(600);
    audio.playSfx('gameOver');
    openDialog({
      kicker: 'Fim de jogo',
      title: 'A Eva não resistiu',
      body: '<p>Lixórion avança enquanto o lixo continua espalhado. Tente outra vez.</p>' +
        statsHTML([
          { label: 'Pontos', value: game.score },
          { label: 'Fase', value: world.level ? world.level.name : '-', gold: true },
          { label: 'Recorde', value: records.bestScore || 0 }
        ]),
      actions: [
        { label: 'Tentar novamente', primary: true, onClick: function () { hideScreens(); resolveLevel('retry'); } },
        { label: 'Voltar ao menu', onClick: function () { hideScreens(); resolveLevel('menu'); } }
      ]
    });
  }

  function restartLevel() {
    if (!world.level) return;
    audio.stopLoop('lowHealth');
    game.lives = START_LIVES;
    game.score = game.scoreAtLevelStart;
    hideScreens();
    buildWorld(world.level.data, true);
    setHudVisible(true, !!world.level.isBoss);
    showBanner(world.level.isBoss ? 'Lixórion' : 'Fase ' + world.level.id, world.level.name);
    setState(world.level.isBoss ? STATE.BOSS : STATE.PLAYING);
    clearInput();
  }

  function loseLife(reason) {
    var p = world.player;
    game.lives -= 1;
    audio.stopLoop('lowHealth');
    world.lowHealthOn = false;
    world.addShake(12);
    world.tint.color = 'rgba(255,90,70,0.45)';
    world.tint.alpha = 0.5;
    world.hitstop = REDUCED ? 0 : 0.09;
    world.emit({
      kind: 'shard', x: p.x + p.w / 2, y: p.y + p.h / 2, speed: 240, life: 0.7, size: 7,
      color: '#FF8B7A', grav: 700, drag: 0.8
    }, 14);
    p.defeat();
    audio.playSfx('death');
    game.deathTimer = E.EVA.DEFEAT_DUR;
    if (reason) world.toast(reason);
    forceHUD();
  }

  function respawnPlayer() {
    var level = world.level;
    var spot = game.lastCheckpoint || level.spawn;
    var p = new E.Player(spot.x, spot.y);
    p.respawn = { x: spot.x, y: spot.y };
    p.invuln = 1.4;
    p.ecoMeter = Math.max(0.5, world.player ? world.player.ecoMeter : 1);
    world.player = p;
    world.projectiles.length = 0;
    world.cameraX = E.clamp(spot.x - VW * 0.45, 0, level.width - VW);
    /* inimigos derrubados continuam derrubados: nada de farm infinito */
    world.enemies.forEach(function (e) {
      if (!e.dead) {
        e.hp = e.maxHp;
        e.setState(e.type === 'mosca' ? 'fly' : 'patrol');
      }
    });
    game.deathTimer = 0;
  }

  /* ---------------------------------------------------------- simulação */

  function step(dt) {
    world.time += dt;

    if (!isPlayable() || !world.level || !world.player) {
      updateParticles(dt);
      decayEffects(dt);
      return;
    }

    if (world.hitstop > 0) {
      world.hitstop -= dt;
      decayEffects(dt);
      return;
    }

    var p = world.player;
    var level = world.level;

    if (game.deathTimer > 0) {
      game.deathTimer -= dt;
      p.stateTime += dt;
      p.vy = Math.min(E.MAX_FALL, p.vy + E.GRAVITY * dt);
      p.y += p.vy * dt;
      p.onGround = false;
      E.resolveAxis(p, level.platforms, 'y');
      updateParticles(dt);
      decayEffects(dt);
      if (game.deathTimer <= 0) {
        if (game.lives <= 0) gameOver();
        else respawnPlayer();
      }
      return;
    }

    game.levelElapsed += dt;
    p.update(dt, world, input);

    /* --- inimigos --- */
    for (var i = world.enemies.length - 1; i >= 0; i--) {
      var e = world.enemies[i];
      e.update(dt, world);
      if (e.remove) { world.enemies.splice(i, 1); continue; }
      if (e.dead) continue;

      var abox = e.attackBox ? e.attackBox() : null;
      if (abox && E.hitsRect(p, abox.x, abox.y, abox.w, abox.h)) {
        hurtPlayer(e.x + e.w / 2, e.def.knockback);
      } else {
        var tb = e.touchBox();
        if (E.rectOverlap(p.x + 6, p.y + 4, p.w - 12, p.h - 6, tb.x + 5, tb.y, tb.w - 10, tb.h)) {
          hurtPlayer(e.x + e.w / 2, e.type === 'latao' ? 1.4 : 1);
        }
      }
    }

    /* --- chefão --- */
    if (world.boss) {
      var b = world.boss;
      b.update(dt, world);
      if (!b.dead) {
        var bbox = b.attackBox();
        if (bbox && E.hitsRect(p, bbox.x, bbox.y, bbox.w, bbox.h)) hurtPlayer(b.x + b.w / 2, 1.4);
      } else if (b.state === 'defeat' && b.stateTime >= E.BOSS.DEFEAT_TIME) {
        finishBoss();
        return;
      }
    }

    /* --- ataques da Eva --- */
    var punch = p.punchBox();
    if (punch) {
      for (var j = 0; j < world.enemies.length; j++) {
        var en = world.enemies[j];
        if (en.dead || p.attackHits.indexOf(en) >= 0) continue;
        if (E.hitsRect(en, punch.x, punch.y, punch.w, punch.h)) {
          p.attackHits.push(en);
          en.takeDamage(E.EVA.PUNCH_DAMAGE, world, p.x + p.w / 2);
          world.hitstop = REDUCED ? 0 : 0.035;
        }
      }
      if (world.boss && !world.boss.dead && p.attackHits.indexOf(world.boss) < 0) {
        var hb = world.boss.hitBox();
        if (E.rectOverlap(punch.x, punch.y, punch.w, punch.h, hb.x, hb.y, hb.w, hb.h)) {
          p.attackHits.push(world.boss);
          world.boss.takeDamage(1, world, p.x + p.w / 2);
        }
      }
    }

    /* --- projéteis --- */
    for (var k = world.projectiles.length - 1; k >= 0; k--) {
      var pr = world.projectiles[k];
      pr.update(dt, world);
      if (pr.dead) { world.projectiles.splice(k, 1); continue; }

      if (pr.owner === 'player') {
        for (var m = 0; m < world.enemies.length; m++) {
          var tgt = world.enemies[m];
          if (tgt.dead || pr.hits.indexOf(tgt) >= 0) continue;
          if (E.hitsRect(tgt, pr.x, pr.y, pr.w, pr.h)) {
            pr.hits.push(tgt);
            tgt.takeDamage(pr.damage, world, pr.x);
          }
        }
        if (world.boss && !world.boss.dead && pr.hits.indexOf(world.boss) < 0) {
          var bh = world.boss.hitBox();
          if (E.rectOverlap(pr.x, pr.y, pr.w, pr.h, bh.x, bh.y, bh.w, bh.h)) {
            pr.hits.push(world.boss);
            world.boss.takeDamage(pr.damage, world, pr.x);
            world.boss.stagger(world);
          }
        }
      } else if (E.hitsRect(p, pr.x, pr.y, pr.w, pr.h)) {
        if (hurtPlayer(pr.x + pr.w / 2, 1)) {
          if (pr.kind !== 'shock') { pr.dead = true; world.splash(pr.x, pr.y, pr.kind); }
        }
      }
    }

    /* --- coletáveis --- */
    for (var c = 0; c < level.collectibles.length; c++) {
      var item = level.collectibles[c];
      item.bob += dt * 2.4;
      if (item.collected) continue;
      if (E.rectOverlap(p.x, p.y, p.w, p.h, item.x - 18, item.y - 18, 36, 36)) {
        collectItem(item);
      }
    }

    /* --- resíduos da arena do chefão --- */
    for (var s = 0; s < world.scraps.length; s++) {
      var sc = world.scraps[s];
      sc.bob += dt * 2.2;
      if (!sc.ready) {
        sc.timer -= dt;
        if (sc.timer <= 0) sc.ready = true;
        continue;
      }
      if (E.rectOverlap(p.x, p.y, p.w, p.h, sc.x - 20, sc.y - 20, 40, 40)) {
        sc.ready = false;
        sc.timer = 7;
        p.ecoMeter = Math.min(1, p.ecoMeter + 0.5);
        game.score += 60;
        audio.playSfx('collect');
        world.addPopup(sc.x, sc.y - 12, '+ECO', '#9BF3D0');
        world.emitRing(sc.x, sc.y, 'rgba(140,255,200,0.7)', 18);
      }
    }

    /* --- checkpoints --- */
    for (var cp = 0; cp < level.checkpoints.length; cp++) {
      var point = level.checkpoints[cp];
      if (point.taken) continue;
      if (Math.abs((p.x + p.w / 2) - point.x) < 40 && Math.abs((p.y + p.h) - point.y) < 150) {
        point.taken = true;
        game.lastCheckpoint = { x: point.x - 20, y: point.y - 80 };
        audio.playCue('checkpoint');
        world.toast('Checkpoint alcançado');
        world.emitRing(point.x, point.y - 40, 'rgba(140,255,180,0.8)', 26);
      }
    }

    /* --- portal --- */
    if (level.exit) {
      var open = level.collectibles.every(function (it) { return it.collected; });
      if (open && E.rectOverlap(p.x, p.y, p.w, p.h, level.exit.x, level.exit.y, level.exit.w, level.exit.h)) {
        finishLevel();
        return;
      }
      if (open && !REDUCED && Math.random() < 0.3) {
        world.emit({
          kind: 'spark', x: level.exit.x + level.exit.w / 2 + (Math.random() - 0.5) * 40,
          y: level.exit.y + level.exit.h, speed: 40, life: 0.9, size: 2.6,
          color: 'rgba(140,255,190,0.9)', grav: -110, drag: 0.6, angle: -Math.PI / 2, spread: 0.8
        }, 1);
      }
    }

    /* --- queda no vazio --- */
    if (p.y > VH + 260) {
      loseLife('A Eva caiu!');
      return;
    }

    /* --- vida crítica --- */
    var critical = game.lives === 1 && !p.dead;
    if (critical && !world.lowHealthOn) {
      world.lowHealthOn = true;
      audio.startLoop('lowHealth');
    } else if (!critical && world.lowHealthOn) {
      world.lowHealthOn = false;
      audio.stopLoop('lowHealth');
    }

    /* --- câmera --- */
    var lookAhead = p.facing * 70;
    var targetX = p.x + p.w / 2 - VW * 0.45 + lookAhead;
    world.cameraX += (targetX - world.cameraX) * Math.min(1, dt * 4.5);
    world.cameraX = E.clamp(world.cameraX, 0, Math.max(0, level.width - VW));

    updateParticles(dt);
    decayEffects(dt);
    updateHUD();
  }

  function collectItem(item) {
    item.collected = true;
    game.score += 100;
    var c = L.KIND_COLORS[item.kind];
    audio.playSfx('collect');
    world.addPopup(item.x, item.y - 12, '+100', c.main);
    world.emitRing(item.x, item.y, c.aura, 16);
    world.emit({
      kind: 'spark', x: item.x, y: item.y, speed: 170, life: 0.55, size: 3.6,
      color: c.main, grav: 220, drag: 1.1
    }, 12);
    world.player.ecoMeter = Math.min(1, world.player.ecoMeter + E.EVA.ECO_PICKUP);
    world.hitstop = REDUCED ? 0 : 0.03;

    var remaining = world.level.collectibles.filter(function (i) { return !i.collected; }).length;
    if (remaining === 0) {
      audio.playCue('unlock');
      world.toast('Portal aberto! Corra até ele');
      world.tint.color = 'rgba(120,255,180,0.35)';
      world.tint.alpha = 0.35;
      world.addShake(5);
      if (world.level.exit) {
        world.emitRing(world.level.exit.x + world.level.exit.w / 2,
                       world.level.exit.y + world.level.exit.h / 2,
                       'rgba(120,255,180,0.8)', 40);
      }
    } else {
      world.toast(L.KIND_LABEL[item.kind] + ' reciclado · faltam ' + remaining);
    }
  }

  function hurtPlayer(fromX, power) {
    var p = world.player;
    if (!p.hurt(world, fromX, power)) return false;
    audio.playSfx('hit');
    world.addShake(7);
    world.tint.color = 'rgba(255,90,70,0.35)';
    world.tint.alpha = 0.35;
    world.hitstop = REDUCED ? 0 : 0.05;
    world.emit({
      kind: 'shard', x: p.x + p.w / 2, y: p.y + p.h / 2, speed: 200, life: 0.5, size: 5,
      color: '#FF9B84', grav: 600, drag: 0.9
    }, 8);
    game.lives -= 1;
    forceHUD();
    if (game.lives <= 0) {
      p.defeat();
      audio.playSfx('death');
      audio.stopLoop('lowHealth');
      world.lowHealthOn = false;
      game.deathTimer = E.EVA.DEFEAT_DUR;
    }
    return true;
  }

  function updateParticles(dt) {
    for (var i = world.particles.length - 1; i >= 0; i--) {
      var p = world.particles[i];
      p.life -= dt;
      if (p.life <= 0) { world.particles.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt * 0.3;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (var j = world.popups.length - 1; j >= 0; j--) {
      var q = world.popups[j];
      q.life -= dt;
      q.y -= 34 * dt;
      if (q.life <= 0) world.popups.splice(j, 1);
    }
  }

  function decayEffects(dt) {
    if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 26);
    if (world.tint.alpha > 0) world.tint.alpha = Math.max(0, world.tint.alpha - dt * 1.6);
  }

  /* ---------------------------------------------------------- desenho */

  function groundBelow(body) {
    var best = VH + 200;
    var platforms = world.level.platforms;
    var cx = body.x + body.w * 0.5;
    for (var i = 0; i < platforms.length; i++) {
      var plat = platforms[i];
      if (cx < plat.x || cx > plat.x + plat.w) continue;
      if (plat.y >= body.y + body.h - 2 && plat.y < best) best = plat.y;
    }
    return best;
  }

  function render() {
    var ctx = renderer.ctx;
    ctx.setTransform(renderer.dpr, 0, 0, renderer.dpr, 0, 0);
    ctx.clearRect(0, 0, VW, VH);

    if (!world.level) {
      ctx.fillStyle = '#08150E';
      ctx.fillRect(0, 0, VW, VH);
      return;
    }

    var sx = 0, sy = 0;
    if (world.shake > 0.1) {
      sx = (Math.random() - 0.5) * world.shake;
      sy = (Math.random() - 0.5) * world.shake;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.save();
    ctx.translate(-Math.round(world.cameraX), 0);

    var level = world.level;
    renderer.background(level, world.cameraX);
    renderer.decor(level, world.cameraX);
    renderer.platforms(level, world.cameraX);

    for (var i = 0; i < level.checkpoints.length; i++) {
      var cp = level.checkpoints[i];
      if (cp.x < world.cameraX - 80 || cp.x > world.cameraX + VW + 80) continue;
      renderer.checkpoint(cp, world.time);
    }

    if (level.exit) {
      var open = level.collectibles.every(function (it) { return it.collected; });
      var remaining = level.collectibles.filter(function (it) { return !it.collected; }).length;
      if (level.exit.x + level.exit.w > world.cameraX - 220 && level.exit.x < world.cameraX + VW + 220) {
        renderer.portal(level.exit, open, remaining, world.time);
      }
    }

    for (var c = 0; c < level.collectibles.length; c++) {
      var item = level.collectibles[c];
      if (item.collected) continue;
      if (item.x < world.cameraX - 60 || item.x > world.cameraX + VW + 60) continue;
      renderer.collectible(item);
    }

    for (var s = 0; s < world.scraps.length; s++) {
      var sc = world.scraps[s];
      if (!sc.ready) continue;
      renderer.collectible({ x: sc.x, y: sc.y, kind: sc.kind, bob: sc.bob });
    }

    if (world.boss) renderer.boss(world.boss, level.ground, world.time);

    for (var e = 0; e < world.enemies.length; e++) {
      renderer.enemy(world.enemies[e], world.cameraX, groundBelow(world.enemies[e]));
    }

    for (var pr = 0; pr < world.projectiles.length; pr++) {
      renderer.projectile(world.projectiles[pr], world.time);
    }

    renderer.particles(world.particles);
    if (world.player) renderer.player(world.player, groundBelow(world.player), world.time);
    renderer.popups(world.popups);

    ctx.restore();

    if (world.tint.alpha > 0) renderer.tint(world.tint.color, world.tint.alpha);
    renderer.vignette(level.isBoss ? 0.42 : 0.22);
    ctx.restore();

    if (game.state === STATE.PAUSED) renderer.pauseVeil();
  }

  /* ------------------------------------------------------------ pausa */

  function togglePause(pause) {
    if (pause && isPlayable()) {
      setState(STATE.PAUSED);
      audio.pauseMusic();
      audio.playCue('ui');
      clearInput();
      showScreen(dom.pause);
    } else if (!pause && game.state === STATE.PAUSED) {
      hideScreens();
      setState(world.level && world.level.isBoss ? STATE.BOSS : STATE.PLAYING);
      audio.resumeMusic();
      audio.playCue('ui');
      clearInput();
    }
  }

  /* --------------------------------------------------------- campanha */

  function playCutscenes(keys) {
    setState(STATE.CUTSCENE);
    setHudVisible(false, false);
    hideScreens();
    audio.stopLoop('lowHealth');
    audio.stopMusic(350);
    return cutscenes.playSequence(keys).then(function () {
      clearInput();
    });
  }

  function runTutorial() {
    return new Promise(function (resolve) {
      setState(STATE.TUTORIAL);
      setHudVisible(false, false);
      audio.playMusic('tutorial', { fade: 700 });
      showScreen(dom.tutorial);
      var btn = $('btnTutorialStart');
      function go() {
        btn.removeEventListener('click', go);
        audio.playCue('ui');
        hideScreens();
        clearInput();
        resolve();
      }
      btn.addEventListener('click', go);
    });
  }

  function runCredits() {
    return new Promise(function (resolve) {
      setState(STATE.CREDITS);
      setHudVisible(false, false);
      audio.playMusic('finalPath', { fade: 900 });
      showScreen(dom.credits);
      /* reinicia a animacao de rolagem */
      var node = dom.creditsScroll;
      node.style.animation = 'none';
      void node.offsetWidth;
      node.style.animation = '';

      var done = false;
      function finish() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        node.removeEventListener('animationend', finish);
        dom.skipCredits.removeEventListener('click', onSkip);
        global.removeEventListener('keydown', onKey, true);
        hideScreens();
        clearInput();
        resolve();
      }
      function onSkip() { audio.playCue('ui'); finish(); }
      function onKey(e) {
        if (['Escape', 'Enter', ' ', 'Spacebar'].indexOf(e.key) >= 0) {
          e.preventDefault();
          e.stopPropagation();
          finish();
        }
      }
      node.addEventListener('animationend', finish);
      dom.skipCredits.addEventListener('click', onSkip);
      global.addEventListener('keydown', onKey, true);
      /* rede de seguranca: a rolagem dura 28 s no CSS e o animationend fecha
         a tela antes disso; com reduced-motion nao ha animacao para esperar. */
      var timer = setTimeout(finish, REDUCED ? 14000 : 32000);
    });
  }

  function startCampaign() {
    game.score = 0;
    game.lives = START_LIVES;
    game.totalElapsed = 0;
    game.bossBeaten = false;
    game.levelIndex = 0;

    playCutscenes(['opening', 'birth', 'overrun', 'decide'])
      .then(runTutorial)
      .then(function () { return runSequence(0); });
  }

  function runSequence(index) {
    if (index >= L.LEVELS.length) return runFinale();
    game.levelIndex = index;
    return playLevel(L.LEVELS[index]).then(function (res) {
      if (res === 'menu') return goMenu();
      return runSequence(index + 1);
    });
  }

  function runFinale() {
    return playCutscenes(['fortress', 'transform'])
      .then(function () { return playLevel(L.BOSS_LEVEL); })
      .then(function (res) {
        if (res === 'menu') return goMenu();
        return playCutscenes(['bossDefeat', 'ending'])
          .then(runCredits)
          .then(function () { return playCutscenes(['postFriends', 'postLixorion']); })
          .then(goMenu);
      });
  }

  function goMenu() {
    setState(STATE.MAIN_MENU);
    setHudVisible(false, false);
    world.level = null;
    world.player = null;
    world.enemies.length = 0;
    world.projectiles.length = 0;
    world.particles.length = 0;
    world.boss = null;
    audio.stopLoop('lowHealth');
    audio.playMusic('menu', { fade: 900 });
    updateRecordsUI();
    showScreen(dom.menu);
    clearInput();
  }

  /* ------------------------------------------------------------- UI */

  function setMuted(v) {
    audio.setMuted(v);
    settings.muted = v;
    saveJSON(SETTINGS_KEY, settings);
    dom.btnMute.setAttribute('aria-pressed', String(v));
    dom.btnMute.textContent = v ? 'Mudo' : 'Ligado';
    cutscenes.setMuted(v);
  }

  function applySettings() {
    dom.musicVol.value = settings.music;
    dom.sfxVol.value = settings.sfx;
    dom.musicVolOut.textContent = settings.music;
    dom.sfxVolOut.textContent = settings.sfx;
    audio.setMusicVolume(settings.music / 100);
    audio.setSfxVolume(settings.sfx / 100);
    audio.setMuted(!!settings.muted);
    dom.btnMute.setAttribute('aria-pressed', String(!!settings.muted));
    dom.btnMute.textContent = settings.muted ? 'Mudo' : 'Ligado';
  }

  dom.musicVol.addEventListener('input', function () {
    var v = Number(dom.musicVol.value);
    dom.musicVolOut.textContent = v;
    settings.music = v;
    audio.setMusicVolume(v / 100);
    cutscenes.setVolume(v / 100);
    saveJSON(SETTINGS_KEY, settings);
  });

  dom.sfxVol.addEventListener('input', function () {
    var v = Number(dom.sfxVol.value);
    dom.sfxVolOut.textContent = v;
    settings.sfx = v;
    audio.setSfxVolume(v / 100);
    saveJSON(SETTINGS_KEY, settings);
  });
  dom.sfxVol.addEventListener('change', function () { audio.unlock(); audio.playSfx('collect'); });

  dom.btnMute.addEventListener('click', function () {
    audio.unlock();
    setMuted(!audio.isMuted());
  });

  dom.btnFullscreen.addEventListener('click', function () {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  });

  document.addEventListener('fullscreenchange', function () {
    var on = !!document.fullscreenElement;
    dom.btnFullscreen.setAttribute('aria-pressed', String(on));
    dom.btnFullscreen.textContent = on ? 'Ligada' : 'Desligada';
  });

  if (!document.documentElement.requestFullscreen) {
    dom.btnFullscreen.disabled = true;
    dom.btnFullscreen.textContent = 'Indisponível';
  }

  var settingsReturn = null;

  function openSettings(from) {
    settingsReturn = from;
    setState(STATE.SETTINGS);
    showScreen(dom.settings);
  }

  $('btnSettings').addEventListener('click', function () { audio.unlock(); openSettings('menu'); });
  $('btnPauseSettings').addEventListener('click', function () { openSettings('pause'); });
  $('btnCloseSettings').addEventListener('click', function () {
    audio.playCue('ui');
    if (settingsReturn === 'pause') {
      setState(STATE.PAUSED);
      showScreen(dom.pause);
    } else {
      goMenu();
    }
  });

  $('btnCredits').addEventListener('click', function () {
    audio.unlock();
    audio.playCue('ui');
    setState(STATE.ABOUT);
    showScreen(dom.about);
  });
  $('btnCloseAbout').addEventListener('click', function () {
    audio.playCue('ui');
    goMenu();
  });

  $('btnPlay').addEventListener('click', function () {
    audio.unlock();
    audio.playCue('ui');
    hideScreens();
    startCampaign();
  });

  $('btnQuit').addEventListener('click', function () {
    audio.playCue('ui');
    /* window.close() so funciona em janelas abertas por script; nos demais
       casos o navegador ignora e a mensagem abaixo aparece. */
    try { global.close(); } catch (e) { /* bloqueado pelo navegador */ }
    setTimeout(function () {
      if (!global.closed) {
        openDialog({
          kicker: 'Até a próxima',
          title: 'Obrigado por jogar',
          body: '<p>O navegador não permite que a página se feche sozinha. ' +
                'Você pode fechar esta janela ou aba para sair do jogo.</p>',
          actions: [{ label: 'Voltar ao menu', primary: true, onClick: goMenu }]
        });
      }
    }, 220);
  });

  $('btnResume').addEventListener('click', function () { togglePause(false); });
  $('btnPauseMenu').addEventListener('click', function () {
    audio.playCue('ui');
    hideScreens();
    audio.stopLoop('lowHealth');
    if (game.resolver) resolveLevel('menu');   // a campanha volta ao menu sozinha
    else goMenu();
  });
  dom.pauseBtn.addEventListener('click', function () {
    if (isPlayable()) togglePause(true);
    else if (game.state === STATE.PAUSED) togglePause(false);
  });

  /* --------------------------------------------------------- loop */

  var lastTime = 0;
  function frame(ts) {
    var dt = Math.max(0, Math.min(0.033, (ts - lastTime) / 1000 || 0));
    lastTime = ts;
    step(dt);
    render();
    requestAnimationFrame(frame);
  }

  global.addEventListener('resize', function () { renderer.fit(); });

  /* --------------------------------------------------------- boot */

  function boot() {
    detectTouch();
    applySettings();
    updateRecordsUI();
    setHudVisible(false, false);
    setLoading('Carregando a Eva…');

    Assets.loadGroup(['eva', 'icon'], function (pct) {
      dom.loaderText.textContent = 'Carregando a Eva… ' + Math.round(pct * 100) + '%';
    }).then(function (failedKeys) {
      if (failedKeys.indexOf('eva') >= 0) {
        openDialog({
          kicker: 'Arquivos ausentes',
          title: 'Não foi possível carregar os sprites da Eva',
          body: '<p>Extraia o pacote inteiro antes de abrir o jogo: a pasta ' +
                '<strong>img</strong> precisa ficar junto do <strong>index.html</strong>.</p>',
          actions: [{ label: 'Recarregar', primary: true, onClick: function () { location.reload(); } }]
        });
        return;
      }
      audio.preloadSfx(['collect', 'hit', 'mobHit']);
      goMenu();
      lastTime = performance.now();
      requestAnimationFrame(frame);
    });
  }

  /* primeiro gesto do usuario libera o audio em qualquer navegador */
  ['pointerdown', 'keydown'].forEach(function (evt) {
    global.addEventListener(evt, function once() {
      audio.unlock();
      global.removeEventListener(evt, once);
    }, { once: true });
  });

  boot();

  /* superficie minima para depuracao no console */
  global.EvaGame = { world: world, game: game, STATE: STATE };
})(window);
