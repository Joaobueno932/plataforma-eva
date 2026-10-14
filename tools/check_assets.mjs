/* Confere que todo caminho citado pelo codigo existe no disco. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const sandbox = { window: {}, console, navigator: {}, document: { getElementById: () => null } };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(read('js/sprite-data.js'), sandbox);
vm.runInContext(read('js/assets.js'), sandbox);

const A = sandbox.window.Assets.ASSETS;
const SP = sandbox.window.Assets.SPRITES;

let missing = [], checked = 0;
function check(p, label) {
  checked++;
  if (!p) { missing.push(`${label}: caminho vazio`); return; }
  if (!fs.existsSync(path.join(ROOT, p))) missing.push(`${label}: ${p}`);
}

for (const [k, v] of Object.entries(A.images)) check(v, 'images.' + k);
for (const [k, v] of Object.entries(A.music)) check(v, 'music.' + k);
for (const [k, v] of Object.entries(A.sfx)) check(v.src, 'sfx.' + k);
for (const [k, v] of Object.entries(A.cutscenes)) check(v, 'cutscenes.' + k);
for (const [k, g] of Object.entries(SP)) {
  if (k === 'maps') { for (const [m, v] of Object.entries(g)) check(v.file, 'maps.' + m); }
  else if (k === 'menu') { g.forEach((f, i) => check(f, 'menu[' + i + ']')); }
  else if (k === 'platforms') { for (const [s, v] of Object.entries(g)) check(v.file, 'platforms.' + s); }
  else check(g.file, 'sprites.' + k);
}

// pecas de plataforma citadas nas fases precisam existir no atlas
vm.runInContext('window.Levels = undefined;', sandbox);
vm.runInContext(read('js/levels.js'), sandbox);
const L = sandbox.window.Levels;
const all = L.LEVELS.concat([L.BOSS_LEVEL]);
for (const lv of all) {
  const frames = (SP.platforms[lv.set] || {}).frames || {};
  for (const p of (lv.platforms || []).concat(lv.decor || [])) {
    checked++;
    if (!frames[p.piece]) missing.push(`fase ${lv.id}: peca ausente ${p.piece} em ${lv.set}`);
  }
  checked++;
  if (!A.images[lv.map]) missing.push(`fase ${lv.id}: mapa ${lv.map}`);
  checked++;
  if (!A.music[lv.music]) missing.push(`fase ${lv.id}: musica ${lv.music}`);
}

console.log(`verificados: ${checked}`);
if (missing.length) { console.log('FALTANDO:'); missing.forEach(m => console.log('  - ' + m)); process.exit(1); }
console.log('todos os assets referenciados existem.');
