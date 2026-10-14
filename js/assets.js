/* =============================================================
   Eva no Lixo Zero — manifesto de assets e carregador
   Todos os caminhos do jogo ficam neste arquivo.
   ============================================================= */
(function (global) {
  'use strict';

  var SPRITES = global.EVA_SPRITES || {};

  /* Codifica cada segmento do caminho: os assets tem espacos e acentos e
     precisam funcionar tanto em http:// quanto em file://. */
  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function mapFile(key, fallback) {
    var m = (SPRITES.maps || {})[key];
    return m && m.file ? m.file : fallback;
  }

  var ASSETS = {
    images: {
      icon: 'assets/icon.png',

      /* versoes ciclicas geradas por tools/extract_sprites.py: repetem sem
         costura e sem espelhar (as artes trazem placas com texto). */
      map1: mapFile('map1', 'img/Maps/fase 1 -map.png'),
      map2: mapFile('map2', 'img/Maps/fase 2 -map.png'),
      map3: mapFile('map3', 'img/Maps/fase 3 -map.png'),
      map4: mapFile('map4', 'img/Maps/fase 4 -map.png'),
      mapBoss: mapFile('mapBoss', 'img/Maps/fase final boss -map.png'),

      eva: (SPRITES.eva || {}).file,
      goblin: (SPRITES.goblin || {}).file,
      latao: (SPRITES.latao || {}).file,
      mosca: (SPRITES.mosca || {}).file,
      lixorion: (SPRITES.lixorion || {}).file,

      set124: ((SPRITES.platforms || {}).set124 || {}).file,
      set3: ((SPRITES.platforms || {}).set3 || {}).file,
      setboss: ((SPRITES.platforms || {}).setboss || {}).file
    },

    music: {
      menu: 'sounds/eva_main_theme.mp3',
      select: 'sounds/eva_stage_select.mp3',
      tutorial: 'sounds/eva_tutorial.mp3',
      stage1: 'sounds/eva_stage_01_green_start.mp3',
      stage2: 'sounds/eva_stage_02_waste_alert.mp3',
      stage3: 'sounds/eva_stage_03_dirty_city.mp3',
      stage4: 'sounds/eva_stage_04_polluted_zone.mp3',
      finalPath: 'sounds/eva_stage_05_final_path.mp3',
      /* 154 s de duracao: e a trilha completa da batalha, nao um sting. */
      boss: 'sounds/eva_boss_intro.mp3'
    },

    /* maxTime corta caudas longas para o efeito nao atropelar o proximo. */
    sfx: {
      collect: { src: 'sounds/eva_collect_item.mp3', volume: 0.9, maxTime: 0.65, throttle: 0.05 },
      hit: { src: 'sounds/eva_hit.mp3', volume: 1.0, maxTime: 1.1, throttle: 0.15 },
      death: { src: 'sounds/eva_death.mp3', volume: 1.0, maxTime: 4.9, throttle: 0.4 },
      gameOver: { src: 'sounds/eva_game_over.mp3', volume: 1.0, maxTime: 5.3, throttle: 0.4 },
      stageComplete: { src: 'sounds/eva_stage_complete.mp3', volume: 1.0, maxTime: 1.9, throttle: 0.4 },
      lowHealth: { src: 'sounds/eva_low_health.mp3', volume: 0.7, loop: true },
      mobHit: { src: 'sounds/mob_hit.mp3', volume: 0.8, maxTime: 0.85, throttle: 0.08 },
      bossAttack: { src: 'sounds/sound_lixorion_attack.mp3', volume: 0.9, maxTime: 2.1, throttle: 0.2 },
      bossSpawn: { src: 'sounds/lixorion_spawn.mp3', volume: 1.0, maxTime: 1.6, throttle: 0.3 }
    },

    cutscenes: {
      opening: 'cutscene/Abertura do jogo.mp4',
      birth: 'cutscene/O nascimento de Lixórion.mp4',
      overrun: 'cutscene/O mundo sendo tomado pelo lixo.mp4',
      decide: 'cutscene/Eva decide salvar o mundo.mp4',
      fortress: 'cutscene/Descoberta da fortaleza final.mp4',
      transform: 'cutscene/Transformação do Lixórion.mp4',
      bossDefeat: 'cutscene/Derrota de Lixórion.mp4',
      ending: 'cutscene/Final do jogo.mp4',
      postFriends: 'cutscene/Pós credito eva-sofia-gabi.mp4',
      postLixorion: 'cutscene/Pós credito Lixórion.mp4'
    }
  };

  /* ------------------------------------------------------------------ */

  var imageCache = {};
  var failed = {};

  function loadImage(key) {
    if (imageCache[key]) return Promise.resolve(imageCache[key]);
    var src = ASSETS.images[key];
    if (!src) return Promise.reject(new Error('asset desconhecido: ' + key));
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () { imageCache[key] = img; resolve(img); };
      img.onerror = function () { reject(new Error('falha ao carregar ' + src)); };
      img.src = encodePath(src);
    });
  }

  /* Carrega um grupo tolerando falhas: um asset opcional ausente nao pode
     derrubar o jogo inteiro. Devolve a lista de chaves que falharam. */
  function loadGroup(keys, onProgress) {
    var done = 0;
    var total = keys.length || 1;
    var jobs = keys.map(function (key) {
      return loadImage(key).then(function () {
        done++;
        if (onProgress) onProgress(done / total);
        return null;
      }, function (err) {
        done++;
        failed[key] = true;
        console.warn('[assets]', err.message);
        if (onProgress) onProgress(done / total);
        return key;
      });
    });
    return Promise.all(jobs).then(function (results) {
      return results.filter(Boolean);
    });
  }

  function image(key) {
    return imageCache[key] || null;
  }

  function isFailed(key) {
    return !!failed[key];
  }

  global.Assets = {
    ASSETS: ASSETS,
    SPRITES: SPRITES,
    encodePath: encodePath,
    loadImage: loadImage,
    loadGroup: loadGroup,
    image: image,
    isFailed: isFailed
  };
})(window);
