/* =============================================================
   Eva no Lixo Zero - servidor estatico para o evento
   node tools/serve.mjs [--port 8080] [--host 0.0.0.0]

   O jogo e 100% client-side: nao ha banco, sessao nem estado
   compartilhado. O unico gargalo com muita gente junto e a entrega
   dos arquivos. Este servidor cuida disso:
     - Range (206) nos mp4/mp3: o navegador baixa o video em pedacos
       em vez de puxar o arquivo inteiro de uma vez;
     - gzip nos arquivos de texto (html/css/js), com cache em memoria;
     - Cache-Control longo nos assets: o segundo jogador na mesma
       maquina (e o replay do mesmo jogador) nao baixa nada de novo;
     - 304 por ETag quando o navegador ja tem o arquivo;
     - keep-alive, para nao refazer conexao a cada asset.
   ============================================================= */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = new Map();
process.argv.slice(2).forEach((a, i, all) => {
  if (a.startsWith('--')) args.set(a.slice(2), all[i + 1]);
});
const PORT = Number(args.get('port') || process.env.PORT || 8080);
const HOST = args.get('host') || '0.0.0.0';
const QUIET = args.has('quiet');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

const COMPRESS = new Set(['.html', '.css', '.js', '.mjs', '.json', '.txt', '.svg']);
/* mp4/mp3/png ja vem comprimidos: gzip neles so gasta CPU */

const gzipCache = new Map();   // caminho -> { buf, etag, mtime }
const statCache = new Map();   // caminho -> { stat, at }
const STAT_TTL = 10_000;

const stats = { requests: 0, bytes: 0, errors: 0, open: 0, peak: 0, started: Date.now() };

async function statOf(file) {
  const hit = statCache.get(file);
  if (hit && Date.now() - hit.at < STAT_TTL) return hit.stat;
  const st = await fsp.stat(file);
  statCache.set(file, { stat: st, at: Date.now() });
  return st;
}

function etagOf(st) {
  return '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
}

async function gzipOf(file, st) {
  const hit = gzipCache.get(file);
  if (hit && hit.mtime === st.mtimeMs) return hit.buf;
  const raw = await fsp.readFile(file);
  const buf = zlib.gzipSync(raw, { level: 6 });
  gzipCache.set(file, { buf, mtime: st.mtimeMs });
  return buf;
}

/* Resolve a URL para um arquivo dentro de ROOT. Qualquer tentativa de
   sair da pasta (../) devolve null. */
function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) return null;
  return file;
}

function cacheHeader(ext, file) {
  /* O index.html muda a cada versao publicada: sempre revalida.
     O resto tem nome estavel e pode ficar guardado por 7 dias. */
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=604800';
}

const server = http.createServer(async (req, res) => {
  stats.requests++;
  stats.open++;
  if (stats.open > stats.peak) stats.peak = stats.open;
  res.on('close', () => { stats.open--; });

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Allow': 'GET, HEAD' });
    return res.end();
  }

  if (req.url === '/__stats') {
    const body = JSON.stringify({
      ...stats,
      uptimeS: Math.round((Date.now() - stats.started) / 1000),
      rssMB: +(process.memoryUsage().rss / 1048576).toFixed(1)
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  const file = resolveFile(req.url);
  if (!file) {
    stats.errors++;
    res.writeHead(400).end('caminho invalido');
    return;
  }

  let st;
  try {
    st = await statOf(file);
    if (st.isDirectory()) st = await statOf(path.join(file, 'index.html'));
  } catch {
    stats.errors++;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('nao encontrado: ' + req.url);
  }

  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const etag = etagOf(st);

  const base = {
    'Content-Type': type,
    'Cache-Control': cacheHeader(ext, file),
    'ETag': etag,
    'Last-Modified': st.mtime.toUTCString(),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff'
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, base);
    return res.end();
  }

  /* ---- Range: video e audio pedem pedacos, nao o arquivo inteiro ---- */
  const range = req.headers.range;
  if (range && /^bytes=/.test(range)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);
      if (start === null) { start = Math.max(0, st.size - (end || 0)); end = st.size - 1; }
      if (end === null || end >= st.size) end = st.size - 1;
      if (start > end || start >= st.size) {
        res.writeHead(416, { ...base, 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      const len = end - start + 1;
      res.writeHead(206, {
        ...base,
        'Content-Range': `bytes ${start}-${end}/${st.size}`,
        'Content-Length': len
      });
      if (req.method === 'HEAD') return res.end();
      stats.bytes += len;
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }

  /* ---- gzip para texto ---- */
  const accepts = String(req.headers['accept-encoding'] || '');
  if (COMPRESS.has(ext) && /\bgzip\b/.test(accepts)) {
    const buf = await gzipOf(file, st);
    res.writeHead(200, { ...base, 'Content-Encoding': 'gzip', 'Content-Length': buf.length, 'Vary': 'Accept-Encoding' });
    if (req.method === 'HEAD') return res.end();
    stats.bytes += buf.length;
    return res.end(buf);
  }

  res.writeHead(200, { ...base, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  stats.bytes += st.size;
  fs.createReadStream(file).pipe(res);
});

server.keepAliveTimeout = 30_000;
server.headersTimeout = 35_000;
server.on('clientError', (err, socket) => {
  stats.errors++;
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  if (QUIET) { console.log('pronto em ' + PORT); return; }
  console.log('Eva no Lixo Zero - servidor do evento');
  console.log('  pasta: ' + ROOT);
  console.log('  local: http://localhost:' + PORT + '/');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) {
        console.log('  rede:  http://' + ni.address + ':' + PORT + '/   (' + name + ')');
      }
    }
  }
  console.log('  stats: http://localhost:' + PORT + '/__stats');
  console.log('Ctrl+C para parar.');
});
