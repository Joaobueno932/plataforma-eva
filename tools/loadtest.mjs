/* =============================================================
   Eva no Lixo Zero - teste de carga
   node tools/loadtest.mjs --url http://localhost:8080 --users 30

   Simula jogadores abrindo o link ao mesmo tempo. Cada jogador virtual
   baixa exatamente o que o navegador baixa, na mesma ordem e com o mesmo
   limite de 6 conexoes por host:

     1. index.html, styles.css e os 8 arquivos .js
     2. sprites da Eva, icone e as duas artes do menu (CSS)
     3. efeitos sonoros do boot + trilha do menu   -> ja esta no menu
     4. as 4 cutscenes de abertura (por Range, como o <video>)
     5. mapa, plataformas, inimigos e trilha da fase 1 -> jogando

   Mede tempo ate o menu, tempo ate a fase 1, latencia por requisicao,
   bytes por jogador e vazao total. Opcoes:
     --users N      jogadores simultaneos (padrao 30)
     --ramp S       segundos para entrar todo mundo (padrao 5; 0 = de uma vez)
     --scenario X   boot | menu | full (padrao full)
     --repeat N     rodadas por jogador (padrao 1)
     --cache        manda If-None-Match na 2a rodada (simula quem ja jogou)
     --timeout MS   limite por requisicao (padrao 60000)
   ============================================================= */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------ args */
const args = new Map();
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) {
    const next = all[i + 1];
    args.set(a.slice(2), next && !next.startsWith('--') ? next : 'true');
  }
});
const BASE = (args.get('url') || 'http://localhost:8080').replace(/\/$/, '');
const USERS = Number(args.get('users') || 30);
const RAMP = Number(args.get('ramp') ?? 5);
const SCENARIO = args.get('scenario') || 'full';
const REPEAT = Number(args.get('repeat') || 1);
const USE_CACHE = args.has('cache');
const TIMEOUT = Number(args.get('timeout') || 60000);

/* --------------------------------- paths reais, lidos do proprio jogo */
/* Em vez de repetir a lista de assets aqui (e deixar ela envelhecer),
   roda js/sprite-data.js e js/assets.js num contexto falso de navegador
   e pega o manifesto que o jogo usa de verdade. */
function manifest() {
  const ctx = vm.createContext({ console });
  ctx.window = ctx;
  for (const f of ['js/sprite-data.js', 'js/assets.js']) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return { ASSETS: ctx.Assets.ASSETS, encodePath: ctx.Assets.encodePath };
}
const { ASSETS, encodePath } = manifest();
const img = (k) => encodePath(ASSETS.images[k]);
const mus = (k) => encodePath(ASSETS.music[k]);
const sfx = (k) => encodePath(ASSETS.sfx[k].src);
const cut = (k) => encodePath(ASSETS.cutscenes[k]);

const CODE = [
  '/index.html', '/styles.css',
  '/js/sprite-data.js', '/js/assets.js', '/js/audio.js', '/js/cutscenes.js',
  '/js/levels.js', '/js/entities.js', '/js/renderer.js', '/js/game.js'
];
const BOOT_IMAGES = [
  '/' + img('eva'), '/' + img('icon'),
  '/img/generated/menu/menu-eva.png', '/img/generated/menu/menu-lixorion.png'
];
const BOOT_AUDIO = ['/' + sfx('collect'), '/' + sfx('hit'), '/' + sfx('mobHit')];
const MENU_MUSIC = '/' + mus('menu');
const OPENING = ['opening', 'birth', 'overrun', 'decide'].map((k) => '/' + cut(k));
const LEVEL1 = ['/' + img('map1'), '/' + img('set124'), '/' + img('goblin')];
const LEVEL1_MUSIC = '/' + mus('stage1');

/* ------------------------------------------------------------- http */
const url = new URL(BASE);
const lib = url.protocol === 'https:' ? https : http;
/* 6 sockets por jogador: e o limite que Chrome e Firefox usam por host */
function newAgent() {
  return new lib.Agent({ keepAlive: true, maxSockets: 6, keepAliveMsecs: 15000 });
}

const samples = [];   // { path, ms, status, bytes, cached }
let failures = [];

function get(agent, p, opts = {}) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const headers = { 'Accept-Encoding': 'gzip', 'Connection': 'keep-alive' };
    if (opts.range) headers.Range = opts.range;
    if (opts.etag) headers['If-None-Match'] = opts.etag;

    const req = lib.request(
      { protocol: url.protocol, hostname: url.hostname, port: url.port, path: p, method: 'GET', agent, headers },
      (res) => {
        let bytes = 0;
        res.on('data', (c) => { bytes += c.length; });
        res.on('end', () => {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          const rec = { path: p, ms, status: res.statusCode, bytes, etag: res.headers.etag };
          samples.push(rec);
          if (res.statusCode >= 400) failures.push(p + ' -> HTTP ' + res.statusCode);
          resolve(rec);
        });
        res.on('error', (e) => {
          failures.push(p + ' -> ' + e.message);
          resolve({ path: p, ms: 0, status: 0, bytes: 0, error: e.message });
        });
      }
    );
    req.setTimeout(TIMEOUT, () => { req.destroy(new Error('timeout ' + TIMEOUT + 'ms')); });
    req.on('error', (e) => {
      failures.push(p + ' -> ' + e.message);
      resolve({ path: p, ms: Number(process.hrtime.bigint() - t0) / 1e6, status: 0, bytes: 0, error: e.message });
    });
    req.end();
  });
}

/* O <video>/<audio> pede o arquivo em pedacos. Reproduz isso para o teste
   nao ficar otimista nem pessimista demais em relacao ao navegador real. */
async function stream(agent, p, chunkBytes = 1024 * 1024, maxChunks = 4) {
  let start = 0;
  for (let i = 0; i < maxChunks; i++) {
    const r = await get(agent, p, { range: `bytes=${start}-${start + chunkBytes - 1}` });
    if (r.status !== 206 && r.status !== 200) break;
    if (r.status === 200 || r.bytes < chunkBytes) break;   // servidor sem Range ou fim do arquivo
    start += chunkBytes;
  }
}

/* roda uma lista com no maximo `limit` requisicoes ao mesmo tempo */
async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k]); }
  });
  await Promise.all(workers);
}

/* ------------------------------------------------------- um jogador */
async function player(id, etags) {
  const agent = newAgent();
  const t0 = Date.now();
  const mark = {};

  const withEtag = (p) => (USE_CACHE && etags[p] ? { etag: etags[p] } : {});
  const remember = (r) => { if (r && r.etag) etags[r.path] = r.etag; };

  /* 1. html + css + js (o navegador baixa o html, depois os scripts) */
  remember(await get(agent, '/index.html', withEtag('/index.html')));
  await pool(CODE.slice(1), 6, async (p) => remember(await get(agent, p, withEtag(p))));

  /* 2. sprites iniciais e arte do menu */
  await pool(BOOT_IMAGES, 6, async (p) => remember(await get(agent, p, withEtag(p))));
  mark.menu = Date.now() - t0;

  if (SCENARIO === 'boot') { agent.destroy(); return mark; }

  /* 3. efeitos + trilha do menu (preload = auto: baixa o mp3 inteiro) */
  await pool(BOOT_AUDIO, 3, async (p) => remember(await get(agent, p, withEtag(p))));
  await stream(agent, MENU_MUSIC, 1024 * 1024, 6);
  mark.menuAudio = Date.now() - t0;

  if (SCENARIO === 'menu') { agent.destroy(); return mark; }

  /* 4. cutscenes de abertura, uma depois da outra */
  for (const c of OPENING) await stream(agent, c, 1024 * 1024, 4);
  mark.cutscenes = Date.now() - t0;

  /* 5. assets da fase 1 + trilha */
  await pool(LEVEL1, 6, async (p) => remember(await get(agent, p, withEtag(p))));
  await stream(agent, LEVEL1_MUSIC, 1024 * 1024, 4);
  mark.level1 = Date.now() - t0;

  agent.destroy();
  return mark;
}

/* ------------------------------------------------------- estatistica */
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
const fmtMB = (b) => (b / 1048576).toFixed(1) + ' MB';
const fmtS = (ms) => (ms / 1000).toFixed(2) + ' s';

async function main() {
  console.log('Teste de carga - Eva no Lixo Zero');
  console.log('  alvo:      ' + BASE);
  console.log('  jogadores: ' + USERS + ' (entrando em ' + RAMP + ' s)');
  console.log('  cenario:   ' + SCENARIO + (REPEAT > 1 ? ' x' + REPEAT + ' rodadas' : ''));
  console.log('');

  /* checagem previa: se o link estiver errado, melhor saber agora */
  const probe = await get(newAgent(), '/index.html');
  if (probe.status !== 200) {
    console.error('Nao consegui abrir ' + BASE + '/index.html (status ' + probe.status + ').');
    console.error('Suba o servidor antes:  node tools/serve.mjs');
    process.exit(1);
  }
  samples.length = 0;
  failures = [];

  const etags = {};
  const t0 = Date.now();
  const marks = [];

  for (let round = 0; round < REPEAT; round++) {
    const jobs = [];
    for (let i = 0; i < USERS; i++) {
      const delay = RAMP > 0 ? (i / USERS) * RAMP * 1000 : 0;
      jobs.push(new Promise((r) => setTimeout(r, delay)).then(() => player(i, etags)).then((m) => marks.push(m)));
    }
    await Promise.all(jobs);
  }

  const wall = Date.now() - t0;
  const bytes = samples.reduce((a, s) => a + s.bytes, 0);
  const lat = samples.map((s) => s.ms);
  const ok = samples.filter((s) => s.status >= 200 && s.status < 400).length;

  const perPlayerBytes = bytes / (USERS * REPEAT);

  console.log('--- resultado ---------------------------------------------');
  console.log('  duracao total ........ ' + fmtS(wall));
  console.log('  requisicoes .......... ' + samples.length + '  (ok: ' + ok + ', falhas: ' + failures.length + ')');
  console.log('  trafego total ........ ' + fmtMB(bytes));
  console.log('  por jogador .......... ' + fmtMB(perPlayerBytes));
  console.log('  vazao media .......... ' + (bytes / 1048576 / (wall / 1000)).toFixed(1) + ' MB/s  (' +
              (bytes * 8 / 1e6 / (wall / 1000)).toFixed(0) + ' Mbps)');
  console.log('  req/s ................ ' + (samples.length / (wall / 1000)).toFixed(1));
  console.log('');
  console.log('  latencia por requisicao:');
  console.log('    p50 ' + pct(lat, 50).toFixed(0) + ' ms | p95 ' + pct(lat, 95).toFixed(0) +
              ' ms | p99 ' + pct(lat, 99).toFixed(0) + ' ms | max ' + Math.max(...lat).toFixed(0) + ' ms');
  console.log('');

  const show = (label, key) => {
    const v = marks.map((m) => m[key]).filter((x) => x != null);
    if (!v.length) return;
    console.log('  ' + label.padEnd(22, '.') + ' p50 ' + fmtS(pct(v, 50)) + ' | p95 ' + fmtS(pct(v, 95)) +
                ' | pior ' + fmtS(Math.max(...v)));
  };
  console.log('  tempo do jogador (do clique no link ate...):');
  show('menu na tela', 'menu');
  show('trilha do menu', 'menuAudio');
  show('fim das cutscenes', 'cutscenes');
  show('fase 1 jogavel', 'level1');

  if (failures.length) {
    console.log('');
    console.log('  FALHAS (' + failures.length + '):');
    const counted = {};
    failures.forEach((f) => { counted[f] = (counted[f] || 0) + 1; });
    Object.entries(counted).slice(0, 15).forEach(([f, n]) => console.log('    ' + n + 'x ' + f));
  }

  /* os 8 arquivos mais pesados do teste: onde doi mais cortar */
  const byPath = {};
  samples.forEach((s) => { byPath[s.path] = (byPath[s.path] || 0) + s.bytes; });
  const top = Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('');
  console.log('  arquivos que mais pesaram:');
  top.forEach(([p, b]) => console.log('    ' + fmtMB(b).padStart(9) + '  ' + decodeURIComponent(p)));

  /* O teste roda em rede local (ou na propria maquina), entao o que ele mede
     e o limite do servidor, nao o do local do evento. A conta abaixo leva o
     peso por jogador para a banda que o evento tiver de verdade. */
  console.log('');
  console.log('  projecao para ' + USERS + ' pessoas abrindo juntas:');
  console.log('    (banda do local)      (todos com o jogo carregado em)');
  [[20, '20 Mbps - internet simples'], [50, '50 Mbps - fibra comum'],
   [100, '100 Mbps - fibra boa'], [300, '300 Mbps - wi-fi local, sem internet']]
    .forEach(([mbps, label]) => {
      const segundos = (perPlayerBytes * USERS * 8) / (mbps * 1e6);
      console.log('    ' + label.padEnd(40) + (segundos < 90
        ? segundos.toFixed(0) + ' s'
        : (segundos / 60).toFixed(1) + ' min'));
    });
  console.log('-----------------------------------------------------------');
  process.exit(failures.length ? 2 : 0);
}

main();
