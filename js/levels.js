/* =============================================================
   Eva no Lixo Zero — dados das fases
   Tudo aqui e dado puro: nenhum "if (fase === 2)" espalhado pelo motor.
   As coordenadas Y das plataformas sao a SUPERFICIE onde a Eva pisa.
   ============================================================= */
(function (global) {
  'use strict';

  var GROUND_DEPTH = 160;   // espessura de colisao do chao
  var PLAT_DEPTH = 22;      // espessura de colisao das plataformas

  /* Cada fase declara a linha do chao do proprio mapa (ja em coordenadas
     do canvas 960x540) porque cada arte tem o horizonte em altura diferente. */

  var LEVELS = [
    {
      id: 1,
      name: 'Floresta Renovada',
      subtitle: 'O começo da jornada',
      map: 'map1',
      set: 'set124',
      music: 'stage1',
      width: 2880,
      ground: 432,
      spawn: { x: 120 },
      exit: { x: 2740 },
      checkpoints: [1160, 2110],
      enemyTypes: ['goblin'],
      platforms: [
        { x: 330, y: 352, piece: 'set124_18' },
        { x: 560, y: 296, piece: 'set124_02' },
        { x: 790, y: 352, piece: 'set124_48' },
        { x: 1030, y: 300, piece: 'set124_01' },
        { x: 1320, y: 250, piece: 'set124_19' },
        { x: 1480, y: 330, piece: 'set124_21' },
        { x: 1720, y: 290, piece: 'set124_45' },
        { x: 2150, y: 340, piece: 'set124_08' },
        { x: 2430, y: 280, piece: 'set124_02' }
      ],
      collectibles: [
        { x: 406, y: 314, kind: 'paper' },
        { x: 626, y: 258, kind: 'plastic' },
        { x: 854, y: 314, kind: 'metal' },
        { x: 1116, y: 262, kind: 'glass' },
        { x: 1366, y: 212, kind: 'paper' },
        { x: 1250, y: 394, kind: 'glass' },
        { x: 1883, y: 252, kind: 'plastic' },
        { x: 2251, y: 302, kind: 'metal' },
        { x: 2496, y: 242, kind: 'paper' }
      ],
      enemies: [
        { type: 'goblin', x: 900, left: 810, right: 1150 },
        { type: 'goblin', x: 1900, left: 1770, right: 2100 }
      ],
      decor: [
        { piece: 'set124_44', x: 690, y: 432 },
        { piece: 'set124_40', x: 1595, y: 432 },
        { piece: 'set124_42', x: 2050, y: 432 },
        { piece: 'set124_41', x: 2620, y: 432, flip: true },
        { piece: 'set124_44', x: 380, y: 432, flip: true }
      ]
    },

    {
      id: 2,
      name: 'Rio Poluído',
      subtitle: 'A poluição fica evidente',
      map: 'map2',
      set: 'set124',
      music: 'stage2',
      width: 3300,
      ground: 452,
      spawn: { x: 120 },
      exit: { x: 3180 },
      checkpoints: [1210, 2320],
      enemyTypes: ['goblin', 'latao'],
      platforms: [
        { x: 300, y: 372, piece: 'set124_18' },
        { x: 530, y: 312, piece: 'set124_02' },
        { x: 740, y: 372, piece: 'set124_48' },
        { x: 960, y: 322, piece: 'set124_12' },
        { x: 1250, y: 262, piece: 'set124_19' },
        { x: 1410, y: 340, piece: 'set124_21' },
        { x: 1620, y: 290, piece: 'set124_01' },
        { x: 1880, y: 352, piece: 'set124_08' },
        { x: 2170, y: 300, piece: 'set124_45' },
        { x: 2580, y: 240, piece: 'set124_02' },
        { x: 2760, y: 330, piece: 'set124_18' },
        { x: 2990, y: 270, piece: 'set124_22' }
      ],
      collectibles: [
        { x: 376, y: 334, kind: 'paper' },
        { x: 596, y: 274, kind: 'plastic' },
        { x: 804, y: 334, kind: 'metal' },
        { x: 1061, y: 284, kind: 'glass' },
        { x: 1296, y: 224, kind: 'paper' },
        { x: 1706, y: 252, kind: 'plastic' },
        { x: 1600, y: 414, kind: 'metal' },
        { x: 1981, y: 314, kind: 'glass' },
        { x: 2333, y: 262, kind: 'paper' },
        { x: 2646, y: 202, kind: 'plastic' },
        { x: 3033, y: 232, kind: 'glass' }
      ],
      enemies: [
        { type: 'goblin', x: 840, left: 720, right: 1010 },
        { type: 'latao', x: 1470, left: 1360, right: 1720 },
        { type: 'goblin', x: 2010, left: 1900, right: 2210 },
        { type: 'latao', x: 2640, left: 2470, right: 2860 }
      ],
      decor: [
        { piece: 'set124_29', x: 640, y: 452 },
        { piece: 'set124_37', x: 1180, y: 452 },
        { piece: 'set124_31', x: 1790, y: 452 },
        { piece: 'set124_28', x: 2420, y: 452 },
        { piece: 'set124_33', x: 2900, y: 452 },
        { piece: 'set124_20', x: 240, y: 452 }
      ]
    },

    {
      id: 3,
      name: 'Praia Contaminada',
      subtitle: 'A costa sufocada pelo lixo',
      map: 'map3',
      set: 'set3',
      music: 'stage3',
      width: 3500,
      ground: 455,
      spawn: { x: 120 },
      exit: { x: 3390 },
      checkpoints: [1280, 2420],
      enemyTypes: ['goblin', 'mosca'],
      platforms: [
        { x: 290, y: 378, piece: 'set3_05' },
        { x: 520, y: 312, piece: 'set3_10' },
        { x: 730, y: 248, piece: 'set3_11' },
        { x: 940, y: 330, piece: 'set3_13' },
        { x: 1140, y: 262, piece: 'set3_06' },
        { x: 1380, y: 196, piece: 'set3_10' },
        { x: 1600, y: 290, piece: 'set3_15' },
        { x: 2030, y: 222, piece: 'set3_16' },
        { x: 2240, y: 320, piece: 'set3_08' },
        { x: 2540, y: 250, piece: 'set3_17' },
        { x: 2760, y: 180, piece: 'set3_11' },
        { x: 2960, y: 300, piece: 'set3_09' }
      ],
      collectibles: [
        { x: 368, y: 340, kind: 'plastic' },
        { x: 588, y: 274, kind: 'paper' },
        { x: 794, y: 210, kind: 'glass' },
        { x: 1005, y: 292, kind: 'metal' },
        { x: 1218, y: 224, kind: 'plastic' },
        { x: 1448, y: 158, kind: 'paper' },
        { x: 1781, y: 252, kind: 'glass' },
        { x: 2102, y: 184, kind: 'metal' },
        { x: 2357, y: 282, kind: 'plastic' },
        { x: 2614, y: 212, kind: 'paper' },
        { x: 2824, y: 142, kind: 'glass' },
        { x: 3155, y: 262, kind: 'metal' }
      ],
      enemies: [
        { type: 'goblin', x: 880, left: 780, right: 1080 },
        { type: 'mosca', x: 1300, y: 250, left: 1180, right: 1560 },
        { type: 'goblin', x: 2150, left: 2040, right: 2320 },
        { type: 'mosca', x: 2400, y: 200, left: 2260, right: 2700 },
        { type: 'mosca', x: 3050, y: 230, left: 2900, right: 3300 }
      ],
      decor: [
        { piece: 'set3_42', x: 420, y: 455 },
        { piece: 'set3_32', x: 1080, y: 455 },
        { piece: 'set3_44', x: 1900, y: 455 },
        { piece: 'set3_34', x: 2480, y: 455 },
        { piece: 'set3_33', x: 3120, y: 455 },
        { piece: 'set3_45', x: 220, y: 455 }
      ]
    },

    {
      id: 4,
      name: 'Zona Industrial Contaminada',
      subtitle: 'O domínio de Lixórion se aproxima',
      map: 'map4',
      set: 'set124',
      music: 'stage4',
      width: 3800,
      ground: 428,
      spawn: { x: 120 },
      exit: { x: 3680 },
      checkpoints: [1360, 2520],
      enemyTypes: ['goblin', 'latao', 'mosca'],
      platforms: [
        { x: 300, y: 348, piece: 'set124_48' },
        { x: 500, y: 288, piece: 'set124_02' },
        { x: 710, y: 348, piece: 'set124_21' },
        { x: 900, y: 280, piece: 'set124_18' },
        { x: 1140, y: 212, piece: 'set124_19' },
        { x: 1300, y: 300, piece: 'set124_01' },
        { x: 1560, y: 236, piece: 'set124_02' },
        { x: 1770, y: 320, piece: 'set124_08' },
        { x: 2060, y: 256, piece: 'set124_45' },
        { x: 2470, y: 196, piece: 'set124_22' },
        { x: 2640, y: 290, piece: 'set124_11' },
        { x: 2940, y: 230, piece: 'set124_46' },
        { x: 3090, y: 320, piece: 'set124_18' },
        { x: 3320, y: 260, piece: 'set124_02' }
      ],
      collectibles: [
        { x: 364, y: 310, kind: 'metal' },
        { x: 566, y: 250, kind: 'plastic' },
        { x: 774, y: 310, kind: 'paper' },
        { x: 977, y: 242, kind: 'glass' },
        { x: 1186, y: 174, kind: 'metal' },
        { x: 1386, y: 262, kind: 'plastic' },
        { x: 1626, y: 198, kind: 'paper' },
        { x: 1871, y: 282, kind: 'glass' },
        { x: 2223, y: 218, kind: 'metal' },
        { x: 2513, y: 158, kind: 'plastic' },
        { x: 2746, y: 252, kind: 'paper' },
        { x: 3167, y: 282, kind: 'glass' },
        { x: 3386, y: 222, kind: 'metal' }
      ],
      enemies: [
        { type: 'goblin', x: 820, left: 700, right: 1020 },
        { type: 'latao', x: 1450, left: 1330, right: 1700 },
        { type: 'mosca', x: 1900, y: 220, left: 1780, right: 2180 },
        { type: 'goblin', x: 2300, left: 2180, right: 2460 },
        { type: 'latao', x: 2800, left: 2660, right: 3000 },
        { type: 'mosca', x: 3200, y: 210, left: 3050, right: 3450 },
        { type: 'goblin', x: 3480, left: 3380, right: 3620 }
      ],
      decor: [
        { piece: 'set124_28', x: 620, y: 428 },
        { piece: 'set124_30', x: 1200, y: 428 },
        { piece: 'set124_32', x: 1720, y: 428 },
        { piece: 'set124_29', x: 2380, y: 428 },
        { piece: 'set124_33', x: 2980, y: 428 },
        { piece: 'set124_31', x: 3480, y: 428 },
        { piece: 'set124_13', x: 200, y: 428 }
      ]
    }
  ];

  var BOSS_LEVEL = {
    id: 5,
    name: 'Núcleo de Lixórion',
    subtitle: 'A batalha final',
    map: 'mapBoss',
    set: 'setboss',
    music: 'boss',
    width: 2000,
    ground: 400,
    spawn: { x: 180 },
    isBoss: true,
    checkpoints: [],
    enemyTypes: ['goblin', 'mosca'],
    platforms: [
      { x: 210, y: 292, piece: 'setboss_08' },
      { x: 900, y: 236, piece: 'setboss_16' },
      { x: 1560, y: 292, piece: 'setboss_08' }
    ],
    collectibles: [],
    /* Resíduos da arena: reabastecem o Eco Power durante a luta. */
    scrapSpots: [
      { x: 420, kind: 'plastic' },
      { x: 780, kind: 'metal' },
      { x: 1180, kind: 'paper' },
      { x: 1560, kind: 'glass' }
    ],
    enemies: [],
    decor: [
      { piece: 'setboss_25', x: 340, y: 400 },
      { piece: 'setboss_24', x: 700, y: 400 },
      { piece: 'setboss_39', x: 1320, y: 400 },
      { piece: 'setboss_30', x: 1780, y: 400 },
      { piece: 'setboss_31', x: 1050, y: 400 }
    ],
    /* 60 de vida: ~3 ciclos de Eco Power + socos, dentro da duracao da trilha */
    boss: { x: 1450, hp: 60 }
  };

  var KIND_COLORS = {
    paper: { main: '#BFE4FF', edge: '#5EA7DE', aura: 'rgba(120,200,255,0.55)' },
    plastic: { main: '#FFE49A', edge: '#D9A63C', aura: 'rgba(255,215,120,0.55)' },
    metal: { main: '#DDE6F2', edge: '#8FA0B8', aura: 'rgba(200,220,245,0.5)' },
    glass: { main: '#A9F3D0', edge: '#3FA97C', aura: 'rgba(120,240,190,0.5)' }
  };

  var KIND_LABEL = { paper: 'Papel', plastic: 'Plástico', metal: 'Metal', glass: 'Vidro' };

  /** Converte os dados declarativos em uma instancia jogavel. */
  function buildLevel(data) {
    var platforms = [{
      x: -40, y: data.ground, w: data.width + 80, h: GROUND_DEPTH, ground: true
    }];

    var pieceData = ((global.Assets.SPRITES.platforms || {})[data.set] || {}).frames || {};

    (data.platforms || []).forEach(function (p) {
      var frame = pieceData[p.piece];
      var w = p.w || (frame ? frame.w : 160);
      platforms.push({
        x: p.x, y: p.y, w: w, h: p.h || PLAT_DEPTH,
        piece: p.piece, set: data.set, top: frame ? frame.top : 0,
        artH: frame ? frame.h : 0
      });
    });

    return {
      data: data,
      id: data.id,
      name: data.name,
      subtitle: data.subtitle,
      map: data.map,
      set: data.set,
      music: data.music,
      width: data.width,
      ground: data.ground,
      isBoss: !!data.isBoss,
      platforms: platforms,
      decor: (data.decor || []).map(function (d) { return Object.assign({ set: data.set }, d); }),
      collectibles: (data.collectibles || []).map(function (c) {
        return { x: c.x, y: c.y, kind: c.kind, collected: false, bob: Math.random() * 6.28 };
      }),
      checkpoints: (data.checkpoints || []).map(function (x) {
        return { x: x, y: data.ground, taken: false };
      }),
      exit: data.exit ? { x: data.exit.x, y: data.ground - 96, w: 62, h: 96 } : null,
      spawn: { x: data.spawn.x, y: data.ground - 80 }
    };
  }

  global.Levels = {
    LEVELS: LEVELS,
    BOSS_LEVEL: BOSS_LEVEL,
    KIND_COLORS: KIND_COLORS,
    KIND_LABEL: KIND_LABEL,
    GROUND_DEPTH: GROUND_DEPTH,
    PLAT_DEPTH: PLAT_DEPTH,
    build: buildLevel
  };
})(window);
