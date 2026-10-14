/* =============================================================
   Eva no Lixo Zero — entidades
   Eva, monstros de Lixórion, projéteis e o próprio Lixórion.
   Hitbox fisica e tamanho do sprite sao coisas separadas: nenhuma
   entidade usa a imagem inteira como area de colisao.
   ============================================================= */
(function (global) {
  'use strict';

  var GRAVITY = 2000;
  var MAX_FALL = 1500;

  /* ------------------------------------------------------------ util */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function hitsRect(e, rx, ry, rw, rh) {
    return rectOverlap(e.x, e.y, e.w, e.h, rx, ry, rw, rh);
  }

  function resolveAxis(body, platforms, axis) {
    for (var i = 0; i < platforms.length; i++) {
      var p = platforms[i];
      if (!rectOverlap(body.x, body.y, body.w, body.h, p.x, p.y, p.w, p.h)) continue;
      if (axis === 'x') {
        if (body.vx > 0) { body.x = p.x - body.w; body.vx = 0; }
        else if (body.vx < 0) { body.x = p.x + p.w; body.vx = 0; }
      } else {
        if (body.vy > 0) { body.y = p.y - body.h; body.vy = 0; body.onGround = true; }
        else if (body.vy < 0) { body.y = p.y + p.h; body.vy = 0; }
      }
    }
  }

  /* ============================================================ EVA */

  var EVA = {
    W: 42, H: 66,
    CROUCH_H: 42,
    SPEED: 320,
    JUMP: 760,
    ACCEL_GROUND: 2800,
    ACCEL_AIR: 1900,
    PUNCH_DUR: 0.30,
    PUNCH_FROM: 0.09,
    PUNCH_TO: 0.19,
    PUNCH_DAMAGE: 1,
    ECO_CHARGE: 0.26,
    ECO_DUR: 0.46,
    ECO_COST: 1,
    ECO_REGEN: 0.16,
    ECO_PICKUP: 0.35,
    ECO_DAMAGE: 4,
    HURT_DUR: 0.45,
    INVULN: 1.3,
    KNOCKBACK_X: 260,
    KNOCKBACK_Y: 380,
    DEFEAT_DUR: 1.8
  };

  function Player(x, y) {
    this.x = x; this.y = y;
    this.w = EVA.W; this.h = EVA.H;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.state = 'idle';
    this.stateTime = 0;
    this.animTime = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.squash = 0;
    this.dustTimer = 0;
    this.invuln = 0;
    this.attackTimer = 0;
    this.attackHits = null;
    this.ecoTimer = 0;
    this.ecoFired = false;
    this.ecoMeter = 1;
    this.crouching = false;
    this.dead = false;
    this.respawn = { x: x, y: y };
  }

  Player.prototype.setState = function (name) {
    if (this.state === name) return;
    this.state = name;
    this.stateTime = 0;
  };

  Player.prototype.busy = function () {
    return this.state === 'punch' || this.state === 'eco' ||
           this.state === 'hurt' || this.state === 'defeat';
  };

  Player.prototype.canAct = function () {
    return this.state !== 'hurt' && this.state !== 'defeat';
  };

  /** Caixa do soco: so existe durante a janela ativa da animacao. */
  Player.prototype.punchBox = function () {
    if (this.state !== 'punch') return null;
    if (this.stateTime < EVA.PUNCH_FROM || this.stateTime > EVA.PUNCH_TO) return null;
    var w = 40, h = 44;
    var x = this.facing > 0 ? this.x + this.w - 4 : this.x - w + 4;
    return { x: x, y: this.y + 10, w: w, h: h };
  };

  Player.prototype.startPunch = function (world) {
    if (!this.canAct() || this.state === 'punch' || this.state === 'eco') return;
    this.setState('punch');
    this.attackHits = [];
    world.audio.playCue('punch');
  };

  Player.prototype.startEco = function (world) {
    if (!this.canAct() || this.state === 'eco' || this.state === 'punch') return;
    if (this.ecoMeter < EVA.ECO_COST) { world.toast('Eco Power recarregando…'); return; }
    this.ecoMeter -= EVA.ECO_COST;
    this.setState('eco');
    this.ecoFired = false;
    world.emit({
      kind: 'spark', x: this.x + this.w / 2, y: this.y + this.h / 2,
      speed: 90, life: 0.45, size: 3.4, color: 'rgba(150,255,180,0.95)',
      grav: -60, drag: 1.2
    }, 14);
  };

  Player.prototype.hurt = function (world, fromX, power) {
    if (this.invuln > 0 || this.state === 'defeat' || this.dead) return false;
    this.invuln = EVA.INVULN;
    this.setState('hurt');
    var dir = (this.x + this.w / 2) < fromX ? -1 : 1;
    this.vx = dir * EVA.KNOCKBACK_X * (power || 1);
    this.vy = -EVA.KNOCKBACK_Y;
    this.onGround = false;
    return true;
  };

  Player.prototype.defeat = function () {
    this.setState('defeat');
    this.vx = 0;
    this.dead = true;
  };

  Player.prototype.update = function (dt, world, input) {
    var level = world.level;
    this.stateTime += dt;
    this.animTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.ecoMeter < 1) this.ecoMeter = Math.min(1, this.ecoMeter + EVA.ECO_REGEN * dt);

    var frozen = this.state === 'defeat';
    var attacking = this.state === 'punch' || this.state === 'eco';
    var hurting = this.state === 'hurt';

    /* ---- fim de estados temporarios ---- */
    if (this.state === 'punch' && this.stateTime >= EVA.PUNCH_DUR) this.setState('idle');
    if (this.state === 'eco') {
      if (!this.ecoFired && this.stateTime >= EVA.ECO_CHARGE) {
        this.ecoFired = true;
        world.spawnEcoWave(this);
      }
      if (this.stateTime >= EVA.ECO_DUR) this.setState('idle');
    }
    if (this.state === 'hurt' && this.stateTime >= EVA.HURT_DUR) this.setState('idle');

    /* ---- entrada ---- */
    var dir = 0;
    if (!frozen && !hurting) {
      dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (attacking) dir *= 0.45;
    }

    this.crouching = !frozen && !hurting && !attacking && this.onGround && input.down;
    var targetH = this.crouching ? EVA.CROUCH_H : EVA.H;
    if (targetH !== this.h) {
      this.y += this.h - targetH;
      this.h = targetH;
    }

    var accel = this.onGround ? EVA.ACCEL_GROUND : EVA.ACCEL_AIR;
    var maxSpeed = EVA.SPEED * (this.crouching ? 0.42 : 1);
    if (dir !== 0) {
      var target = dir * maxSpeed;
      this.vx += Math.sign(target - this.vx) * accel * dt;
      if ((target > 0 && this.vx > target) || (target < 0 && this.vx < target)) this.vx = target;
      if (!attacking) this.facing = dir > 0 ? 1 : -1;
    } else if (!hurting) {
      var friction = (this.onGround ? 3200 : 900) * dt;
      if (Math.abs(this.vx) <= friction) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * friction;
    }

    /* ---- pulo com coyote time e buffer (preservados da versao anterior) ---- */
    this.coyote = this.onGround ? 0.11 : Math.max(0, this.coyote - dt);
    if (input.jumpQueued) { this.buffer = 0.14; input.jumpQueued = false; }
    else this.buffer = Math.max(0, this.buffer - dt);

    var canJump = !frozen && !hurting && !this.crouching;
    if (canJump && (this.buffer > 0 || input.jump) && this.coyote > 0) {
      this.vy = -EVA.JUMP;
      this.onGround = false;
      this.coyote = 0;
      this.buffer = 0;
      this.squash = -0.35;
      world.audio.playCue('jump');
      world.emit({
        kind: 'dust', x: this.x + this.w / 2, y: this.y + this.h, jitter: 18,
        angle: Math.PI / 2, spread: 2.2, speed: 90, life: 0.4, size: 5,
        color: 'rgba(255,255,255,0.55)', grav: 260
      }, 6);
    }
    if (input.jumpReleased && this.vy < -260) this.vy = -260;

    /* ---- fisica ---- */
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    var wasOnGround = this.onGround;
    var fallSpeed = this.vy;

    this.x += this.vx * dt;
    resolveAxis(this, level.platforms, 'x');
    this.x = clamp(this.x, 0, level.width - this.w);

    this.y += this.vy * dt;
    this.onGround = false;
    resolveAxis(this, level.platforms, 'y');

    if (!wasOnGround && this.onGround) {
      var force = Math.min(1, fallSpeed / 900);
      this.squash = 0.3 * force + 0.1;
      if (force > 0.35) {
        world.audio.playCue('land');
        world.emit({
          kind: 'dust', x: this.x + this.w / 2, y: this.y + this.h, jitter: 24,
          angle: Math.PI, spread: Math.PI * 1.6, speed: 130 * force, life: 0.45, size: 6,
          color: 'rgba(255,255,255,0.5)', grav: 120
        }, Math.round(5 + force * 7));
        world.addShake(force * 3);
      }
    }

    if (this.onGround && Math.abs(this.vx) > 180 && !attacking) {
      this.dustTimer -= dt;
      if (this.dustTimer <= 0) {
        this.dustTimer = 0.09;
        world.emit({
          kind: 'dust', x: this.x + this.w / 2 - this.facing * 12, y: this.y + this.h - 3,
          jitter: 8, angle: this.facing > 0 ? Math.PI : 0, spread: 1.2, speed: 55,
          life: 0.34, size: 4, color: 'rgba(255,255,255,0.4)', grav: 90
        }, 1);
      }
    }

    this.squash += (0 - this.squash) * Math.min(1, dt * 11);

    /* ---- estado visual (nunca sobrescreve um estado com prioridade) ---- */
    if (!frozen && !hurting && !attacking) {
      if (!this.onGround) this.setState(this.vy < 0 ? 'jump' : 'fall');
      else if (this.crouching) this.setState('crouch');
      else if (Math.abs(this.vx) > 20) this.setState('run');
      else this.setState('idle');
    }
  };

  /* ====================================================== MONSTROS */

  var ENEMY_DEFS = {
    goblin: {
      w: 40, h: 46, hp: 2, score: 150,
      patrolSpeed: 72, chaseSpeed: 168,
      sight: 250, sightY: 110,
      attackRange: 54, windup: 0.32, active: 0.14, recover: 0.30,
      hitW: 42, hitH: 36, damage: 1, knockback: 1,
      hurtTime: 0.30, deathTime: 0.95, gravity: true
    },
    latao: {
      w: 58, h: 62, hp: 5, score: 260,
      patrolSpeed: 46, chaseSpeed: 96,
      sight: 280, sightY: 120,
      attackRange: 70, windup: 0.62, active: 0.20, recover: 0.52,
      hitW: 56, hitH: 50, damage: 1, knockback: 1.5,
      hurtTime: 0.34, deathTime: 1.4, gravity: true
    },
    mosca: {
      w: 46, h: 38, hp: 2, score: 200,
      patrolSpeed: 96, chaseSpeed: 150,
      sight: 430, sightY: 320,
      attackRange: 0, windup: 0.45, active: 0.2, recover: 0.5,
      hitW: 0, hitH: 0, damage: 1, knockback: 1,
      hurtTime: 0.28, deathTime: 1.1, gravity: false,
      shootCooldown: 2.7, diveCooldown: 4.2
    }
  };

  function Enemy(def, level) {
    var base = ENEMY_DEFS[def.type];
    this.type = def.type;
    this.def = base;
    this.w = base.w;
    this.h = base.h;
    this.homeY = def.y != null ? def.y : level.ground - base.h;
    this.x = def.x;
    this.y = this.homeY;
    this.vx = 0;
    this.vy = 0;
    this.left = def.left != null ? def.left : def.x - 140;
    this.right = def.right != null ? def.right : def.x + 140;
    this.hp = base.hp;
    this.maxHp = base.hp;
    this.facing = -1;
    this.onGround = false;
    this.state = 'patrol';
    this.stateTime = 0;
    this.animTime = Math.random() * 2;
    this.hurtFlash = 0;
    this.dead = false;
    this.remove = false;
    this.attackDone = false;
    this.shootTimer = 1.2 + Math.random() * 1.6;
    this.diveTimer = 3 + Math.random() * 2.5;
    this.wobble = Math.random() * 6.28;
    this.fromBoss = !!def.fromBoss;
  }

  Enemy.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.attackDone = false;
  };

  Enemy.prototype.center = function () {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  };

  Enemy.prototype.attackBox = function () {
    if (this.state !== 'attack' || !this.def.hitW) return null;
    var t = this.stateTime - this.def.windup;
    if (t < 0 || t > this.def.active) return null;
    var w = this.def.hitW, h = this.def.hitH;
    var x = this.facing > 0 ? this.x + this.w - 6 : this.x - w + 6;
    return { x: x, y: this.y + this.h - h, w: w, h: h };
  };

  Enemy.prototype.takeDamage = function (amount, world, fromX) {
    if (this.dead) return false;
    this.hp -= amount;
    this.hurtFlash = 0.22;
    world.audio.playSfx('mobHit');
    var c = this.center();
    world.emit({
      kind: 'shard', x: c.x, y: c.y, speed: 220, life: 0.5, size: 5,
      color: '#FFD98A', grav: 520, drag: 0.9
    }, 8);
    if (this.hp <= 0) {
      this.dead = true;
      this.setState('death');
      this.vx = (c.x < fromX ? -1 : 1) * 120;
      this.vy = this.def.gravity ? -240 : 60;
      world.onEnemyDefeated(this);
      return true;
    }
    this.setState('hurt');
    this.vx = (c.x < fromX ? -1 : 1) * 190;
    if (this.def.gravity) this.vy = -180;
    return true;
  };

  Enemy.prototype.update = function (dt, world) {
    var level = world.level;
    var p = world.player;
    this.stateTime += dt;
    this.animTime += dt;
    this.wobble += dt * 2.4;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    if (this.state === 'death') {
      this.updateDeath(dt, world);
      return;
    }

    if (this.type === 'mosca') this.updateFlyer(dt, world, p);
    else this.updateWalker(dt, world, p, level);
  };

  Enemy.prototype.updateDeath = function (dt, world) {
    if (this.def.gravity) {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.onGround = false;
      resolveAxis(this, world.level.platforms, 'y');
      this.vx *= (1 - Math.min(1, dt * 3));
    } else {
      this.vy = Math.min(500, this.vy + 700 * dt);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.onGround = false;
      resolveAxis(this, world.level.platforms, 'y');
      if (this.onGround && !this.burst) {
        this.burst = true;
        world.emit({
          kind: 'spark', x: this.x + this.w / 2, y: this.y + this.h / 2,
          speed: 220, life: 0.6, size: 4, color: 'rgba(180,230,90,0.9)',
          grav: 260, drag: 1
        }, 16);
      }
    }
    if (this.stateTime >= this.def.deathTime) this.remove = true;
  };

  Enemy.prototype.updateWalker = function (dt, world, p, level) {
    var d = this.def;
    var pc = p.x + p.w / 2;
    var mc = this.x + this.w / 2;
    var dist = Math.abs(pc - mc);
    var dy = Math.abs((p.y + p.h / 2) - (this.y + this.h / 2));
    var awake = !p.dead && dist < d.sight && dy < d.sightY;

    if (this.state === 'hurt') {
      if (this.stateTime >= d.hurtTime) this.setState(awake ? 'chase' : 'patrol');
    } else if (this.state === 'attack') {
      this.vx = 0;
      if (this.stateTime >= d.windup + d.active + d.recover) {
        this.setState(awake ? 'chase' : 'patrol');
      }
    } else if (awake) {
      this.facing = pc < mc ? -1 : 1;
      if (dist <= d.attackRange && dy < 60) {
        this.setState('attack');
        this.vx = 0;
        if (this.type === 'latao') world.addShake(1.5);
      } else {
        this.setState('chase');
        this.vx = this.facing * d.chaseSpeed;
      }
    } else {
      this.setState('patrol');
      if (this.vx === 0) this.vx = this.facing * d.patrolSpeed;
      else this.vx = Math.sign(this.vx) * d.patrolSpeed;
      this.facing = this.vx > 0 ? 1 : -1;
    }

    /* limites de patrulha e beiradas */
    if (this.state !== 'attack') {
      if (this.x < this.left && this.vx < 0) { this.x = this.left; this.vx = Math.abs(this.vx); }
      if (this.x + this.w > this.right && this.vx > 0) {
        this.x = this.right - this.w;
        this.vx = -Math.abs(this.vx);
      }
      if (this.vx !== 0) this.facing = this.vx > 0 ? 1 : -1;
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    this.x += this.vx * dt;
    resolveAxis(this, level.platforms, 'x');
    this.y += this.vy * dt;
    this.onGround = false;
    resolveAxis(this, level.platforms, 'y');
    this.x = clamp(this.x, 0, level.width - this.w);
  };

  Enemy.prototype.updateFlyer = function (dt, world, p) {
    var d = this.def;
    var pc = p.x + p.w / 2;
    var mc = this.x + this.w / 2;
    var dist = Math.abs(pc - mc);
    var awake = !p.dead && dist < d.sight;

    if (this.state === 'hurt') {
      this.vx *= (1 - Math.min(1, dt * 4));
      this.vy *= (1 - Math.min(1, dt * 4));
      if (this.stateTime >= d.hurtTime) this.setState('fly');
    } else if (this.state === 'dive') {
      if (this.stateTime > 0.85) this.setState('fly');
    } else if (this.state === 'spit') {
      if (!this.attackDone && this.stateTime >= d.windup) {
        this.attackDone = true;
        world.spawnTrashBall(this, p);
      }
      if (this.stateTime >= d.windup + d.recover) this.setState('fly');
    } else {
      this.setState('fly');
    }

    if (this.state === 'fly') {
      var targetX;
      if (awake) {
        this.facing = pc < mc ? -1 : 1;
        targetX = clamp(pc - this.facing * 90, this.left, this.right);
      } else {
        targetX = (this.left + this.right) / 2;
      }
      var speed = awake ? d.chaseSpeed : d.patrolSpeed;
      var dx = targetX - mc;
      this.vx = clamp(dx * 2.2, -speed, speed);

      var targetY = this.homeY + Math.sin(this.wobble) * 26;
      if (awake) targetY = clamp(p.y - 70 + Math.sin(this.wobble) * 22, 60, world.level.ground - 90);
      this.vy = (targetY - this.y) * 2.4;

      this.shootTimer -= dt;
      this.diveTimer -= dt;
      if (awake && this.shootTimer <= 0 && dist < 400 && dist > 70) {
        this.shootTimer = d.shootCooldown + Math.random() * 1.4;
        this.setState('spit');
      } else if (awake && this.diveTimer <= 0 && dist < 220) {
        this.diveTimer = d.diveCooldown + Math.random() * 2;
        this.setState('dive');
        this.vx = this.facing * 380;
        this.vy = 300;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, 20, world.level.width - this.w - 20);
    this.y = clamp(this.y, 40, world.level.ground - this.h - 6);
    if (this.vx !== 0 && this.state !== 'dive') this.facing = this.vx > 0 ? 1 : -1;
  };

  /** Colisao de corpo do inimigo com a Eva (mergulho e toque). */
  Enemy.prototype.touchBox = function () {
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 8 };
  };

  /* ==================================================== PROJETEIS */

  function Projectile(cfg) {
    Object.assign(this, {
      kind: 'trash', x: 0, y: 0, vx: 0, vy: 0, grav: 0,
      w: 22, h: 22, life: 3, damage: 1, owner: 'enemy',
      pierce: false, hits: null, spin: 0, rot: 0, dead: false
    }, cfg);
    if (this.pierce) this.hits = [];
  }

  Projectile.prototype.update = function (dt, world) {
    this.vy += this.grav * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    this.life -= dt;

    if (this.life <= 0) { this.dead = true; return; }

    /* fora da area util da camera: descarta */
    var camL = world.cameraX - 260;
    var camR = world.cameraX + 960 + 260;
    if (this.x < camL || this.x > camR || this.y > 720 || this.y < -260) {
      this.dead = true;
      return;
    }

    if (this.kind === 'slime' && Math.random() < 0.55) {
      world.emit({
        kind: 'spark', x: this.x + this.w / 2, y: this.y + this.h / 2, jitter: 6,
        speed: 24, life: 0.32, size: 2.6, color: 'rgba(170,235,90,0.85)', grav: 160, drag: 1.6
      }, 1);
    }

    if (this.kind !== 'eco' && this.grav > 0) {
      /* projetil de lixo explode ao encostar no chao */
      var g = world.level.ground;
      if (this.y + this.h >= g) {
        this.y = g - this.h;
        this.dead = true;
        world.splash(this.x + this.w / 2, g, this.kind);
      }
    }
  };

  /* ===================================================== LIXÓRION */

  var BOSS = {
    W: 132, H: 176,
    SPEED: [58, 88, 120],
    ATTACK_GAP: [2.4, 1.85, 1.35],
    SWIPE_RANGE: 205,
    SWIPE_WINDUP: 0.55,
    SWIPE_ACTIVE: 0.26,
    SWIPE_RECOVER: 0.5,
    SLAM_WINDUP: 0.72,
    SLAM_ACTIVE: 0.3,
    SLAM_RECOVER: 0.6,
    TOSS_WINDUP: 0.55,
    TOSS_RECOVER: 0.7,
    CHARGE_WINDUP: 0.6,
    CHARGE_TIME: 0.9,
    CHARGE_SPEED: 430,
    HURT_TIME: 0.26,
    STAGGER_TIME: 1.2,
    VULNERABLE_TIME: 3.0,
    DAMAGE_COOLDOWN: 0.22,
    DEFEAT_TIME: 2.4,
    SUMMON_GAP: 13
  };

  function Boss(def, level) {
    this.x = def.x;
    this.w = BOSS.W;
    this.h = BOSS.H;
    this.y = level.ground - this.h;
    this.vx = 0;
    this.vy = 0;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.facing = -1;
    this.state = 'intro';
    this.stateTime = 0;
    this.animTime = 0;
    this.attackTimer = 1.6;
    this.summonTimer = BOSS.SUMMON_GAP;
    this.hurtFlash = 0;
    this.damageCooldown = 0;
    this.vulnerable = 0;
    this.attackDone = false;
    this.phase = 1;
    this.dead = false;
    this.defeated = false;
    this.minion = null;
  }

  Boss.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
    this.attackDone = false;
  };

  Boss.prototype.ratio = function () { return Math.max(0, this.hp / this.maxHp); };

  Boss.prototype.currentPhase = function () {
    var r = this.ratio();
    if (r > 0.66) return 1;
    if (r > 0.33) return 2;
    return 3;
  };

  Boss.prototype.hitBox = function () {
    return { x: this.x + 18, y: this.y + 12, w: this.w - 36, h: this.h - 12 };
  };

  Boss.prototype.attackBox = function () {
    var t = this.stateTime;
    if (this.state === 'swipe') {
      if (t < BOSS.SWIPE_WINDUP || t > BOSS.SWIPE_WINDUP + BOSS.SWIPE_ACTIVE) return null;
      var w = 120, h = 130;
      return {
        x: this.facing > 0 ? this.x + this.w - 20 : this.x - w + 20,
        y: this.y + this.h - h, w: w, h: h
      };
    }
    if (this.state === 'charge' && t > BOSS.CHARGE_WINDUP) {
      return { x: this.x + 12, y: this.y + 30, w: this.w - 24, h: this.h - 30 };
    }
    return null;
  };

  Boss.prototype.takeDamage = function (amount, world, fromX) {
    if (this.dead || this.damageCooldown > 0) return false;
    this.damageCooldown = BOSS.DAMAGE_COOLDOWN;
    var mult = this.vulnerable > 0 ? 2 : 1;
    this.hp -= amount * mult;
    this.hurtFlash = 0.24;
    world.audio.playSfx('mobHit');
    world.addShake(3);
    var cx = this.x + this.w / 2;
    world.emit({
      kind: 'shard', x: cx + (fromX < cx ? -40 : 40), y: this.y + this.h * 0.5,
      speed: 260, life: 0.55, size: 6, color: '#C8F06A', grav: 480, drag: 0.9
    }, 12);

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.setState('defeat');
      world.onBossDefeated();
      return true;
    }
    if (this.state !== 'charge' && this.state !== 'slam') this.setState('hurt');
    return true;
  };

  /** O Eco Power desestabiliza Lixórion e o deixa vulneravel por alguns segundos. */
  Boss.prototype.stagger = function (world) {
    if (this.dead) return;
    this.vulnerable = BOSS.VULNERABLE_TIME;
    this.setState('stagger');
    world.addShake(8);
    world.toast('Lixórion está instável!');
  };

  Boss.prototype.update = function (dt, world) {
    var p = world.player;
    this.stateTime += dt;
    this.animTime += dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.vulnerable > 0) this.vulnerable -= dt;

    var newPhase = this.currentPhase();
    if (newPhase !== this.phase && !this.dead) {
      this.phase = newPhase;
      world.onBossPhase(newPhase);
    }

    if (this.state === 'defeat') {
      this.vx = 0;
      return;
    }

    if (this.state === 'intro') {
      if (this.stateTime > 1.6) this.setState('idle');
      return;
    }

    var pc = p.x + p.w / 2;
    var mc = this.x + this.w / 2;
    var dist = Math.abs(pc - mc);
    var idx = this.phase - 1;

    switch (this.state) {
      case 'hurt':
        this.vx = 0;
        if (this.stateTime >= BOSS.HURT_TIME) this.setState('idle');
        break;

      case 'stagger':
        this.vx = 0;
        if (this.stateTime >= BOSS.STAGGER_TIME) this.setState('idle');
        break;

      case 'swipe':
        this.vx = 0;
        if (!this.attackDone && this.stateTime >= BOSS.SWIPE_WINDUP) {
          this.attackDone = true;
          world.audio.playSfx('bossAttack');
          world.addShake(5);
        }
        if (this.stateTime >= BOSS.SWIPE_WINDUP + BOSS.SWIPE_ACTIVE + BOSS.SWIPE_RECOVER) {
          this.setState('idle');
        }
        break;

      case 'slam':
        this.vx = 0;
        if (!this.attackDone && this.stateTime >= BOSS.SLAM_WINDUP) {
          this.attackDone = true;
          world.audio.playSfx('bossAttack');
          world.addShake(12);
          world.spawnShockwaves(this);
        }
        if (this.stateTime >= BOSS.SLAM_WINDUP + BOSS.SLAM_ACTIVE + BOSS.SLAM_RECOVER) {
          this.setState('idle');
        }
        break;

      case 'toss':
        this.vx = 0;
        if (!this.attackDone && this.stateTime >= BOSS.TOSS_WINDUP) {
          this.attackDone = true;
          world.audio.playSfx('bossAttack');
          world.spawnBossSlime(this, this.phase >= 3 ? 3 : 2);
        }
        if (this.stateTime >= BOSS.TOSS_WINDUP + BOSS.TOSS_RECOVER) this.setState('idle');
        break;

      case 'summon':
        this.vx = 0;
        if (!this.attackDone && this.stateTime >= 0.5) {
          this.attackDone = true;
          world.audio.playSfx('bossSpawn');
          world.spawnMinion(this);
        }
        if (this.stateTime >= 1.1) this.setState('idle');
        break;

      case 'charge':
        if (this.stateTime < BOSS.CHARGE_WINDUP) {
          this.vx = 0;
          this.facing = pc < mc ? -1 : 1;
        } else if (this.stateTime < BOSS.CHARGE_WINDUP + BOSS.CHARGE_TIME) {
          this.vx = this.facing * BOSS.CHARGE_SPEED;
          if (!this.attackDone) {
            this.attackDone = true;
            world.audio.playSfx('bossAttack');
          }
          if (Math.random() < 0.5) {
            world.emit({
              kind: 'dust', x: mc, y: this.y + this.h, jitter: 40,
              angle: Math.PI, spread: 2, speed: 140, life: 0.5, size: 7,
              color: 'rgba(180,220,120,0.5)', grav: 60
            }, 2);
          }
        } else {
          this.vx = 0;
          if (this.stateTime >= BOSS.CHARGE_WINDUP + BOSS.CHARGE_TIME + 0.5) this.setState('idle');
        }
        break;

      default: /* idle / walk: escolhe o proximo padrao */
        this.facing = pc < mc ? -1 : 1;
        this.attackTimer -= dt;
        this.summonTimer -= dt;

        if (dist > 170) {
          this.setState('walk');
          this.vx = this.facing * BOSS.SPEED[idx];
        } else {
          this.setState('idle');
          this.vx = 0;
        }

        if (this.attackTimer <= 0) {
          this.attackTimer = BOSS.ATTACK_GAP[idx];
          this.chooseAttack(dist, world);
        }
        break;
    }

    /* movimento */
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    var groundY = world.level.ground - this.h;
    if (this.y > groundY) { this.y = groundY; this.vy = 0; }
    this.x = clamp(this.x, 40, world.level.width - this.w - 40);
  };

  Boss.prototype.chooseAttack = function (dist, world) {
    var pool = [];
    if (dist < BOSS.SWIPE_RANGE) pool.push('swipe', 'swipe');
    pool.push('slam');
    if (this.phase >= 2) {
      pool.push('toss');
      if (this.summonTimer <= 0 && !world.hasBossMinion()) pool.push('summon');
    }
    if (this.phase >= 3) {
      pool.push('toss', 'charge');
      if (dist > 240) pool.push('charge');
    }
    var pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === 'summon') this.summonTimer = BOSS.SUMMON_GAP;
    this.setState(pick);
  };

  /* ------------------------------------------------------------ export */

  global.Entities = {
    GRAVITY: GRAVITY,
    MAX_FALL: MAX_FALL,
    EVA: EVA,
    BOSS: BOSS,
    ENEMY_DEFS: ENEMY_DEFS,
    Player: Player,
    Enemy: Enemy,
    Projectile: Projectile,
    Boss: Boss,
    clamp: clamp,
    rectOverlap: rectOverlap,
    hitsRect: hitsRect,
    resolveAxis: resolveAxis
  };
})(window);
