// Orozco Import — conector MCP de archivos.
// Da a Claude herramientas SOLO sobre SITES_ROOT (/srv/sites): leer, escribir, mover, borrar,
// descargar y restaurar versiones. No ejecuta comandos. Acceso con OAuth + contraseña.
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { InvalidRequestError, InvalidGrantError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://mcp.orozcoimport.es').replace(/\/$/, '');
const PORT = Number(process.env.PORT || 8787);
const SITES_ROOT = path.resolve(process.env.SITES_ROOT || '/srv/sites');
const DATA_DIR = path.resolve(process.env.DATA_DIR || '/var/lib/orozco-mcp');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const SETUP_FILE = path.join(DATA_DIR, 'setup-code');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.log');

const ACCESS_TTL = 8 * 3600;            // 8 h
const REFRESH_TTL = 90 * 24 * 3600;     // 90 días
const MAX_READ = 2 * 1024 * 1024;       // 2 MB de texto por lectura
const MAX_WRITE = 8 * 1024 * 1024;      // 8 MB por escritura
const MAX_DOWNLOAD = 150 * 1024 * 1024; // 150 MB por descarga
const KEEP_VERSIONS = 30;

fs.mkdirSync(HISTORY_DIR, { recursive: true });

// ---------------------------------------------------------------- estado persistente
const now = () => Math.floor(Date.now() / 1000);
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { password: null, clients: {}, access: {}, refresh: {} }; }
}
let state = loadState();
function saveState() {
  const t = now();
  for (const k of Object.keys(state.access)) if (state.access[k].exp < t) delete state.access[k];
  for (const k of Object.keys(state.refresh)) if (state.refresh[k].exp < t) delete state.refresh[k];
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw) {
  if (!state.password) return false;
  const { hash } = hashPassword(pw, state.password.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(state.password.hash, 'hex'));
}
function readSetupCode() {
  try { return fs.readFileSync(SETUP_FILE, 'utf8').trim().toLowerCase(); } catch { return null; }
}

// Bloqueo ante fuerza bruta: 5 fallos → 15 min sin aceptar intentos
const failures = [];
function lockedOut() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  while (failures.length && failures[0] < cutoff) failures.shift();
  return failures.length >= 5;
}

// ---------------------------------------------------------------- proveedor OAuth
const pending = new Map(); // id -> { client, params, created }
const codes = new Map();   // code -> { clientId, params, created }

const clientsStore = {
  async getClient(id) { return state.clients[id]; },
  async registerClient(client) {
    state.clients[client.client_id] = client;
    saveState();
    return client;
  },
};

function issueTokens(clientId, scopes) {
  const access = randomToken();
  const refresh = randomToken();
  state.access[sha256(access)] = { clientId, scopes, exp: now() + ACCESS_TTL };
  state.refresh[sha256(refresh)] = { clientId, scopes, exp: now() + REFRESH_TTL };
  saveState();
  return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopes.join(' ') };
}

const provider = {
  get clientsStore() { return clientsStore; },
  async authorize(client, params, res) {
    if (!client.redirect_uris.includes(params.redirectUri)) throw new InvalidRequestError('redirect_uri no registrada');
    const id = randomToken();
    pending.set(id, { client, params, created: Date.now() });
    res.type('html').send(loginPage(id));
  },
  async challengeForAuthorizationCode(client, code) {
    const c = codes.get(code);
    if (!c || c.clientId !== client.client_id) throw new InvalidGrantError('Código no válido');
    return c.params.codeChallenge;
  },
  async exchangeAuthorizationCode(client, code) {
    const c = codes.get(code);
    codes.delete(code);
    if (!c || c.clientId !== client.client_id || Date.now() - c.created > 5 * 60 * 1000) throw new InvalidGrantError('Código no válido o caducado');
    return issueTokens(client.client_id, c.params.scopes || []);
  },
  async exchangeRefreshToken(client, refreshToken) {
    const key = sha256(refreshToken);
    const r = state.refresh[key];
    if (!r || r.clientId !== client.client_id || r.exp < now()) throw new InvalidGrantError('Refresh token no válido');
    delete state.refresh[key]; // rotación
    return issueTokens(client.client_id, r.scopes);
  },
  async verifyAccessToken(token) {
    const a = state.access[sha256(token)];
    if (!a || a.exp < now()) throw new Error('Token no válido o caducado');
    return { token, clientId: a.clientId, scopes: a.scopes, expiresAt: a.exp };
  },
  async revokeToken(_client, { token }) {
    delete state.access[sha256(token)];
    delete state.refresh[sha256(token)];
    saveState();
  },
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function loginPage(id, error = '') {
  const setup = !state.password;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orozco Import · Acceso de Claude</title>
<style>body{font-family:system-ui,sans-serif;background:#0F172A;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
form{background:#fff;color:#0F172A;padding:28px;border-radius:12px;width:100%;max-width:360px;box-sizing:border-box}
h1{font-size:18px;margin:0 0 6px}p{color:#64748B;font-size:14px;margin:0 0 18px}label{display:block;font-size:13px;margin:12px 0 4px}
input{width:100%;padding:10px;border:1px solid #CBD5E1;border-radius:8px;font-size:16px;box-sizing:border-box}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:8px;background:#2563EB;color:#fff;font-size:16px;cursor:pointer}
.err{color:#B91C1C;font-size:14px;margin-top:10px}</style></head><body>
<form method="post" action="/login"><h1>Acceso de Claude al servidor</h1>
<p>${setup ? 'Primera vez: escribe el código que mostró la instalación y elige una contraseña.' : 'Introduce la contraseña para autorizar a Claude.'}</p>
<input type="hidden" name="id" value="${esc(id)}">
${setup ? '<label>Código de instalación</label><input name="code" autocomplete="off" required>' : ''}
<label>Contraseña</label><input type="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required ${setup ? 'minlength="12"' : ''}>
${setup ? '<label>Repite la contraseña</label><input type="password" name="password2" autocomplete="new-password" required minlength="12">' : ''}
<button>${setup ? 'Guardar y autorizar' : 'Autorizar'}</button>
${error ? `<div class="err">${esc(error)}</div>` : ''}</form></body></html>`;
}

// ---------------------------------------------------------------- utilidades de archivos
function resolveSafe(rel, { mustExist = false } = {}) {
  if (typeof rel !== 'string') throw new Error('Ruta no válida');
  const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.split('/').some((p) => p === '..')) throw new Error('No se permite ".." en las rutas');
  const abs = path.resolve(SITES_ROOT, clean);
  if (abs !== SITES_ROOT && !abs.startsWith(SITES_ROOT + path.sep)) throw new Error('Ruta fuera de /srv/sites');
  // Comprueba enlaces simbólicos: el antecesor existente más cercano debe seguir dentro
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (real !== SITES_ROOT && !real.startsWith(SITES_ROOT + path.sep)) throw new Error('Ruta fuera de /srv/sites (enlace simbólico)');
  if (mustExist && !fs.existsSync(abs)) throw new Error(`No existe: ${clean}`);
  return { abs, rel: clean };
}

async function fileSha(abs) { return sha256(await fsp.readFile(abs)); }

function looksBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

async function audit(entry) {
  await fsp.appendFile(AUDIT_FILE, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
}

async function saveVersion(rel, abs) {
  if (!fs.existsSync(abs) || !(await fsp.stat(abs)).isFile()) return null;
  const buf = await fsp.readFile(abs);
  const dir = path.join(HISTORY_DIR, rel);
  await fsp.mkdir(dir, { recursive: true });
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}_${sha256(buf).slice(0, 12)}`;
  await fsp.writeFile(path.join(dir, id), buf);
  const all = (await fsp.readdir(dir)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_VERSIONS))) await fsp.rm(path.join(dir, old));
  return id;
}

async function guardExisting(abs, rel, baseSha) {
  if (!fs.existsSync(abs)) return null;
  const st = await fsp.stat(abs);
  if (!st.isFile()) throw new Error(`${rel} es una carpeta`);
  const current = await fileSha(abs);
  if (!baseSha) throw new Error(`${rel} ya existe. Léelo o pide su sha256 y pásalo en base_sha256 para sobrescribirlo (sha actual: ${current}).`);
  if (baseSha !== current) throw new Error(`${rel} ha cambiado desde que lo leíste (sha actual ${current}, esperado ${baseSha}). Revísalo antes de sobrescribir.`);
  return current;
}

async function atomicWrite(abs, buf) {
  await fsp.mkdir(path.dirname(abs), { recursive: true, mode: 0o755 });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, buf, { mode: 0o644 });
  await fsp.rename(tmp, abs);
}

const ok = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
const wrap = (fn) => async (args) => {
  try { return await fn(args); }
  catch (e) { return { isError: true, content: [{ type: 'text', text: `Error: ${e.message}` }] }; }
};
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const RW = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

// ---------------------------------------------------------------- herramientas MCP
function buildServer() {
  const server = new McpServer({ name: 'orozco-servidor', version: '1.0.0' });
  const P = z.string().describe('Ruta relativa a /srv/sites, p. ej. "pre.orozcoimport.es/index.html"');
  const SHA = z.string().regex(/^[a-f0-9]{64}$/).optional().describe('sha256 de la versión actual del archivo (obligatorio si ya existe)');

  server.registerTool('listar', {
    title: 'Listar archivos', annotations: RO,
    description: 'Lista archivos y carpetas dentro de /srv/sites. Cada sitio es una carpeta con el nombre de su dominio.',
    inputSchema: { ruta: P.default(''), recursivo: z.boolean().default(false) },
  }, wrap(async ({ ruta, recursivo }) => {
    const { abs, rel } = resolveSafe(ruta, { mustExist: true });
    const out = [];
    async function walk(dir, prefix, depth) {
      for (const ent of (await fsp.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (out.length >= 2000) return;
        const p = path.join(dir, ent.name);
        const r = prefix ? `${prefix}/${ent.name}` : ent.name;
        if (ent.isDirectory()) { out.push({ ruta: r + '/', tipo: 'carpeta' }); if (recursivo && depth < 12) await walk(p, r, depth + 1); }
        else if (ent.isFile()) { const st = await fsp.stat(p); out.push({ ruta: r, bytes: st.size, modificado: st.mtime.toISOString() }); }
      }
    }
    await walk(abs, rel, 0);
    return ok({ total: out.length, recortado: out.length >= 2000, archivos: out });
  }));

  server.registerTool('leer', {
    title: 'Leer archivo', annotations: RO,
    description: 'Lee un archivo de texto (hasta 2 MB) y devuelve su contenido y su sha256. Para binarios devuelve solo tamaño y sha256.',
    inputSchema: { ruta: P },
  }, wrap(async ({ ruta }) => {
    const { abs, rel } = resolveSafe(ruta, { mustExist: true });
    const buf = await fsp.readFile(abs);
    const meta = { ruta: rel, bytes: buf.length, sha256: sha256(buf) };
    if (looksBinary(buf)) return ok({ ...meta, binario: true });
    if (buf.length > MAX_READ) return ok({ ...meta, aviso: 'Archivo demasiado grande para leerlo entero' });
    return { content: [{ type: 'text', text: JSON.stringify(meta) }, { type: 'text', text: buf.toString('utf8') }] };
  }));

  server.registerTool('huellas', {
    title: 'Comprobar sha256', annotations: RO,
    description: 'Devuelve el sha256 y el tamaño de uno o varios archivos, para verificar publicaciones contra GitHub.',
    inputSchema: { rutas: z.array(P).min(1).max(200) },
  }, wrap(async ({ rutas }) => {
    const res = [];
    for (const r of rutas) {
      try { const { abs, rel } = resolveSafe(r, { mustExist: true }); const b = await fsp.readFile(abs); res.push({ ruta: rel, bytes: b.length, sha256: sha256(b) }); }
      catch (e) { res.push({ ruta: r, error: e.message }); }
    }
    return ok(res);
  }));

  server.registerTool('escribir', {
    title: 'Escribir archivo', annotations: RW,
    description: 'Crea o sobrescribe un archivo. Si ya existe hay que pasar base_sha256 (el de la versión que leíste); la versión anterior se guarda en el historial. contenido_base64 sirve para binarios pequeños.',
    inputSchema: { ruta: P, contenido: z.string().optional(), contenido_base64: z.string().optional(), base_sha256: SHA },
  }, wrap(async ({ ruta, contenido, contenido_base64, base_sha256 }) => {
    const { abs, rel } = resolveSafe(ruta);
    if ((contenido === undefined) === (contenido_base64 === undefined)) throw new Error('Pasa contenido o contenido_base64 (uno de los dos)');
    const buf = contenido !== undefined ? Buffer.from(contenido, 'utf8') : Buffer.from(contenido_base64, 'base64');
    if (buf.length > MAX_WRITE) throw new Error('Demasiado grande: usa descargar_url para archivos grandes');
    const before = await guardExisting(abs, rel, base_sha256);
    const version = await saveVersion(rel, abs);
    await atomicWrite(abs, buf);
    const after = sha256(buf);
    await audit({ op: 'escribir', ruta: rel, antes: before, despues: after, version });
    return ok({ ruta: rel, bytes: buf.length, sha256: after, version_anterior: version });
  }));

  server.registerTool('reemplazar', {
    title: 'Reemplazar fragmento', annotations: RW,
    description: 'Sustituye un fragmento exacto de texto en un archivo. Por defecto el fragmento debe aparecer una sola vez. Exige base_sha256.',
    inputSchema: { ruta: P, buscar: z.string().min(1), reemplazar_por: z.string(), todas: z.boolean().default(false), base_sha256: z.string().regex(/^[a-f0-9]{64}$/) },
  }, wrap(async ({ ruta, buscar, reemplazar_por, todas, base_sha256 }) => {
    const { abs, rel } = resolveSafe(ruta, { mustExist: true });
    const before = await guardExisting(abs, rel, base_sha256);
    const text = await fsp.readFile(abs, 'utf8');
    const count = text.split(buscar).length - 1;
    if (count === 0) throw new Error('El fragmento no aparece en el archivo');
    if (count > 1 && !todas) throw new Error(`El fragmento aparece ${count} veces; amplíalo para que sea único o usa todas=true`);
    const out = todas ? text.split(buscar).join(reemplazar_por) : text.replace(buscar, () => reemplazar_por);
    const version = await saveVersion(rel, abs);
    await atomicWrite(abs, Buffer.from(out, 'utf8'));
    const after = sha256(Buffer.from(out, 'utf8'));
    await audit({ op: 'reemplazar', ruta: rel, antes: before, despues: after, version, ocurrencias: count });
    return ok({ ruta: rel, ocurrencias: count, sha256: after, version_anterior: version });
  }));

  server.registerTool('anadir_al_final', {
    title: 'Añadir al final', annotations: RW,
    description: 'Añade texto al final de un archivo (lo crea si no existe). Si existe, exige base_sha256.',
    inputSchema: { ruta: P, texto: z.string(), base_sha256: SHA },
  }, wrap(async ({ ruta, texto, base_sha256 }) => {
    const { abs, rel } = resolveSafe(ruta);
    const before = await guardExisting(abs, rel, base_sha256);
    const prev = before ? await fsp.readFile(abs) : Buffer.alloc(0);
    const buf = Buffer.concat([prev, Buffer.from(texto, 'utf8')]);
    const version = await saveVersion(rel, abs);
    await atomicWrite(abs, buf);
    await audit({ op: 'anadir', ruta: rel, antes: before, despues: sha256(buf), version });
    return ok({ ruta: rel, bytes: buf.length, sha256: sha256(buf) });
  }));

  server.registerTool('mover', {
    title: 'Mover o renombrar', annotations: RW,
    description: 'Mueve o renombra un archivo o carpeta. El destino no puede existir.',
    inputSchema: { origen: P, destino: P },
  }, wrap(async ({ origen, destino }) => {
    const a = resolveSafe(origen, { mustExist: true });
    const b = resolveSafe(destino);
    if (a.abs === SITES_ROOT) throw new Error('No se puede mover la raíz');
    if (fs.existsSync(b.abs)) throw new Error(`El destino ya existe: ${b.rel}`);
    await fsp.mkdir(path.dirname(b.abs), { recursive: true, mode: 0o755 });
    await fsp.rename(a.abs, b.abs);
    await audit({ op: 'mover', de: a.rel, a: b.rel });
    return ok({ movido: a.rel, a: b.rel });
  }));

  server.registerTool('borrar', {
    title: 'Borrar', annotations: RW,
    description: 'Borra un archivo (guardando su versión en el historial, exige base_sha256) o una carpeta vacía.',
    inputSchema: { ruta: P, base_sha256: SHA },
  }, wrap(async ({ ruta, base_sha256 }) => {
    const { abs, rel } = resolveSafe(ruta, { mustExist: true });
    if (abs === SITES_ROOT) throw new Error('No se puede borrar la raíz');
    const st = await fsp.stat(abs);
    if (st.isDirectory()) {
      if ((await fsp.readdir(abs)).length) throw new Error('La carpeta no está vacía; borra antes su contenido');
      await fsp.rmdir(abs);
      await audit({ op: 'borrar_carpeta', ruta: rel });
      return ok({ borrado: rel + '/' });
    }
    const before = await guardExisting(abs, rel, base_sha256);
    const version = await saveVersion(rel, abs);
    await fsp.rm(abs);
    await audit({ op: 'borrar', ruta: rel, antes: before, version });
    return ok({ borrado: rel, version_guardada: version });
  }));

  server.registerTool('descargar_url', {
    title: 'Descargar desde URL', annotations: { ...RW, openWorldHint: true },
    description: 'Descarga un archivo por HTTPS (p. ej. raw.githubusercontent.com/<repo>/<commit>/<ruta>) y lo guarda en la ruta indicada. Si el destino existe, exige base_sha256. Opcionalmente verifica sha256_esperado.',
    inputSchema: { url: z.string().url(), ruta: P, base_sha256: SHA, sha256_esperado: z.string().regex(/^[a-f0-9]{64}$/).optional() },
  }, wrap(async ({ url, ruta, base_sha256, sha256_esperado }) => {
    if (!/^https:\/\//i.test(url)) throw new Error('Solo se permiten URLs https');
    const { abs, rel } = resolveSafe(ruta);
    const before = await guardExisting(abs, rel, base_sha256);
    const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!resp.ok) throw new Error(`La descarga respondió ${resp.status}`);
    const len = Number(resp.headers.get('content-length') || 0);
    if (len > MAX_DOWNLOAD) throw new Error('Archivo demasiado grande');
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD) throw new Error('Archivo demasiado grande');
    const got = sha256(buf);
    if (sha256_esperado && got !== sha256_esperado) throw new Error(`sha256 no coincide: recibido ${got}, esperado ${sha256_esperado}`);
    const version = await saveVersion(rel, abs);
    await atomicWrite(abs, buf);
    await audit({ op: 'descargar', ruta: rel, url, antes: before, despues: got, version });
    return ok({ ruta: rel, bytes: buf.length, sha256: got, version_anterior: version });
  }));

  server.registerTool('historial', {
    title: 'Ver versiones anteriores', annotations: RO,
    description: 'Lista las versiones guardadas de un archivo (las 30 más recientes), de la más nueva a la más antigua.',
    inputSchema: { ruta: P },
  }, wrap(async ({ ruta }) => {
    const { rel } = resolveSafe(ruta);
    const dir = path.join(HISTORY_DIR, rel);
    if (!fs.existsSync(dir)) return ok({ ruta: rel, versiones: [] });
    const vs = [];
    for (const id of (await fsp.readdir(dir)).sort().reverse()) vs.push({ version: id, bytes: (await fsp.stat(path.join(dir, id))).size });
    return ok({ ruta: rel, versiones: vs });
  }));

  server.registerTool('restaurar', {
    title: 'Restaurar versión', annotations: RW,
    description: 'Restaura una versión del historial. La versión actual (si existe) se guarda antes en el historial. Si el archivo existe, exige base_sha256.',
    inputSchema: { ruta: P, version: z.string().regex(/^[\w.-]+$/), base_sha256: SHA },
  }, wrap(async ({ ruta, version, base_sha256 }) => {
    const { abs, rel } = resolveSafe(ruta);
    const src = path.join(HISTORY_DIR, rel, version);
    if (!fs.existsSync(src)) throw new Error('Esa versión no existe; usa historial para ver las disponibles');
    const before = await guardExisting(abs, rel, base_sha256);
    const saved = await saveVersion(rel, abs);
    const buf = await fsp.readFile(src);
    await atomicWrite(abs, buf);
    await audit({ op: 'restaurar', ruta: rel, version, antes: before, despues: sha256(buf), guardada: saved });
    return ok({ ruta: rel, restaurada: version, sha256: sha256(buf), version_previa_guardada: saved });
  }));

  return server;
}

// ---------------------------------------------------------------- aplicación HTTP
const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

const mcpUrl = new URL(`${PUBLIC_URL}/mcp`);
app.use(mcpAuthRouter({
  provider,
  issuerUrl: new URL(PUBLIC_URL),
  resourceServerUrl: mcpUrl,
  resourceName: 'Servidor de Orozco Import',
  scopesSupported: ['archivos'],
}));

app.post('/login', express.urlencoded({ extended: false, limit: '10kb' }), async (req, res) => {
  const { id, password = '', password2 = '', code = '' } = req.body || {};
  const p = pending.get(id);
  if (!p || Date.now() - p.created > 10 * 60 * 1000) {
    return res.status(400).type('html').send('<p>La solicitud ha caducado. Vuelve a Claude y pulsa «Conectar» otra vez.</p>');
  }
  if (lockedOut()) return res.status(429).type('html').send(loginPage(id, 'Demasiados intentos fallidos. Espera 15 minutos.'));

  if (!state.password) {
    const expected = readSetupCode();
    if (!expected || code.trim().toLowerCase() !== expected) { failures.push(Date.now()); return res.type('html').send(loginPage(id, 'Código de instalación incorrecto.')); }
    if (password.length < 12) return res.type('html').send(loginPage(id, 'La contraseña debe tener al menos 12 caracteres.'));
    if (password !== password2) return res.type('html').send(loginPage(id, 'Las contraseñas no coinciden.'));
    state.password = hashPassword(password);
    saveState();
    try { fs.rmSync(SETUP_FILE); } catch { /* ya no existe */ }
    await audit({ op: 'contrasena_creada' });
  } else if (!checkPassword(password)) {
    failures.push(Date.now());
    await audit({ op: 'login_fallido', ip: req.ip });
    return res.type('html').send(loginPage(id, 'Contraseña incorrecta.'));
  }

  pending.delete(id);
  const authCode = randomToken();
  codes.set(authCode, { clientId: p.client.client_id, params: p.params, created: Date.now() });
  await audit({ op: 'autorizado', cliente: p.client.client_name || p.client.client_id, ip: req.ip });
  const target = new URL(p.params.redirectUri);
  target.searchParams.set('code', authCode);
  if (p.params.state !== undefined) target.searchParams.set('state', p.params.state);
  res.redirect(target.toString());
});

const auth = requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });

app.post('/mcp', auth, express.json({ limit: '12mb' }), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('Error MCP:', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null });
  }
});
app.all('/mcp', auth, (_req, res) => res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null }));
app.get('/', (_req, res) => res.type('text').send('Servidor MCP de Orozco Import'));
app.get('/salud', (_req, res) => res.json({ ok: true, contrasena_creada: Boolean(state.password) }));

setInterval(() => {
  const t = Date.now();
  for (const [k, v] of pending) if (t - v.created > 10 * 60 * 1000) pending.delete(k);
  for (const [k, v] of codes) if (t - v.created > 5 * 60 * 1000) codes.delete(k);
}, 60 * 1000).unref();

app.listen(PORT, '127.0.0.1', () => console.log(`MCP escuchando en 127.0.0.1:${PORT} (${PUBLIC_URL})`));
