/* =============================================================
   Eva no Lixo Zero — desenho
   O cenario e a arte real dos mapas; nada de ceu/morros procedurais.
   ============================================================= */
(function (global) {
  'use strict';

  var VW = 960;
  var VH = 540;
  var SPRITES = global.Assets.SPRITES;
  var KIND_COLORS = global.Levels.KIND_COLORS;
  var MONO = '700 %dpx ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.fit();
  }

  Renderer.prototype.fit = function () {
    this.dpr = Math.min(2, global.devicePixelRatio || 1);
    this.canvas.width = Math.round(VW * this.dpr);
    this.canvas.height = Math.round(VH * this.dpr);
  };

  /* ---------------------------------------------------------- sprites */

  function frameOf(group, key) {
    var g = SPRITES[group];
    return g && g.frames ? g.frames[key] : null;
  }

  /** Escolhe o quadro de uma animacao pelo tempo decorrido. */
  function pickFrame(group, anim, time, fps, loop) {
    var g = SPRITES[group];
    if (!g || !g.anim || !g.anim[anim]) return null;
    var list = g.anim[anim];
    var i = Math.floor(time * (fps || 10));
    if (loop === false) i = Math.min(i, list.length - 1);
    else i = i % list.length;
    return list[i];
  }

  /** Desenha um quadro ancorado em (x, y) do mundo. */
  Renderer.prototype.sprite = function (group, imgKey, key, x, y, facing, opts) {
    var f = frameOf(group, key);
    var img = global.Assets.image(imgKey);
    if (!f || !img) return false;
    opts = opts || {};
    var ctx = this.ctx;
    var s = (SPRITES[group].scale || 1) * (opts.scale || 1);
    ctx.save();
    ctx.translate(x, y);
    if (opts.rotate) ctx.rotate(opts.rotate);
    if (facing < 0) ctx.scale(-1, 1);
    if (opts.squashX || opts.squashY) ctx.scale(opts.squashX || 1, opts.squashY || 1);
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(img, f.x, f.y, f.w, f.h, -f.ax * s, -f.ay * s, f.w * s, f.h * s);
    if (opts.flash) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = opts.flash;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, -f.ax * s, -f.ay * s, f.w * s, f.h * s);
    }
    ctx.restore();
    return true;
  };

  /* ---------------------------------------------------------- cenario */

  /** Fundo panoramico repetido lado a lado. A arte usada e a versao ciclica
      gerada em img/generated/maps, entao a emenda e invisivel e nada precisa
      ser espelhado (o que inverteria as placas escritas do cenario). */
  Renderer.prototype.background = function (level, cameraX) {
    var ctx = this.ctx;
    var img = global.Assets.image(level.map);
    if (!img) {
      ctx.fillStyle = '#10251A';
      ctx.fillRect(cameraX, 0, VW, VH);
      return;
    }
    var scale = VH / img.naturalHeight;
    var tileW = img.naturalWidth * scale;
    var first = Math.floor(cameraX / tileW);
    var last = Math.floor((cameraX + VW) / tileW);
    for (var i = first; i <= last; i++) {
      ctx.drawImage(img, i * tileW, 0, tileW + 1, VH);
    }
  };

  Renderer.prototype.decor = function (level, cameraX) {
    var ctx = this.ctx;
    for (var i = 0; i < level.decor.length; i++) {
      var d = level.decor[i];
      var set = SPRITES.platforms[d.set];
      var f = set && set.frames[d.piece];
      var img = global.Assets.image(d.set);
      if (!f || !img) continue;
      var s = d.scale || 1;
      var w = f.w * s, h = f.h * s;
      if (d.x + w < cameraX - 80 || d.x - w > cameraX + VW + 80) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      if (d.flip) ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, -w / 2, -h, w, h);
      ctx.restore();
    }
  };

  Renderer.prototype.platforms = function (level, cameraX) {
    var ctx = this.ctx;
    for (var i = 0; i < level.platforms.length; i++) {
      var p = level.platforms[i];
      if (p.ground || !p.piece) continue;
      if (p.x + p.w < cameraX - 120 || p.x > cameraX + VW + 120) continue;
      var set = SPRITES.platforms[p.set];
      var f = set && set.frames[p.piece];
      var img = global.Assets.image(p.set);
      if (!f || !img) {
        ctx.fillStyle = 'rgba(60,90,70,0.9)';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        continue;
      }
      var s = p.w / f.w;
      ctx.drawImage(img, f.x, f.y, f.w, f.h,
                    p.x, p.y - f.top * s, f.w * s, f.h * s);
    }
  };

  /* ---------------------------------------------------------- itens */

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  Renderer.prototype.collectible = function (item) {
    var ctx = this.ctx;
    var c = KIND_COLORS[item.kind];
    var bob = Math.sin(item.bob) * 5;
    ctx.save();
    ctx.translate(item.x, item.y + bob);

    var pulse = 0.82 + Math.sin(item.bob * 1.6) * 0.18;
    var glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 26 * pulse);
    glow.addColorStop(0, c.aura);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
    ctx.fill();

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
      roundRect(ctx, -8, -11, 16, 22, 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = c.edge;
      ctx.lineWidth = 1.4;
      for (var i = 0; i < 3; i++) {
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
      roundRect(ctx, -4, -15, 8, 4, 1.5); ctx.fill();
    } else if (item.kind === 'metal') {
      roundRect(ctx, -7, -11, 14, 22, 4); ctx.fill(); ctx.stroke();
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
      roundRect(ctx, -7, -14, 14, 5, 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype.checkpoint = function (cp, time) {
    var ctx = this.ctx;
    var x = cp.x, y = cp.y;
    ctx.save();
    ctx.strokeStyle = cp.taken ? '#8BE86A' : '#7D9488';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 74);
    ctx.stroke();

    var wave = cp.taken ? Math.sin(time * 3) * 4 : 0;
    ctx.fillStyle = cp.taken ? 'rgba(120,240,150,0.92)' : 'rgba(120,140,130,0.55)';
    ctx.beginPath();
    ctx.moveTo(x + 2, y - 74);
    ctx.lineTo(x + 44 + wave, y - 62);
    ctx.lineTo(x + 2, y - 48);
    ctx.closePath();
    ctx.fill();

    if (cp.taken) {
      var halo = ctx.createRadialGradient(x, y - 40, 4, x, y - 40, 60);
      halo.addColorStop(0, 'rgba(140,255,180,0.22)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y - 40, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Renderer.prototype.portal = function (portal, open, remaining, time) {
    var ctx = this.ctx;
    var x = portal.x, y = portal.y, w = portal.w, h = portal.h;
    var cx = x + w / 2;
    ctx.save();

    if (open) {
      var g = ctx.createLinearGradient(0, y - 10, 0, y + h);
      g.addColorStop(0, 'rgba(120,255,180,0.05)');
      g.addColorStop(0.5, 'rgba(90,235,155,0.34)');
      g.addColorStop(1, 'rgba(60,210,130,0.12)');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();

      ctx.save();
      roundRect(ctx, x, y, w, h, 10);
      ctx.clip();
      ctx.strokeStyle = 'rgba(190,255,215,0.35)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        var oy = ((time * 46 + i * 18) % (h + 20)) - 10;
        ctx.beginPath();
        ctx.moveTo(x, y + h - oy);
        ctx.lineTo(x + w, y + h - oy - 6);
        ctx.stroke();
      }
      ctx.restore();

      var halo = ctx.createRadialGradient(cx, y + h / 2, 6, cx, y + h / 2, 90);
      halo.addColorStop(0, 'rgba(110,250,175,0.28)');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, y + h / 2, 90, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(120,140,130,0.16)';
      roundRect(ctx, x, y, w, h, 10);
      ctx.fill();
    }

    ctx.strokeStyle = open ? '#3FD983' : '#6E8A7C';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h);
    ctx.lineTo(x - 4, y + 8);
    ctx.quadraticCurveTo(cx, y - 26, x + w + 4, y + 8);
    ctx.lineTo(x + w + 4, y + h);
    ctx.stroke();

    [x - 4, x + w + 4].forEach(function (lx) {
      ctx.fillStyle = open ? '#B6FFD3' : '#5D7268';
      ctx.beginPath();
      ctx.arc(lx, y + 10, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.save();
    ctx.translate(cx, y + h / 2);
    ctx.rotate(open ? time * 0.9 : 0);
    ctx.strokeStyle = open ? '#D9FFE9' : '#7D9488';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var R = 13;
    var verts = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6].map(function (a) {
      return [Math.cos(a) * R, Math.sin(a) * R];
    });
    for (var k = 0; k < 3; k++) {
      var a = verts[k], b = verts[(k + 1) % 3];
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var len = Math.hypot(dx, dy);
      var ux = dx / len, uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(a[0] + ux * len * 0.2, a[1] + uy * len * 0.2);
      var ex = a[0] + ux * len * 0.86, ey = a[1] + uy * len * 0.86;
      ctx.lineTo(ex, ey);
      ctx.stroke();
      var ang = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.5) * 6, ey - Math.sin(ang - 0.5) * 6);
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang + 0.5) * 6, ey - Math.sin(ang + 0.5) * 6);
      ctx.stroke();
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = MONO.replace('%d', 12);
    var label = open ? 'ENTRE' : 'FALTAM ' + remaining;
    var lw = ctx.measureText(label).width + 20;
    var ly = y - 48;
    ctx.fillStyle = open ? 'rgba(20,70,45,0.82)' : 'rgba(24,40,32,0.72)';
    roundRect(ctx, cx - lw / 2, ly - 13, lw, 22, 11);
    ctx.fill();
    ctx.strokeStyle = open ? 'rgba(120,255,180,0.6)' : 'rgba(160,185,170,0.4)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, cx - lw / 2, ly - 13, lw, 22, 11);
    ctx.stroke();
    ctx.fillStyle = open ? '#B6FFD3' : '#C7D8CD';
    ctx.fillText(label, cx, ly + 4);
    ctx.restore();
  };

  /* ---------------------------------------------------------- atores */

  Renderer.prototype.shadow = function (cx, footY, groundY, width) {
    if (groundY == null || groundY > VH + 100) return;
    var ctx = this.ctx;
    var dist = Math.max(0, Math.min(1, (groundY - footY) / 240));
    ctx.save();
    ctx.globalAlpha = 0.3 * (1 - dist);
    ctx.fillStyle = '#08150E';
    ctx.beginPath();
    ctx.ellipse(cx, groundY + 2, width * (1 - dist * 0.42), width * 0.28 * (1 - dist * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  var EVA_ANIM = {
    idle: { frames: ['idle'], fps: 2 },
    run: { frames: ['run1', 'run2'], fps: 11 },
    jump: { frames: ['jump'], fps: 1 },
    fall: { frames: ['jump'], fps: 1 },
    crouch: { frames: ['crouch1', 'crouch2'], fps: 8, once: true },
    punch: { frames: ['punch1', 'punch2'], fps: 11, once: true },
    eco: { frames: ['eco1', 'eco2'], fps: 4, once: true },
    hurt: { frames: ['hurt1', 'hurt2'], fps: 4, once: true },
    defeat: { frames: ['defeat1', 'defeat2'], fps: 1.4, once: true }
  };

  Renderer.prototype.player = function (p, groundY, time) {
    var cx = p.x + p.w / 2;
    var feet = p.y + p.h;
    this.shadow(cx, feet, groundY, 26);

    var def = EVA_ANIM[p.state] || EVA_ANIM.idle;
    var idx = Math.floor(p.stateTime * def.fps);
    if (def.once) idx = Math.min(idx, def.frames.length - 1);
    else idx = (p.state === 'idle' ? 0 : idx % def.frames.length);
    var key = def.frames[idx];

    var alpha = 1;
    if (p.invuln > 0 && p.state !== 'defeat' && Math.floor(p.invuln * 14) % 2 === 0) alpha = 0.35;

    var sq = p.squash;
    var breathe = p.state === 'idle' ? 1 + Math.sin(time * 2.4) * 0.012 : 1;
    this.sprite('eva', 'eva', key, cx, feet, p.facing, {
      alpha: alpha,
      squashX: 1 + sq * 0.45,
      squashY: (1 - sq * 0.55) * breathe
    });
  };

  var ENEMY_ANIM = {
    goblin: {
      patrol: { a: 'walk', fps: 7 }, chase: { a: 'run', fps: 12 },
      attack: { a: 'attack', fps: 9, once: true }, hurt: { a: 'hurt', fps: 6, once: true },
      death: { a: 'death', fps: 4, once: true }, idle: { a: 'idle', fps: 5 }
    },
    latao: {
      patrol: { a: 'walk', fps: 6 }, chase: { a: 'walk', fps: 9 },
      attack: { a: 'attack', fps: 6, once: true }, hurt: { a: 'hurt', fps: 5, once: true },
      death: { a: 'death', fps: 5, once: true }, idle: { a: 'idle', fps: 4 }
    },
    mosca: {
      fly: { a: 'fly', fps: 14 }, patrol: { a: 'fly', fps: 12 },
      spit: { a: 'spit', fps: 6, once: true }, dive: { a: 'dive', fps: 10, once: true },
      hurt: { a: 'hurt', fps: 7, once: true }, death: { a: 'death', fps: 5, once: true },
      idle: { a: 'hover', fps: 10 }
    }
  };

  Renderer.prototype.enemy = function (e, cameraX, groundY) {
    if (e.x + e.w < cameraX - 120 || e.x > cameraX + VW + 120) return;
    var map = ENEMY_ANIM[e.type] || {};
    var def = map[e.state] || map.idle || map.fly;
    if (!def) return;
    var key = pickFrame(e.type, def.a, e.stateTime, def.fps, !def.once);
    if (!key) key = pickFrame(e.type, 'idle', e.animTime, 6, true);
    if (!key) return;

    var cx = e.x + e.w / 2;
    var flash = e.hurtFlash > 0 ? Math.min(0.6, e.hurtFlash * 2.4) : 0;

    if (e.type === 'mosca') {
      this.sprite('mosca', 'mosca', key, cx, e.y + e.h / 2, e.facing, { flash: flash });
    } else {
      this.shadow(cx, e.y + e.h, groundY, e.type === 'latao' ? 30 : 22);
      this.sprite(e.type, e.type, key, cx, e.y + e.h, e.facing, { flash: flash });
    }

    /* aviso de golpe: telegrafa antes da janela ativa */
    if (e.state === 'attack' && e.stateTime < e.def.windup && e.def.hitW) {
      var t = e.stateTime / e.def.windup;
      var ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = 0.18 + t * 0.3;
      ctx.fillStyle = e.type === 'latao' ? 'rgba(255,140,60,0.9)' : 'rgba(255,220,90,0.9)';
      var bx = e.facing > 0 ? e.x + e.w - 6 : e.x - e.def.hitW + 6;
      roundRect(ctx, bx, e.y + e.h - e.def.hitH, e.def.hitW, e.def.hitH, 8);
      ctx.fill();
      ctx.restore();
    }
  };

  var BOSS_ANIM = {
    intro: { a: 'idle', fps: 1.4 },
    idle: { a: 'idle', fps: 1.6 },
    walk: { a: 'walk', fps: 3.2 },
    swipe: { a: 'telegraph', fps: 3, once: true },
    slam: { a: 'windup', fps: 2, once: true },
    toss: { a: 'telegraph', fps: 3, once: true },
    summon: { a: 'telegraph', fps: 3, once: true },
    charge: { a: 'walk', fps: 7 },
    hurt: { a: 'hurt', fps: 3, once: true },
    stagger: { a: 'hurt', fps: 2, once: true },
    defeat: { a: 'defeat', fps: 1, once: true }
  };

  Renderer.prototype.boss = function (b, groundY, time) {
    var def = BOSS_ANIM[b.state] || BOSS_ANIM.idle;
    var key = pickFrame('lixorion', def.a, b.stateTime, def.fps, !def.once);
    /* nos golpes o quadro de impacto entra na hora certa */
    if (b.state === 'slam' && b.attackDone) key = pickFrame('lixorion', 'slam', 0, 1, false);
    if (b.state === 'swipe' && b.attackDone) key = pickFrame('lixorion', 'slam', 0, 1, false);
    if (b.state === 'toss' && b.attackDone) key = pickFrame('lixorion', 'slam', 0, 1, false);
    if (!key) return;

    var cx = b.x + b.w / 2;
    this.shadow(cx, b.y + b.h, groundY, 62);

    var ctx = this.ctx;
    /* aura de vulnerabilidade */
    if (b.vulnerable > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28 + Math.sin(time * 12) * 0.1;
      var gl = ctx.createRadialGradient(cx, b.y + b.h * 0.5, 20, cx, b.y + b.h * 0.5, 150);
      gl.addColorStop(0, 'rgba(150,255,180,0.75)');
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.beginPath();
      ctx.arc(cx, b.y + b.h * 0.5, 150, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    var flash = b.hurtFlash > 0 ? Math.min(0.55, b.hurtFlash * 2.2) : 0;
    this.sprite('lixorion', 'lixorion', key, cx, b.y + b.h, b.facing, { flash: flash });

    /* telegrafo dos golpes fortes */
    var warn = null;
    if (b.state === 'slam' && b.stateTime < 0.72) warn = b.stateTime / 0.72;
    if (b.state === 'charge' && b.stateTime < 0.6) warn = b.stateTime / 0.6;
    if (warn != null) {
      ctx.save();
      ctx.globalAlpha = 0.25 + warn * 0.45;
      ctx.strokeStyle = 'rgba(255,120,80,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, b.y + b.h - 10, 60 + warn * 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  /* ---------------------------------------------------------- projeteis */

  Renderer.prototype.projectile = function (pr, time) {
    var ctx = this.ctx;
    if (pr.kind === 'eco') {
      var cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
      ctx.save();
      var g = ctx.createRadialGradient(cx, cy, 4, cx, cy, pr.w * 0.8);
      g.addColorStop(0, 'rgba(220,255,200,0.95)');
      g.addColorStop(0.45, 'rgba(120,240,140,0.6)');
      g.addColorStop(1, 'rgba(60,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, pr.w * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(215,255,205,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, pr.w * 0.42, time * 6, time * 6 + Math.PI * 1.3);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (pr.kind === 'shock') {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pr.life));
      ctx.fillStyle = 'rgba(180,230,90,0.55)';
      ctx.beginPath();
      ctx.ellipse(pr.x + pr.w / 2, pr.y + pr.h, pr.w * 0.6, pr.h * 0.9, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,255,160,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
      return;
    }
    /* bola de lixo: usa os quadros reais da mosca quando existirem */
    var key = pr.frame;
    if (key && this.sprite('mosca', 'mosca', key, pr.x + pr.w / 2, pr.y + pr.h / 2, 1,
                           { rotate: pr.rot, scale: pr.spriteScale || 1 })) {
      return;
    }

    /* gosma de Lixórion: bolha irregular com brilho e rastro */
    var cx2 = pr.x + pr.w / 2, cy2 = pr.y + pr.h / 2, r = pr.w / 2;
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.rotate(pr.rot * 0.3);
    var glow2 = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.7);
    glow2.addColorStop(0, 'rgba(190,255,110,0.5)');
    glow2.addColorStop(1, 'rgba(120,200,60,0)');
    ctx.fillStyle = glow2;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
    ctx.fill();

    var STEPS = 18;
    function blobPoint(i) {
      var ang = (i / STEPS) * Math.PI * 2;
      var wob = r * (0.9 + 0.11 * Math.sin(ang * 3 + time * 9 + pr.rot));
      return [Math.cos(ang) * wob, Math.sin(ang) * wob];
    }
    ctx.beginPath();
    var prev = blobPoint(0);
    ctx.moveTo((prev[0] + blobPoint(STEPS - 1)[0]) / 2, (prev[1] + blobPoint(STEPS - 1)[1]) / 2);
    for (var a = 1; a <= STEPS; a++) {
      var cur = blobPoint(a % STEPS);
      ctx.quadraticCurveTo(prev[0], prev[1], (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2);
      prev = cur;
    }
    ctx.closePath();
    var body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, '#D6F76B');
    body.addColorStop(0.55, pr.color || '#8FBF3A');
    body.addColorStop(1, '#4E7A22');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,50,20,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.34, r * 0.24, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  /* ---------------------------------------------------------- efeitos */

  Renderer.prototype.particles = function (list) {
    var ctx = this.ctx;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var t = p.life / p.maxLife;
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
  };

  Renderer.prototype.popups = function (list) {
    var ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = MONO.replace('%d', 19);
    ctx.lineWidth = 4;
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      ctx.globalAlpha = Math.min(1, (q.life / q.maxLife) * 1.6);
      ctx.strokeStyle = 'rgba(6,20,14,0.65)';
      ctx.strokeText(q.text, q.x, q.y);
      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.restore();
  };

  Renderer.prototype.vignette = function (strength) {
    var ctx = this.ctx;
    var g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VH * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  };

  Renderer.prototype.tint = function (color, alpha) {
    if (alpha <= 0) return;
    var ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  };

  Renderer.prototype.pauseVeil = function () {
    var ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(4,12,8,0.55)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.restore();
  };

  global.Renderer = Renderer;
  global.Renderer.VW = VW;
  global.Renderer.VH = VH;
  global.Renderer.pickFrame = pickFrame;
  global.Renderer.roundRect = roundRect;
})(window);
