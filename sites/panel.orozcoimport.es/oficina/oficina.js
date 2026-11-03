/* Oficina 3D · Orozco Import
   Página independiente. Solo lectura sobre public.agentes_estado (nunca escribe). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const CFG = { url: 'https://lhtequkigdilfldnugco.supabase.co', ref: 'lhtequkigdilfldnugco' };
const AUTH_KEY = `sb-${CFG.ref}-auth-token`;   // misma clave de localStorage que usa el panel
const PANEL_URL = 'https://panel.orozcoimport.es/';
const $ = (id) => document.getElementById(id);
const IS_MOBILE = matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) < 600;

/* ───────── Datos de dominio ───────── */
const ESTADOS = {
  trabajando: { color: '#22C55E', one: 'trabajando', many: 'trabajando', label: 'Trabajando' },
  libre:      { color: '#94A3B8', one: 'libre', many: 'libres', label: 'Libre' },
  esperando:  { color: '#F59E0B', one: 'esperando', many: 'esperando', label: 'Esperando' },
  bloqueado:  { color: '#EF4444', one: 'bloqueado', many: 'bloqueados', label: 'Bloqueado' },
};
const OFFLINE = { color: '#64748B', label: 'Sin conexión' };

const SLOTS = [[-1.65, -0.9], [1.65, -0.9], [-1.65, 1.85], [1.65, 1.85]];
const SLOTS_DIR = [[-1.65, -0.9], [1.65, -0.9], [-1.65, 1.85]];
const SLOTS_GEN = SLOTS.slice(0, 3);                    // el 4.º puesto choca con el sofá
const SLOTS_NARROW = [[0, -0.9], [0, 1.85]];            // zonas estrechas: puestos en columna
/* Zonas: x/z = centro, w = ancho (el fondo ZONE_D es común), slots = puestos libres de la zona */
const AREAS = {
  'Ventas':         { x: -6.9, z: -3.25, w: 6.4, color: '#3B82F6', slots: SLOTS },
  'Operaciones':    { x: -1.2, z: -3.25, w: 4.2, color: '#14B8A6', slots: SLOTS_NARROW },
  'Administración': { x:  3.4, z: -3.25, w: 4.2, color: '#D4B57A', slots: SLOTS_NARROW },
  'Tecnología':     { x:  8.0, z: -3.25, w: 4.2, color: '#A855F7', slots: SLOTS_NARROW },
  'Dirección':      { x: -6.9, z:  3.25, w: 6.4, color: '#7C83F5', slots: SLOTS_DIR },
  'Marketing':      { x:  0.0, z:  3.25, w: 6.4, color: '#FF6B35', slots: SLOTS },
  'General':        { x:  6.9, z:  3.25, w: 6.4, color: '#8CA0B8', slots: SLOTS_GEN },
};
const ZONE_D = 6.0;
/* Personas del equipo: sin fila de estado, solo nombre y cargo */
const HUMANS = [
  { agente: 'fran', nombre: 'Fran', rol: 'Gerente', area: 'Dirección', human: true, shirt: '#27324A' },
  { agente: 'javi', nombre: 'Javi', rol: 'Marketing', area: 'Dirección', human: true, shirt: '#C2573A' },
];

const ROSTER = [
  { agente: 'pip', nombre: 'Pip', area: 'General' },
  { agente: 'setter', nombre: 'Setter', area: 'Ventas' },
  { agente: 'especialista', nombre: 'Especialista', area: 'Ventas' },
  { agente: 'gestion', nombre: 'Gestión de procesos', area: 'Operaciones' },
  { agente: 'contabilidad', nombre: 'Contabilidad', area: 'Administración' },
  { agente: 'analista', nombre: 'Analista de marketing', area: 'Marketing' },
  { agente: 'operador', nombre: 'Operador de campañas', area: 'Marketing' },
  { agente: 'web', nombre: 'Web y landings', area: 'Marketing' },
  { agente: 'partner', nombre: 'Partner de crecimiento', area: 'Dirección' },
  { agente: 'tecnologia', nombre: 'Tecnología', area: 'Tecnología' },
];

/* ───────── Estado de la aplicación ───────── */
const real = new Map();      // agente -> {estado, detalle, actualizado(ms), nombre, area, offline}
const demoData = new Map();
let demoOn = false;
let hasSession = false;
let lastUpdate = null;       // Date de la última lectura correcta
let noAccess = false;
let fetchError = false;
const agents = new Map();    // agente -> objeto de escena
let selected = null;
let hoverKey = null;

function view(key) { return (demoOn ? demoData : real).get(key); }

/* ───────── Utilidades ───────── */
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function hace(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
const hhmmss = (d) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, tgt, dt, k = 6) => cur + (tgt - cur) * (1 - Math.exp(-dt * k));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ───────── Render básico ───────── */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  $('fallback').hidden = false;
  throw e;
}
let pixelRatio = Math.min(devicePixelRatio || 1, IS_MOBILE ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('stage').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.8;
controls.minDistance = 5;
controls.maxDistance = 95;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.zoomToCursor = false;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const PAN_LIMIT = { x: 12, z: 8, y0: 0, y1: 3 };

function defaultView() {
  const aspect = camera.aspect;
  let dist = 35;
  if (aspect < 1.55) dist = 35 * Math.pow(1.55 / aspect, 0.82);
  dist = Math.min(dist, 82);
  // en vertical (móvil) se mira desde un lateral para que el eje largo use la altura de la pantalla
  const portrait = aspect < 0.9;
  if (portrait) dist = clamp(34 / aspect, 58, 90);
  const dir = (portrait ? new THREE.Vector3(0.95, 0.85, 0.1) : new THREE.Vector3(0.52, 0.6, 0.62)).normalize();
  const tg = new THREE.Vector3(0, 0, portrait ? -0.6 : 0.3);
  return { pos: dir.multiplyScalar(dist).add(tg), target: tg };
}

/* ───────── Luces ───────── */
scene.add(new THREE.HemisphereLight(0xe6eeff, 0xc9b99b, 1.55));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-12, 26, 18);
sun.castShadow = true;
const SM = IS_MOBILE ? 1024 : 2048;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 22, bottom: -22, near: 5, far: 80 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9db8ff, 0.6);
fill.position.set(18, 10, -8);
scene.add(fill);

/* ───────── Materiales / helpers de geometría ───────── */
const matCache = new Map();
function mat(color, rough = 0.78, metal = 0) {
  const k = color + rough + metal;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(k);
}
function box(w, h, d, m, x = 0, y = 0, z = 0, cast = true, receive = true) {
  const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  me.position.set(x, y, z); me.castShadow = cast; me.receiveShadow = receive; return me;
}
function rrect(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function flatShape(w, d, r, m, y) {
  const g = new THREE.ShapeGeometry(rrect(w, d, r), 6); g.rotateX(-Math.PI / 2);
  const me = new THREE.Mesh(g, m); me.position.y = y; me.receiveShadow = true; return me;
}
const mix = (hex, to, t) => '#' + new THREE.Color(hex).lerp(new THREE.Color(to), t).getHexString();

/* ───────── Oficina: suelo, paredes, zonas ───────── */
const world = new THREE.Group();
scene.add(world);
const FW = 21.6, FD = 13.8;
const WALL_H = 4.0;
const wallsReg = [];   // 0 fondo, 1 izquierda, 2 frente, 3 derecha
function regWall(g, nx, nz) { g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); wallsReg.push({ g, nx, nz, k: 0, decor: [] }); }

function buildOffice() {
  // plinto + losa
  world.add(box(FW + 0.9, 0.5, FD + 0.9, mat('#1E293B', 0.9), 0, -0.55, 0, false, true));
  world.add(box(FW + 0.9, 0.04, FD + 0.9, mat('#D4B57A', 0.45, 0.35), 0, -0.29, 0, false, false));
  const slab = box(FW, 0.3, FD, mat('#EFEAE0', 0.92), 0, -0.15, 0, false, true);
  world.add(slab);

  // baldosas sutiles del suelo
  const grid = new THREE.GridHelper(Math.max(FW, FD), 26, 0xd9d2c4, 0xe3ddcf);
  grid.scale.set(FW / Math.max(FW, FD), 1, FD / Math.max(FW, FD));
  grid.position.y = 0.004; grid.material.transparent = true; grid.material.opacity = 0.5;
  world.add(grid);

  // paredes bajas (estilo corte isométrico)
  const wallM = mat('#E7E1D5', 0.9), capM = mat('#0F172A', 0.6), trimM = mat('#D4B57A', 0.4, 0.4);
  const H = WALL_H;
  const back = new THREE.Group();
  back.add(box(FW + 0.9, H, 0.3, wallM, 0, H / 2, 0));
  back.add(box(FW + 0.9, 0.12, 0.38, capM, 0, H + 0.06, 0));
  back.add(box(FW + 0.9, 0.05, 0.04, trimM, 0, 0.35, 0.17, false, false));
  back.position.z = -FD / 2 - 0.15; world.add(back); regWall(back, 0, -1);
  const left = new THREE.Group();
  left.add(box(0.3, H, FD + 0.9, wallM, 0, H / 2, 0));
  left.add(box(0.38, 0.12, FD + 0.9, capM, 0, H + 0.06, 0));
  left.add(box(0.04, 0.05, FD + 0.9, trimM, 0.17, 0.35, 0, false, false));
  left.position.x = -FW / 2 - 0.15; world.add(left); regWall(left, -1, 0);
  const front = new THREE.Group();
  front.add(box(FW + 0.9, H, 0.3, wallM, 0, H / 2, 0));
  front.add(box(FW + 0.9, 0.12, 0.38, capM, 0, H + 0.06, 0));
  front.position.z = FD / 2 + 0.15; world.add(front); regWall(front, 0, 1);
  const right = new THREE.Group();
  right.add(box(0.3, H, FD + 0.9, wallM, 0, H / 2, 0));
  right.add(box(0.38, 0.12, FD + 0.9, capM, 0, H + 0.06, 0));
  right.position.x = FW / 2 + 0.15; world.add(right); regWall(right, 1, 0);

  // cartel con logo en la pared del fondo
  const plate = box(3.4, 1.0, 0.08, mat('#0F172A', 0.5), -5.2, 2.5, -FD / 2 + 0.04, false, true);
  const edge = box(3.5, 1.1, 0.04, trimM, -5.2, 2.5, -FD / 2 + 0.015, false, false);
  world.add(plate, edge); wallsReg[0].decor.push(plate, edge);
  new THREE.TextureLoader().load('/logo-blanco.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), m);
    p.position.set(-5.2, 2.5, -FD / 2 + 0.085); world.add(p); wallsReg[0].decor.push(p);
  });

  // cuadros en la pared izquierda
  const frameCols = ['#3B82F6', '#D4B57A', '#FF6B35'];
  [-4.2, 0, 4.2].forEach((z, i) => {
    const f = box(0.06, 0.8, 1.5, mat('#0F172A'), -FW / 2 + 0.04, 2.3, z, false, true);
    const c = box(0.04, 0.62, 1.32, mat(frameCols[i], 0.7), -FW / 2 + 0.075, 2.3, z, false, false);
    world.add(f, c); wallsReg[1].decor.push(f, c);
    if (i < 2) {   // ventanas entre los cuadros
      const wz = z + 2.1;
      const wf = box(0.07, 1.7, 1.5, mat('#0F172A'), -FW / 2 + 0.04, 2.5, wz, false, false);
      const wg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 1.3), new THREE.MeshBasicMaterial({ color: '#BFD9FF', toneMapped: false }));
      wg.position.set(-FW / 2 + 0.075, 2.5, wz);
      world.add(wf, wg); wallsReg[1].decor.push(wf, wg);
    }
  });

  // zonas (moqueta + borde + rótulo)
  for (const [name, a] of Object.entries(AREAS)) {
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z);
    g.add(flatShape(a.w + 0.16, ZONE_D + 0.16, 0.5, new THREE.MeshStandardMaterial({ color: mix(a.color, '#FFFFFF', 0.2), roughness: 0.9 }), 0.006));
    g.add(flatShape(a.w, ZONE_D, 0.45, new THREE.MeshStandardMaterial({ color: mix(a.color, '#F3EFE6', 0.8), roughness: 0.95 }), 0.012));
    const lab = floorLabel(name.toUpperCase(), a.color);
    lab.position.set(0, 0.03, -ZONE_D / 2 + 0.62); lab.scale.setScalar(Math.min(1, (a.w - 0.5) / (name.length * 0.36))); g.add(lab);
    world.add(g);
    // planta de esquina
    plant(g, a.w / 2 - 0.55, ZONE_D / 2 - 0.55, 0.9 + (hash(name) % 3) * 0.12);
  }
  // sofá en zona General + mesa auxiliar
  const gz = AREAS['General'];
  const sofa = new THREE.Group(); sofa.position.set(gz.x + 1.4, 0, gz.z + 2.35);
  sofa.add(box(2.4, 0.4, 0.9, mat('#334155'), 0, 0.25, 0));
  sofa.add(box(2.4, 0.55, 0.22, mat('#2B3A50'), 0, 0.6, 0.36));
  sofa.add(box(0.22, 0.55, 0.9, mat('#2B3A50'), -1.1, 0.5, 0));
  sofa.add(box(0.22, 0.55, 0.9, mat('#2B3A50'), 1.1, 0.5, 0));
  sofa.add(box(0.5, 0.3, 0.14, mat('#D4B57A'), -0.7, 0.62, 0.1));
  sofa.add(box(0.5, 0.3, 0.14, mat('#FF6B35'), 0.7, 0.62, 0.1));
  world.add(sofa);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), mat('#F2EFE9', 0.5));
  coffee.position.set(gz.x + 1.4, 0.34, gz.z + 1.35); coffee.castShadow = true; coffee.receiveShadow = true; world.add(coffee);
  const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), mat('#0F172A')); cl.position.set(gz.x + 1.4, 0.17, gz.z + 1.35); world.add(cl);
  // mesa de reuniones en Dirección
  const dz = AREAS['Dirección'];
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 28), mat('#C9B48C', 0.6));
  tb.position.set(dz.x + 1.5, 0.74, dz.z + 1.75); tb.castShadow = true; tb.receiveShadow = true; world.add(tb);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.72, 12), mat('#0F172A')); tl.position.set(dz.x + 1.5, 0.36, dz.z + 1.75); tl.castShadow = true; world.add(tl);
  // pared izquierda: estantería
  const shelf = new THREE.Group(); shelf.position.set(-FW / 2 + 0.4, 0, 5.6);
  shelf.add(box(0.5, 1.5, 2.0, mat('#CDBA94', 0.7), 0, 0.75, 0));
  [0.35, 0.8, 1.25].forEach((y, i) => { for (let k = 0; k < 4; k++) shelf.add(box(0.36, 0.3, 0.16, mat(['#2563EB', '#D4B57A', '#FF6B35', '#0F172A', '#14B8A6'][(i + k) % 5]), 0.06, y + 0.02, -0.75 + k * 0.5, false, false)); });
  world.add(shelf);
  buildBilling();
}

function plant(parent, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.22 * s, 0.4 * s, 10), mat('#F2EFE9', 0.6)); pot.position.y = 0.2 * s; pot.castShadow = true; pot.receiveShadow = true;
  g.add(pot);
  const leaf = mat('#3F8F5C', 0.8), leaf2 = mat('#5CB07A', 0.8);
  [[0, 0.75, 0, 0.36], [0.16, 0.58, 0.1, 0.24], [-0.15, 0.6, -0.08, 0.26], [0.02, 1.0, 0.05, 0.22]].forEach(([px, py, pz, r], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), i % 2 ? leaf2 : leaf);
    m.position.set(px * s, py * s, pz * s); m.castShadow = true; g.add(m);
  });
  parent.add(g);
}

function floorLabel(text, color) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '700 84px Geist, Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
    ctx.fillStyle = mix(color, '#0F172A', 0.25); ctx.globalAlpha = 0.85;
    ctx.fillText(text, 512, 84);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  draw();
  if (document.fonts && document.fonts.load) document.fonts.load('700 84px Geist').then(draw).catch(() => {});
  const m = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.875), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 1; return m;
}

/* ───────── Texturas compartidas ───────── */
/* ───── Panel de facturación (pantalla en la pared del fondo) ───── */
const BILL_W = 1600, BILL_H = 700, SCR_W = 7.2, SCR_H = SCR_W * BILL_H / BILL_W;
const SCR_POS = new THREE.Vector3(3.6, 2.5, -FD / 2);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const bill = { state: 'off', cur: 0, prev: 0, ops: 0, prevOps: 0, series: [], ts: null, sig: '' };
let billCtx = null, billTex = null, billMesh = null, billTs = 0, fontsReady = false;
function tzOffsetMin(t) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(new Date(t));
  const g = (k) => +p.find((x) => x.type === k).value;
  return (Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(t / 60000) * 60000) / 60000;
}
function madridYM(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', year: 'numeric', month: 'numeric' }).formatToParts(d);
  return { y: +p.find((x) => x.type === 'year').value, m: +p.find((x) => x.type === 'month').value - 1 };
}
function madridMonthStart(y, m) {   // instante UTC (ms) del día 1 a las 00:00 en Madrid
  const t0 = Date.UTC(y, m, 1); let t = t0;
  for (let i = 0; i < 2; i++) t = t0 - tzOffsetMin(t) * 60000;
  return t;
}
const eur = (v) => Math.round(v).toLocaleString('en-US').replace(/,/g, '.') + ' €';
/* Definición: facturación del mes = SUM(leads.facturacion) de los leads con estado = 'Proceso terminado'
   y fecha_terminado dentro del mes natural (Europe/Madrid). Operaciones = número de esos leads.
   Solo se piden dos columnas (facturacion, fecha_terminado): nada de datos personales. */
async function fetchBilling(force) {
  if (!sb || !hasSession) { bill.state = 'off'; return; }
  if (noAccess) { bill.state = 'na'; return; }
  if (!force && Date.now() - billTs < 270000) return;
  billTs = Date.now();
  if (bill.state === 'off') bill.state = 'loading';
  try {
    const { y, m } = madridYM(), base = y * 12 + m, starts = [];
    for (let i = -5; i <= 1; i++) starts.push(madridMonthStart(Math.floor((base + i) / 12), (base + i) % 12));
    const { data, error } = await sb.from('leads').select('facturacion,fecha_terminado').eq('estado', 'Proceso terminado')
      .gte('fecha_terminado', new Date(starts[0]).toISOString()).lt('fecha_terminado', new Date(starts[6]).toISOString());
    if (error) throw error;
    const sums = Array(6).fill(0), ops = Array(6).fill(0);
    for (const r of data || []) {
      const t = new Date(r.fecha_terminado).getTime();
      for (let i = 5; i >= 0; i--) if (t >= starts[i]) { sums[i] += Number(r.facturacion) || 0; ops[i]++; break; }
    }
    bill.series = sums.map((v, i) => ({ l: MESES[(base - 5 + i) % 12].slice(0, 3), v }));
    Object.assign(bill, { cur: sums[5], prev: sums[4], ops: ops[5], prevOps: ops[4], state: 'ok', ts: new Date().toISOString() });
  } catch (e) { bill.state = 'na'; console.warn('[oficina] facturación no disponible', e && e.message); }
}
function billView() {
  if (!demoOn) return bill;
  const { y, m } = madridYM(), base = y * 12 + m, vals = [9800, 12100, 14200, 11300, 15900, 18450];
  return { demo: true, state: 'ok', cur: 18450, prev: 15900, ops: 12, prevOps: 10, ts: null, series: vals.map((v, i) => ({ l: MESES[(base - 5 + i) % 12].slice(0, 3), v })) };
}
function drawBilling() {
  if (!billCtx) return;
  const v = billView(), ym = madridYM(), W = BILL_W, H = BILL_H, c = billCtx;
  const sig = JSON.stringify([v, ym.y, ym.m, fontsReady]);
  if (sig === bill.sig) return; bill.sig = sig;
  const F = (w, s, mono) => `${w} ${s}px ${mono ? "'JetBrains Mono', ui-monospace, monospace" : "Geist, Inter, system-ui, sans-serif"}`;
  const mes = MESES[ym.m], prevMes = MESES[(ym.m + 11) % 12], ok = v.state === 'ok';
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0F172A'); g.addColorStop(1, '#1B2742');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = '#D4B57A'; c.fillRect(0, 0, 16, H);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#F8FAFC'; c.font = F(600, 70); c.fillText('Facturación ' + mes, 70, 110);
  if (v.demo) {
    c.font = F(700, 40, true); const tw = c.measureText('DEMO').width + 44;
    c.fillStyle = '#FF6B35'; c.beginPath(); c.roundRect(70 + 0, 140, tw, 62, 16); c.fill();
    c.fillStyle = '#fff'; c.fillText('DEMO', 92, 185);
  }
  // importe
  let fs = 210; c.font = F(700, fs); const txt = ok ? eur(v.cur) : '—';
  while (c.measureText(txt).width > 960 && fs > 90) { fs -= 8; c.font = F(700, fs); }
  c.fillStyle = ok ? '#D4B57A' : '#64748B'; c.fillText(txt, 64, 400);
  // variación y mes anterior
  c.font = F(600, 54);
  if (ok) {
    if (v.prev > 0) {
      const d = Math.round((v.cur - v.prev) / v.prev * 100), up = d >= 0;
      c.fillStyle = up ? '#4ADE80' : '#F87171'; c.fillText((up ? '▲ +' : '▼ ') + d + ' % vs ' + prevMes, 70, 480);
    } else { c.fillStyle = '#94A3B8'; c.fillText('Sin mes anterior con que comparar', 70, 480); }
    c.fillStyle = '#94A3B8'; c.font = F(500, 42); c.fillText(prevMes[0].toUpperCase() + prevMes.slice(1) + ': ' + eur(v.prev) + ' · ' + v.prevOps + (v.prevOps === 1 ? ' operación' : ' operaciones'), 70, 545);
  } else {
    c.fillStyle = '#94A3B8'; c.fillText(v.state === 'loading' ? 'Cargando…' : (v.state === 'na' ? 'Sin acceso a los datos de facturación' : 'Inicia sesión en el panel para verlo'), 70, 480);
  }
  c.fillStyle = '#64748B'; c.font = F(500, 30);
  const ts = v.ts ? new Date(v.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
  c.fillText(v.demo ? 'Datos de demostración ficticios' : 'Facturación final de procesos terminados' + (ts ? ' · actualizado ' + ts : ''), 70, 650);
  // panel derecho: operaciones + barras
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.roundRect(1060, 50, 490, 600, 28); c.fill();
  c.fillStyle = '#94A3B8'; c.font = F(600, 34, true); c.fillText('OPERACIONES', 1100, 112);
  c.fillStyle = '#F8FAFC'; c.font = F(700, 140); c.fillText(ok ? String(v.ops) : '—', 1096, 250);
  c.fillStyle = '#94A3B8'; c.font = F(500, 34); c.fillText(ok ? prevMes + ': ' + v.prevOps : '', 1100, 300);
  if (ok && v.series && v.series.length) {
    const mx = Math.max(1, ...v.series.map((s) => s.v)), bw = 56, gap = 20, x0 = 1100, base = 590;
    v.series.forEach((s, i) => {
      const h = Math.max(4, (s.v / mx) * 190), x = x0 + i * (bw + gap);
      c.fillStyle = i === 5 ? '#D4B57A' : '#33507F'; c.beginPath(); c.roundRect(x, base - h, bw, h, 8); c.fill();
      c.fillStyle = '#94A3B8'; c.font = F(500, 26, true); c.textAlign = 'center'; c.fillText(s.l, x + bw / 2, base + 40);
    });
    c.textAlign = 'left';
  }
  billTex.needsUpdate = true;
}
function buildBilling() {
  const cv = document.createElement('canvas'); cv.width = BILL_W; cv.height = BILL_H; billCtx = cv.getContext('2d');
  billTex = new THREE.CanvasTexture(cv); billTex.colorSpace = THREE.SRGBColorSpace; billTex.anisotropy = 8;
  const zf = -FD / 2;
  const frame = box(SCR_W + 0.32, SCR_H + 0.32, 0.12, mat('#0F172A', 0.5), SCR_POS.x, SCR_POS.y, zf + 0.06, false, true);
  const gold = box(SCR_W + 0.44, SCR_H + 0.44, 0.04, mat('#D4B57A', 0.4, 0.4), SCR_POS.x, SCR_POS.y, zf + 0.02, false, false);
  billMesh = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ map: billTex, toneMapped: false }));
  billMesh.position.set(SCR_POS.x, SCR_POS.y, zf + 0.125);
  world.add(gold, frame, billMesh); wallsReg[0].decor.push(gold, frame, billMesh);
  drawBilling();
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 60px Geist'), document.fonts.load('600 30px Geist'), document.fonts.load('500 26px "JetBrains Mono"')]).then(() => { fontsReady = true; drawBilling(); }).catch(() => {});
}
function pickBill(cx, cy) {
  if (!billMesh || !billMesh.visible) return false;
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObject(billMesh, false).length > 0;
}
function focusBill() {
  select(null);
  const d = Math.max(9.5, 13.6 / camera.aspect), tgt = SCR_POS.clone(); tgt.z += 0.2;
  flyTo(tgt.clone().add(new THREE.Vector3(0.14, 0.12, 1).normalize().multiplyScalar(d)), tgt, 0.9);
}
const _wh = new THREE.Vector3();
function updateWalls(dt) {
  _wh.set(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z);
  const hl = _wh.length(); if (hl > 0.001) _wh.multiplyScalar(1 / hl);
  for (const w of wallsReg) {
    const facing = _wh.x * w.nx + _wh.z * w.nz;
    w.k = damp(w.k, clamp((facing + 0.05) * 4, 0, 1), dt, 7);
    const sy = 1 - 0.92 * w.k;
    if (Math.abs(w.g.scale.y - sy) > 0.001) w.g.scale.y = sy;
    const vis = w.k < 0.4;
    for (const d of w.decor) if (d.visible !== vis) d.visible = vis;
  }
}

function makeScreenTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d'); x.fillStyle = '#16233a'; x.fillRect(0, 0, 128, 256);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 6; y < 256; y += 10) {
    const indent = rnd() < 0.4 ? 12 : 0, len = 20 + rnd() * 80;
    x.fillStyle = rnd() < 0.15 ? '#ffffff' : '#9fb3cf'; x.fillRect(8 + indent, y, len, 4);
  }
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 0.5); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const screenTex = makeScreenTex();
function makeGlowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}
const glowTex = makeGlowTex();
function bubbleTex(ch, color) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(64, 60, 50, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.moveTo(50, 98); x.lineTo(64, 122); x.lineTo(78, 98); x.closePath(); x.fill();
  x.lineWidth = 8; x.strokeStyle = color; x.beginPath(); x.arc(64, 60, 46, 0, Math.PI * 2); x.stroke();
  x.fillStyle = color; x.font = '800 78px Geist, Inter, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 66);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const bubbleTexQ = bubbleTex('?', '#D97706');
const bubbleTexE = bubbleTex('!', '#DC2626');
const bubbleTexT = bubbleTex('…', '#2563EB');
if (document.fonts && document.fonts.load) document.fonts.load('800 78px Geist').then(() => { bubbleTexQ.image.getContext('2d'); }).catch(() => {});

/* ───────── Puesto de trabajo + avatar ───────── */
const SKINS = ['#F2C9A5', '#E3AD84', '#C98F66', '#9A6342', '#F6D9BD'];
const HAIRS = ['#2B2118', '#5A3A22', '#111827', '#A9741F', '#7C4A21', '#3B2F2F'];
const PANTS = '#1E293B';
const hitMeshes = [];

function buildStation(info, slotIdx, zoneName) {
  const zone = AREAS[zoneName] || AREAS['General'], area = zone;
  const slots = zone.slots;
  const [sx, sz] = slots[slotIdx % slots.length];
  const g = new THREE.Group(); g.position.set(zone.x + sx, 0, zone.z + sz); world.add(g);
  const h = hash(info.agente);

  // mesa
  const wood = mat('#DCCBA8', 0.62), dark = mat('#1E293B', 0.5, 0.2);
  g.add(box(1.9, 0.06, 0.8, wood, 0, 0.69, 0));
  g.add(box(0.06, 0.66, 0.7, dark, -0.88, 0.33, 0));
  g.add(box(0.06, 0.66, 0.7, dark, 0.88, 0.33, 0));
  g.add(box(1.7, 0.4, 0.04, dark, 0, 0.5, -0.33, true, true)); // panel trasero
  // detalles
  g.add(box(0.4, 0.016, 0.14, mat('#0F172A', 0.4), 0, 0.728, 0.12, false, true));        // teclado
  g.add(box(0.07, 0.02, 0.11, mat('#0F172A', 0.4), 0.38, 0.73, 0.14, false, true));      // ratón
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), mat(area.color, 0.5)); mug.position.set(-0.7, 0.78, 0.1); mug.castShadow = true; g.add(mug);
  g.add(box(0.28, 0.01, 0.2, mat('#F6F1E4', 0.9), -0.45, 0.724, 0.16, false, true));      // libreta

  // monitor
  const mon = new THREE.Group(); mon.position.set(0, 0.72, -0.2); g.add(mon);
  mon.add(box(0.26, 0.02, 0.16, dark, 0, 0.01, 0));
  mon.add(box(0.05, 0.2, 0.04, dark, 0, 0.11, 0));
  mon.add(box(0.7, 0.42, 0.035, mat('#0B1220', 0.4, 0.3), 0, 0.42, 0));
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: '#0b0f19', toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), screenMat); screen.position.set(0, 0.42, 0.0185); mon.add(screen);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ map: glowTex, color: '#22C55E', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.set(0, 0.42, 0.06); mon.add(glow);

  // silla
  const chair = new THREE.Group(); chair.position.set(0, 0, 0.7); g.add(chair);
  const cm = mat('#2B3A50', 0.7), ca = mat('#D4B57A', 0.4, 0.4);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), cm); seat.position.set(0, 0.42, 0); seat.castShadow = true; seat.receiveShadow = true; chair.add(seat);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), ca); stem.position.y = 0.22; chair.add(stem);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 5), cm); base.position.y = 0.04; base.castShadow = true; chair.add(base);
  const back = box(0.52, 0.56, 0.07, cm, 0, 0.8, 0.34); back.rotation.x = 0.12; chair.add(back);

  // avatar
  const skin = mat(SKINS[h % SKINS.length]).clone(), hairC = HAIRS[(h >>> 3) % HAIRS.length];
  const shirtBase = info.shirt || (info.agente === 'tecnologia' || info.area === 'Tecnología' ? '#1C2333' : area.color);
  const M = { skin, shirt: mat(shirtBase, 0.7).clone(), pants: mat(PANTS, 0.8).clone(), hair: mat(hairC, 0.85).clone(), acc: mat('#0F172A', 0.5).clone(), dark: mat('#111827', 0.5).clone() };
  const fadeMats = [M.skin, M.shirt, M.pants, M.hair, M.acc, M.dark];
  const av = new THREE.Group(); av.position.set(0, 0, 0.7); g.add(av);
  const hip = new THREE.Group(); hip.position.y = 0.55; av.add(hip);
  const mk = (geo, m, x, y, z, parent) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };
  // pelvis y piernas (no giran con el torso)
  mk(new THREE.BoxGeometry(0.4, 0.16, 0.34), M.pants, 0, 0.5, 0, av);
  const seatedLegs = new THREE.Group(); av.add(seatedLegs);
  for (const sx2 of [-0.1, 0.1]) {
    mk(new THREE.BoxGeometry(0.14, 0.14, 0.42), M.pants, sx2, 0.5, -0.2, seatedLegs);
    mk(new THREE.BoxGeometry(0.13, 0.46, 0.13), M.pants, sx2, 0.25, -0.4, seatedLegs);
    mk(new THREE.BoxGeometry(0.15, 0.07, 0.24), M.dark, sx2, 0.035, -0.45, seatedLegs);
  }
  // piernas de pie (se usan al caminar)
  const standLegs = new THREE.Group(); standLegs.visible = false; av.add(standLegs);
  for (const sx2 of [-0.1, 0.1]) {
    const lg = new THREE.Group(); lg.position.set(sx2, 0.5, 0); standLegs.add(lg);
    mk(new THREE.BoxGeometry(0.13, 0.7, 0.13), M.pants, 0, -0.35, 0, lg);
    mk(new THREE.BoxGeometry(0.15, 0.07, 0.24), M.dark, 0, -0.735, -0.05, lg);
  }
  // torso
  const torso = new THREE.Group(); hip.add(torso);
  mk(new THREE.CapsuleGeometry(0.19, 0.2, 3, 10), M.shirt, 0, 0.27, 0, torso);
  // cabeza
  const head = new THREE.Group(); head.position.set(0, 0.78, 0); torso.add(head);
  mk(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), M.skin, 0, -0.17, 0, head);
  mk(new THREE.SphereGeometry(0.185, 14, 12), M.skin, 0, 0, 0, head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair);
  hair.position.set(0, 0.015, 0.03); hair.castShadow = true; head.add(hair);
  const style = (h >>> 6) % 3;
  if (style === 1) mk(new THREE.BoxGeometry(0.34, 0.3, 0.1), M.hair, 0, -0.06, 0.15, head);
  if (style === 2) mk(new THREE.SphereGeometry(0.075, 8, 8), M.hair, 0, 0.22, 0.05, head);
  for (const ex of [-0.07, 0.07]) mk(new THREE.SphereGeometry(0.024, 8, 8), M.dark, ex, 0.02, -0.17, head);
  // accesorios por área
  if (info.human) { // rasgos más "humanos": nariz, cejas, boca y prenda propia
    const fran = info.agente === 'fran';
    mk(new THREE.SphereGeometry(0.03, 8, 8), M.skin, 0, -0.025, -0.19, head);
    for (const ex of [-0.07, 0.07]) mk(new THREE.BoxGeometry(0.07, 0.014, 0.02), M.hair, ex, 0.075, -0.18, head);
    mk(new THREE.BoxGeometry(0.09, 0.016, 0.02), mat('#8B4A45', 0.6), 0, -0.095, fran ? -0.172 : -0.2, head);
    if (fran) { // camisa blanca y corbata granate bajo la americana
      mk(new THREE.BoxGeometry(0.16, 0.34, 0.03), mat('#F4F1EA', 0.6).clone(), 0, 0.28, -0.19, torso);
      mk(new THREE.BoxGeometry(0.05, 0.28, 0.03), mat('#7A1F2B', 0.5).clone(), 0, 0.26, -0.205, torso);
    } else { // barba corta
      mk(new THREE.BoxGeometry(0.2, 0.09, 0.07), M.hair, 0, -0.115, -0.15, head);
    }
  } else if (info.agente === 'pip') { // gorra azul
    const capM = mat('#2563EB', 0.6).clone(); fadeMats.push(capM);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), capM); cap.position.y = 0.03; cap.castShadow = true; head.add(cap);
    mk(new THREE.BoxGeometry(0.2, 0.02, 0.14), capM, 0, 0.08, -0.26, head);
  } else if (info.agente === 'tecnologia' || info.area === 'Tecnología') { // sudadera oscura con capucha, cordones y bolsillo
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12, 3 * Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, 0, Math.PI * 0.64), M.shirt);
    hood.position.set(0, 0.0, 0.035); hood.castShadow = true; head.add(hood);
    mk(new THREE.BoxGeometry(0.3, 0.12, 0.1), M.shirt, 0, -0.17, 0.12, head);
    mk(new THREE.BoxGeometry(0.28, 0.1, 0.03), M.acc, 0, 0.08, -0.19, torso);
    for (const ex of [-0.045, 0.045]) mk(new THREE.BoxGeometry(0.014, 0.15, 0.012), mat('#E5E7EB', 0.6), ex, 0.36, -0.192, torso);
    for (const ex of [-0.07, 0.07]) mk(new THREE.BoxGeometry(0.1, 0.012, 0.02), M.dark, ex, 0.04, -0.2, head);   // gafas finas
  } else if (info.area === 'Ventas') { // auriculares
    const hm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 18, Math.PI), M.acc); hm.rotation.z = 0; hm.position.y = 0.02; head.add(hm);
    for (const ex of [-0.2, 0.2]) mk(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), M.acc, ex, 0.02, 0, head).rotation.z = Math.PI / 2;
  } else if (info.area === 'Administración') { // gafas
    for (const ex of [-0.075, 0.075]) { const gl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), M.acc); gl.position.set(ex, 0.025, -0.18); head.add(gl); }
  } else if (info.area === 'Dirección') { // corbata dorada
    const tie = mk(new THREE.BoxGeometry(0.07, 0.3, 0.03), mat('#D4B57A', 0.5).clone(), 0, 0.3, -0.19, torso); fadeMats.push(tie.material);
  }
  // brazos
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.25, 0.44, 0); torso.add(sh);
    mk(new THREE.BoxGeometry(0.1, 0.3, 0.1), M.shirt, 0, -0.14, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    mk(new THREE.BoxGeometry(0.085, 0.27, 0.085), M.skin, 0, -0.12, 0, el);
    mk(new THREE.SphereGeometry(0.052, 8, 8), M.skin, 0, -0.27, 0, el);
    arms.push({ sh, el, side });
  }

  // burbuja de conversación (…) sobre el avatar
  const talk = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexT, transparent: true, opacity: 0, depthWrite: false }));
  talk.position.set(0, 2.05, 0); talk.scale.set(0.01, 0.01, 1); av.add(talk);

  // burbuja de estado
  const bub = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexQ, transparent: true, opacity: 0, depthWrite: false }));
  bub.position.set(0, 1.92, 0.7); bub.scale.set(0.01, 0.01, 1); g.add(bub);

  // anillo de selección
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: '#D4B57A', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, 0.4); ring.visible = false; ring.renderOrder = 2; g.add(ring);

  // zona de clic (invisible)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.0, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, 1.0, 0.5); hit.userData.agente = info.agente; g.add(hit); hitMeshes.push(hit);

  // rack de servidores junto a la mesa de Tecnología (LEDs parpadeantes)
  let obst = [], leds = [];
  if (info.agente === 'tecnologia') {
    const rack = new THREE.Group(); rack.position.set(1.72, 0, -0.1); g.add(rack);
    const rk = mat('#1B2434', 0.5, 0.3), rkf = mat('#0B1220', 0.45, 0.3);
    rack.add(box(0.66, 1.72, 0.7, rk, 0, 0.86, 0));
    rack.add(box(0.7, 0.05, 0.74, mat('#0F172A', 0.5), 0, 1.745, 0));
    rack.add(box(0.7, 0.05, 0.74, mat('#0F172A', 0.5), 0, 0.025, 0));
    const ledCols = ['#22C55E', '#22C55E', '#F59E0B', '#38BDF8'];
    for (let u = 0; u < 6; u++) {
      const y = 0.22 + u * 0.26;
      rack.add(box(0.56, 0.2, 0.04, rkf, 0, y, 0.34, false, false));
      for (let k = 0; k < 3; k++) {
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: ledCols[(u + k) % ledCols.length], toneMapped: false }));
        led.position.set(-0.2 + k * 0.07, y + 0.03, 0.365); rack.add(led); leds.push({ m: led, ph: (u * 3 + k) * 1.7, r: 1.2 + ((u + k) % 3) * 0.9 });
      }
      rack.add(box(0.2, 0.012, 0.012, mat('#334155', 0.5), 0.14, y - 0.04, 0.362, false, false));   // ranura
    }
    const rh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.9), new THREE.MeshBasicMaterial({ visible: false }));
    rh.position.set(0, 0.95, 0); rh.userData.agente = info.agente; rack.add(rh); hitMeshes.push(rh);
    obst = [[1.72 - 0.42, 1.72 + 0.42, -0.1 - 0.45, -0.1 + 0.45]];   // relativo al puesto
  }

  const a = {
    zoneName, obst, leds, key: info.agente, group: g, hip, torso, head, arms, bub, ring, screenMat, glow, fadeMats, faded: false,
    anchor: new THREE.Vector3(g.position.x, 2.2, g.position.z + 0.7),
    focus: new THREE.Vector3(g.position.x, 1.0, g.position.z + 0.5),
    phase: (h % 628) / 100, human: !!info.human, role: info.rol,
    p: { lean: 0.22, headDown: 0, aS: 0.35, aE: 1.1, aZ: 0.1, mon: 0, type: 0, look: 0, bubble: 0, bubbleKind: 'q' },
    screenColor: new THREE.Color('#0b0f19'),
    tag: null, tagKey: '',
    av, chair, seatedLegs, standLegs, talk, stand: 0, yaw: 0, mv: 0, wph: 0, moving: false, talking: false, talkAmt: 0, q: [], job: null, chairSide: 1,
  };
  agents.set(info.agente, a);
  return a;
}

/* Colocación: cada agente ocupa el primer puesto libre de su zona. Si la zona es desconocida o
   está llena, va al primer puesto libre de otra zona (la que tenga más huecos), sin romper nada. */
const slotUsed = new Map();   // zona -> Set de puestos ocupados
function allocSlot(area) {
  const free = (z) => { const u = slotUsed.get(z) || new Set(); for (let i = 0; i < AREAS[z].slots.length; i++) if (!u.has(i)) return i; return -1; };
  const take = (z, i) => { if (!slotUsed.has(z)) slotUsed.set(z, new Set()); slotUsed.get(z).add(i); return [z, i]; };
  if (AREAS[area]) { const i = free(area); if (i >= 0) return take(area, i); }
  let best = null, bestFree = 0;
  for (const z of Object.keys(AREAS)) {
    const left = AREAS[z].slots.length - (slotUsed.get(z) || new Set()).size;
    if (left > bestFree) { best = z; bestFree = left; }
  }
  if (best) return take(best, free(best));
  console.warn('[oficina] sin puestos libres; se reutiliza uno');
  return ['General', slotUsed.size % AREAS['General'].slots.length];
}
function ensureAgent(info) {
  if (agents.has(info.agente)) return agents.get(info.agente);
  const label = info.area && String(info.area).trim() ? String(info.area) : 'General';
  const [zone, n] = allocSlot(label);
  const a = buildStation({ ...info, area: AREAS[label] ? label : zone }, n, zone);
  makeTag(a, { ...info, area: AREAS[label] ? label : (info.area ? label : zone) });
  return a;
}

/* ───────── Etiquetas HTML ───────── */
const tagsEl = $('tags');
function makeTag(a, info) {
  const el = document.createElement('div');
  el.className = 'tag s-offline';
  el.innerHTML = '<div class="tag-top"><i class="dot"></i><b></b></div><div class="tag-detalle"></div><div class="tag-time"></div>';
  el.querySelector('b').textContent = info.nombre;
  el.addEventListener('click', (e) => { e.stopPropagation(); select(a.key, true); });
  el.addEventListener('mouseenter', () => { hoverKey = a.key; });
  el.addEventListener('mouseleave', () => { if (hoverKey === a.key) hoverKey = null; });
  tagsEl.appendChild(el); a.tag = el; a.name = info.nombre; a.areaName = info.area;
  a.tagRefs = { top: el.querySelector('b'), det: el.querySelector('.tag-detalle'), time: el.querySelector('.tag-time') };
}

/* ───────── Aplicar estado a visuales ───────── */
function visualOf(key) {
  const v = view(key);
  if (!v || v.offline) return { st: 'offline', detalle: v && v.detalle, ts: null, faded: false, v };
  const st = ESTADOS[v.estado] ? v.estado : 'libre';
  return { st, detalle: v.detalle, ts: v.actualizado, faded: Date.now() - v.actualizado > 24 * 3600 * 1000, v };
}

function setFade(a, faded) {
  if (a.faded === faded) return; a.faded = faded;
  for (const m of a.fadeMats) { m.transparent = faded; m.opacity = faded ? 0.38 : 1; m.depthWrite = !faded; m.needsUpdate = true; }
}

function applyAll() {
  let counts = { trabajando: 0, libre: 0, esperando: 0, bloqueado: 0, offline: 0 };
  for (const a of agents.values()) {
    if (a.human) {
      a.vis = { st: 'human', detalle: a.role, ts: null, faded: false };
      const t0 = a.tag, r0 = a.tagRefs;
      if (!t0.classList.contains('s-human')) { t0.className = 'tag s-human'; a._c = null; }
      t0.classList.toggle('sel', selected === a.key);
      if (r0.det.textContent !== a.role) r0.det.textContent = a.role;
      continue;
    }
    const vis = visualOf(a.key); a.vis = vis; counts[vis.st]++;
    setFade(a, vis.faded);
    // nombre desde la BD si llega
    if (vis.v && vis.v.nombre && vis.v.nombre !== a.name) { a.name = vis.v.nombre; a.tagRefs.top.textContent = a.name; }
    const t = a.tag, r = a.tagRefs;
    t.className = t.className.replace(/\bs-\w+/g, '').trim() + ' s-' + vis.st;
    t.classList.toggle('faded', vis.faded);
    t.classList.toggle('sel', selected === a.key);
    const det = vis.st === 'offline' ? 'Sin conexión' : (vis.detalle || (vis.st === 'libre' ? 'Disponible' : ESTADOS[vis.st].label));
    if (r.det.textContent !== det) r.det.textContent = det;
    const tm = vis.ts ? hace(vis.ts) : '';
    if (r.time.textContent !== tm) r.time.textContent = tm;
  }
  renderCounts(counts);
  renderMeta();
  if (selected) fillCard();
}

function renderCounts(c) {
  const el = $('counts'); let h = '';
  for (const k of ['trabajando', 'libre', 'esperando', 'bloqueado']) {
    const n = c[k]; h += `<span class="chip ${n ? '' : 'zero'}" style="--c:${ESTADOS[k].color}"><i></i><b>${n}</b>${n === 1 ? ESTADOS[k].one : ESTADOS[k].many}</span>`;
  }
  if (c.offline) h += `<span class="chip" style="--c:${OFFLINE.color}"><i></i><b>${c.offline}</b>sin conexión</span>`;
  if (el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; }
}
function renderMeta() {
  let t;
  if (demoOn) t = 'Demo · ' + hhmmss(new Date());
  else if (!hasSession) t = 'Sin conexión';
  else if (lastUpdate) t = 'Actualizado ' + hhmmss(lastUpdate);
  else t = 'Cargando…';
  if ($('upd').textContent !== t) $('upd').textContent = t;
}

/* Poses objetivo por estado */
function poseFor(st) {
  switch (st) {
    case 'trabajando': return { lean: -0.12, headDown: 0.2, aS: 0.9, aE: 0.62, aZ: 0.02, mon: 1, type: 1, look: 0, bubble: 0 };
    case 'esperando':  return { lean: 0.02, headDown: 0.0, aS: 0.75, aE: 0.95, aZ: 0.06, mon: 0.4, type: 0, look: 1, bubble: 1, kind: 'q' };
    case 'bloqueado':  return { lean: -0.3, headDown: 0.45, aS: 0.95, aE: 2.15, aZ: -0.08, mon: 0.6, type: 0, look: 0, bubble: 1, kind: 'e' };
    default:           return { lean: 0.24, headDown: -0.08, aS: 0.3, aE: 1.15, aZ: 0.13, mon: 0, type: 0, look: 0.4, bubble: 0 };
  }
}
const SCREEN_COL = { trabajando: '#5BE08C', esperando: '#E7B04A', bloqueado: '#F25C5C', libre: '#0b0f19', offline: '#0b0f19' };
const GLOW_COL = { trabajando: '#22C55E', esperando: '#F59E0B', bloqueado: '#EF4444' };
const tmpC = new THREE.Color();

function animate(a, t, dt) {
  if (a.leds.length) for (const l of a.leds) l.m.visible = Math.sin(t * l.r + l.ph) > (a.vis && a.vis.st === 'trabajando' ? -0.6 : 0.2);
  const st = a.vis ? (a.vis.st === 'human' ? 'trabajando' : a.vis.st) : 'offline';
  const tg = poseFor(st === 'offline' ? 'libre' : st);
  if (a.human) { const w = Math.sin(t * 0.35 + a.phase) > -0.3 ? 1 : 0; tg.type = w; tg.look = 1 - w; tg.bubble = 0; }
  if (a.stand > 0.001) tg.bubble = 0;
  const p = a.p;
  for (const k of ['lean', 'headDown', 'aS', 'aE', 'aZ', 'mon', 'type', 'look']) p[k] = damp(p[k], tg[k], dt, 5);
  p.bubble = damp(p.bubble, tg.bubble, dt, 6);
  if (tg.kind) p.bubbleKind = tg.kind;

  const ph = t + a.phase;
  // torso respira / balanceo
  a.torso.rotation.x = p.lean + Math.sin(ph * 1.6) * (0.012 + 0.02 * p.look * (st === 'libre' || st === 'offline' ? 1 : 0)) + Math.sin(ph * 9) * 0.01 * p.type;
  a.torso.rotation.y = Math.sin(ph * 0.7) * 0.09 * p.look * (st === 'esperando' ? 1.2 : 0.5);
  a.head.rotation.x = -p.headDown + Math.sin(ph * 3.1) * 0.035 * p.type;
  a.head.rotation.y = Math.sin(ph * 0.9) * 0.55 * p.look * (st === 'esperando' ? 1 : 0.25);
  a.head.rotation.z = st === 'libre' || st === 'offline' ? Math.sin(ph * 0.5) * 0.06 : 0;
  // brazos
  for (const arm of a.arms) {
    const s = arm.side, off = s > 0 ? 0 : Math.PI;
    arm.sh.rotation.x = p.aS + Math.sin(ph * 15 + off) * 0.05 * p.type;
    arm.sh.rotation.z = s * p.aZ;
    arm.el.rotation.x = p.aE + Math.sin(ph * 19 + off * 0.7) * 0.14 * p.type + (st === 'esperando' ? Math.max(0, Math.sin(ph * 4 + off)) * 0.06 : 0);
    arm.el.rotation.z = st === 'bloqueado' ? -s * 0.25 : 0;
  }
  // monitor
  const onStrength = p.mon;
  tmpC.set(a.human ? '#6FA8FF' : (SCREEN_COL[st] || SCREEN_COL.libre));
  a.screenColor.lerp(tmpC, 1 - Math.exp(-dt * 6));
  const pulse = st === 'trabajando' ? 0.9 + Math.sin(ph * 3) * 0.1 : st === 'bloqueado' ? 0.75 + Math.sin(ph * 6) * 0.25 : 0.8;
  a.screenMat.color.copy(a.screenColor).multiplyScalar(pulse);
  if (a.human) a.glow.material.color.set('#3B82F6'); else if (GLOW_COL[st]) a.glow.material.color.set(GLOW_COL[st]);
  a.glow.material.opacity = onStrength * (0.2 + (st === 'trabajando' ? Math.sin(ph * 3) * 0.04 : 0)) * (a.faded ? 0.4 : 1);
  // burbuja
  const bm = a.bub.material;
  bm.map = p.bubbleKind === 'e' ? bubbleTexE : bubbleTexQ;
  bm.opacity = p.bubble * (a.faded ? 0.5 : 1);
  const sc = 0.5 * p.bubble * (1 + Math.sin(ph * (p.bubbleKind === 'e' ? 7 : 4.5)) * 0.1);
  a.bub.scale.set(sc, sc, 1);
  a.bub.position.y = 1.9 + Math.sin(ph * 3) * 0.03 * p.bubble;
  a.ring.visible = selected === a.key;
  if (a.ring.visible) a.ring.material.opacity = 0.65 + Math.sin(t * 4) * 0.25;
  walkStep(a, t, dt);
}

/* ───────── Conversaciones entre agentes: caminan de verdad ───────── */
/* Solo se sabe quién habla con quién (tabla agentes_eventos: de, para, tipo); nunca hay contenido. */
const NAV = { x0: -10.4, x1: 10.4, z0: -6.5, z1: 6.5, c: 0.2 };
let nav = null;
function buildNav() {
  const nx = Math.ceil((NAV.x1 - NAV.x0) / NAV.c), nz = Math.ceil((NAV.z1 - NAV.z0) / NAV.c);
  const blocked = new Uint8Array(nx * nz);
  const rects = [], circles = [];
  for (const a of agents.values()) {
    const p = a.group.position; rects.push([p.x - 1.25, p.x + 1.25, p.z - 0.5, p.z + 0.55], [p.x - 0.4, p.x + 0.4, p.z + 0.4, p.z + 1.05]);
    for (const o of a.obst || []) rects.push([p.x + o[0], p.x + o[1], p.z + o[2], p.z + o[3]]);
  }
  const dz = AREAS['Dirección'], gz = AREAS['General'];
  circles.push([dz.x + 1.5, dz.z + 1.75, 1.15], [gz.x + 1.4, gz.z + 1.35, 0.7]);
  for (const ar of Object.values(AREAS)) circles.push([ar.x + ar.w / 2 - 0.55, ar.z + ZONE_D / 2 - 0.55, 0.6]);
  rects.push([gz.x + 1.4 - 1.5, gz.x + 1.4 + 1.5, gz.z + 2.35 - 0.75, gz.z + 2.35 + 0.75]);   // sofá
  rects.push([-11, -9.95, 4.3, 7]);                                                              // estantería
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = NAV.x0 + (ix + 0.5) * NAV.c, z = NAV.z0 + (iz + 0.5) * NAV.c;
    let b = rects.some((r) => x >= r[0] && x <= r[1] && z >= r[2] && z <= r[3]);
    if (!b) b = circles.some((c) => (x - c[0]) ** 2 + (z - c[1]) ** 2 <= c[2] * c[2]);
    blocked[iz * nx + ix] = b ? 1 : 0;
  }
  nav = { nx, nz, blocked, n: agents.size };
}
const navCell = (x, z) => [clamp(Math.floor((x - NAV.x0) / NAV.c), 0, nav.nx - 1), clamp(Math.floor((z - NAV.z0) / NAV.c), 0, nav.nz - 1)];
const navFree = (x, z) => { const [ix, iz] = navCell(x, z); return !nav.blocked[iz * nav.nx + ix]; };
function navClear(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
  for (let i = 1; i < n; i++) { const k = i / n; if (!navFree(ax + (bx - ax) * k, az + (bz - az) * k)) return false; }
  return true;
}
function findPath(sx, sz, gx, gz) {   // A* en rejilla (8 vecinos) + suavizado por línea de vista
  if (!nav || nav.n !== agents.size) buildNav();
  const { nx, nz, blocked } = nav;
  const [s0x, s0z] = navCell(sx, sz), [g0x, g0z] = navCell(gx, gz);
  const S = s0z * nx + s0x, G = g0z * nx + g0x;
  const free = (i) => i === S || i === G || !blocked[i];
  const gs = new Float32Array(nx * nz).fill(1e9), came = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
  const heap = [[0, S]]; gs[S] = 0;
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const h = (i) => { const dx = Math.abs((i % nx) - g0x), dz = Math.abs(((i / nx) | 0) - g0z); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)); };
  let found = false;
  while (heap.length) {
    const [, c] = pop(); if (closed[c]) continue; closed[c] = 1;
    if (c === G) { found = true; break; }
    const cx = c % nx, cz = (c / nx) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
      const ni = z * nx + x; if (closed[ni] || !free(ni)) continue;
      if (dx && dz && (!free(cz * nx + x) || !free(z * nx + cx))) continue;
      const ng = gs[c] + (dx && dz ? Math.SQRT2 : 1);
      if (ng < gs[ni]) { gs[ni] = ng; came[ni] = c; push([ng + h(ni), ni]); }
    }
  }
  const pts = [];
  if (found) { for (let c = G; c !== -1; c = came[c]) pts.push([NAV.x0 + ((c % nx) + 0.5) * NAV.c, NAV.z0 + (((c / nx) | 0) + 0.5) * NAV.c]); pts.reverse(); }
  pts[0] = [sx, sz]; if (found) pts[pts.length - 1] = [gx, gz]; else pts.push([gx, gz]);
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !navClear(pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--; out.push(pts[j]); i = j; }
  return out.slice(1);
}

const evSeen = new Set(), evLog = [];
const evEl = document.createElement('div'); evEl.id = 'evlog'; evEl.hidden = true; document.body.appendChild(evEl);
function renderEvLog() {
  const rows = evLog.filter((e) => e.demo === demoOn).slice(0, 3);
  const html = rows.map((e) => { const a = agents.get(e.de), b = agents.get(e.para); return `<div>${esc(a ? a.name : e.de)} → ${esc(b ? b.name : e.para)} · ${esc(hace(e.ts))}</div>`; }).join('');
  if (html !== evEl._h) { evEl._h = html; evEl.innerHTML = html; }
  evEl.hidden = !rows.length;
  const bn = $('banners'); evEl.style.setProperty('--bn', (bn && getComputedStyle(bn).display !== 'none' ? bn.offsetHeight : 0) + 'px');
}
function queueEvent(ev, demo) {
  if (!ev || !ev.de || !ev.para || ev.de === ev.para) return;
  if (!demo && demoOn) return;
  if (ev.id != null) { if (evSeen.has(ev.id)) return; evSeen.add(ev.id); }
  const a = agents.get(ev.de), b = agents.get(ev.para);
  if (!a || !b || a.human || b.human) return;
  evLog.unshift({ de: ev.de, para: ev.para, ts: ev.creado ? new Date(ev.creado).getTime() : Date.now(), demo: !!demo }); evLog.length = Math.min(evLog.length, 12);
  renderEvLog();
  if (a.q.length < 4) a.q.push({ para: ev.para, tipo: ev.tipo || 'mensaje', ts: demo ? Date.now() : (ev.creado ? new Date(ev.creado).getTime() : Date.now()) });
}
async function loadRecentEvents(first) {
  if (!sb || !hasSession) return;
  try {
    const since = new Date(Date.now() - 120000).toISOString();
    const { data, error } = await sb.from('agentes_eventos').select('id,de,para,tipo,creado').gte('creado', since).order('creado', { ascending: true }).limit(20);
    if (error) { console.warn('[oficina] eventos no disponibles', error.message); return; }
    for (const ev of data || []) queueEvent(ev, false);
  } catch (e) { console.warn('[oficina] eventos', e && e.message); }
}

const EXIT_Z = 1.25, TALK_S = 5, WALK_SPEED = 2.0, TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);   // el avatar mira hacia -z con yaw 0
function jobPath(a, j, toTarget) {
  const g = a.group.position, tp = j.target.group.position;
  if (toTarget) {
    const side = (tp.x - AREAS[j.target.zoneName].x) < 0 ? 1 : -1;
    j.spot = [tp.x + side * 1.4, tp.z + 0.6];
    j.faceYaw = yawTo(tp.x - j.spot[0], tp.z + 0.7 - j.spot[1]);
    return findPath(g.x + a.av.position.x, g.z + a.av.position.z, j.spot[0], j.spot[1]);
  }
  return findPath(g.x + a.av.position.x, g.z + a.av.position.z, g.x, g.z + EXIT_Z);
}
function startJob(a) {
  const ev = a.q.shift(), b = agents.get(ev.para); if (!b || Date.now() - ev.ts > 150000) return;
  a.job = { ev, target: b, ph: 'rise', t: 0, path: null, i: 0 };
  a.chairSide = a.group.position.x - AREAS[a.zoneName].x < 0 ? 1 : -1;
}
function stepJob(a, dt) {
  const j = a.job, av = a.av, g = a.group.position; j.t += dt; a.moving = false;
  const follow = () => {
    const p = j.path[j.i]; if (!p) return true;
    const wx = g.x + av.position.x, wz = g.z + av.position.z, dx = p[0] - wx, dz = p[1] - wz, d = Math.hypot(dx, dz);
    if (d < 0.08) { j.i++; return j.i >= j.path.length; }
    a.yaw += angDiff(a.yaw, yawTo(dx, dz)) * (1 - Math.exp(-dt * 10));
    const k = Math.min(d, WALK_SPEED * dt) / d; av.position.x += dx * k; av.position.z += dz * k; a.moving = true;
    return false;
  };
  switch (j.ph) {
    case 'rise': a.stand = ease(Math.min(1, j.t / 0.5)); if (j.t >= 0.5) { j.ph = 'exit'; j.t = 0; } break;
    case 'exit': {   // sale de la silla hacia atrás
      const tz = EXIT_Z, dz = tz - av.position.z; a.moving = true;
      av.position.z += Math.min(dz, WALK_SPEED * 0.8 * dt); a.yaw += angDiff(a.yaw, yawTo(0, 1)) * (1 - Math.exp(-dt * 8));
      if (av.position.z >= tz - 0.01) { j.path = jobPath(a, j, true); j.i = 0; j.ph = 'go'; j.t = 0; }
      break;
    }
    case 'go': if (follow()) { j.ph = 'turn'; j.t = 0; } break;
    case 'turn': a.yaw += angDiff(a.yaw, j.faceYaw) * (1 - Math.exp(-dt * 9)); if (j.t > 0.4) { j.ph = 'talk'; j.t = 0; } break;
    case 'talk': a.yaw += angDiff(a.yaw, j.faceYaw) * (1 - Math.exp(-dt * 9)); a.talking = true; if (j.t >= TALK_S) { a.talking = false; j.path = jobPath(a, j, false); j.i = 0; j.ph = 'back'; j.t = 0; } break;
    case 'back': if (follow()) { j.ph = 'enter'; j.t = 0; } break;
    case 'enter': {   // se vuelve a sentar
      const dz = 0.7 - av.position.z, dx = -av.position.x; a.moving = Math.abs(dz) > 0.02 || Math.abs(dx) > 0.02;
      av.position.x += clamp(dx, -WALK_SPEED * 0.8 * dt, WALK_SPEED * 0.8 * dt); av.position.z += clamp(dz, -WALK_SPEED * 0.8 * dt, WALK_SPEED * 0.8 * dt);
      a.yaw += angDiff(a.yaw, yawTo(dx, dz) * 1) * (1 - Math.exp(-dt * 8)) * (a.moving ? 1 : 0);
      if (!a.moving) { j.ph = 'sit'; j.t = 0; }
      break;
    }
    case 'sit': a.yaw += angDiff(a.yaw, 0) * (1 - Math.exp(-dt * 10)); a.stand = 1 - ease(Math.min(1, j.t / 0.55)); if (j.t >= 0.55) { a.stand = 0; a.yaw = 0; av.position.set(0, 0, 0.7); a.job = null; } break;
  }
}
function walkStep(a, t, dt) {
  if (!a.job && a.q.length && a.stand === 0 && !a.human) startJob(a);
  if (a.job) stepJob(a, dt); else a.talking = false;
  const s = a.stand;
  a.talkAmt = damp(a.talkAmt, a.talking ? 1 : 0, dt, 9);
  const tm = a.talk.material; tm.opacity = a.talkAmt; const ts = 0.62 * a.talkAmt * (1 + Math.sin(t * 6) * 0.06); a.talk.scale.set(ts, ts, 1);
  if (s <= 0.001 && !a.job) {
    if (a._walked) {   // vuelve a la pose sentada
      a._walked = false; a.seatedLegs.visible = true; a.standLegs.visible = false; a.av.rotation.y = 0;
      a.chair.position.set(0, 0, 0.7); a.chair.rotation.y = 0;
      a.anchor.set(a.group.position.x, 2.2, a.group.position.z + 0.7); a.focus.set(a.group.position.x, 1.0, a.group.position.z + 0.5);
    }
    return;
  }
  a._walked = true;
  a.mv = damp(a.mv, a.moving ? 1 : 0, dt, 12); a.wph += dt * 9 * a.mv;
  const sw = Math.sin(a.wph) * 0.55 * a.mv;
  a.seatedLegs.visible = s < 0.5; a.standLegs.visible = s >= 0.5;
  a.standLegs.children[0].rotation.x = sw; a.standLegs.children[1].rotation.x = -sw;
  a.av.position.y = 0.27 * s + Math.abs(Math.sin(a.wph)) * 0.05 * a.mv * s;
  a.av.rotation.y = a.yaw;
  // la silla se aparta mientras no está
  const away = a.job && a.job.ph !== 'sit' ? 1 : 0, cs = a.chairSide || 1;
  a.chair.position.x = damp(a.chair.position.x, away * cs * 0.55, dt, 6); a.chair.rotation.y = damp(a.chair.rotation.y, away * cs * -0.5, dt, 6);
  if (!away) a.chair.position.z = damp(a.chair.position.z, 0.7, dt, 6);
  // pose de pie: torso recto, cabeza y brazos al paso
  const mix2 = (cur, tgt) => cur + (tgt - cur) * s;
  a.torso.rotation.x = mix2(a.torso.rotation.x, 0.03 + Math.abs(Math.sin(a.wph)) * 0.03 * a.mv);
  a.torso.rotation.y = mix2(a.torso.rotation.y, 0);
  a.head.rotation.x = mix2(a.head.rotation.x, a.talking ? Math.sin(t * 3.2) * 0.06 : 0);
  a.head.rotation.y = mix2(a.head.rotation.y, a.talking ? Math.sin(t * 1.3) * 0.12 : 0);
  a.head.rotation.z = mix2(a.head.rotation.z, 0);
  for (const arm of a.arms) {
    const side = arm.side, sg = side > 0 ? 1 : -1;
    let shx = -sw * 0.9 * sg, elx = 0.22 + Math.max(0, sg * Math.sin(a.wph)) * 0.2, shz = side * 0.07;
    if (a.talking && side > 0) { shx = -0.55 + Math.sin(t * 5) * 0.25; elx = 1.0 + Math.sin(t * 5 + 1) * 0.2; }
    arm.sh.rotation.x = mix2(arm.sh.rotation.x, shx); arm.el.rotation.x = mix2(arm.el.rotation.x, elx);
    arm.sh.rotation.z = mix2(arm.sh.rotation.z, shz); arm.el.rotation.z = mix2(arm.el.rotation.z, 0);
  }
  // etiqueta y foco siguen al avatar
  const wx = a.group.position.x + a.av.position.x, wz = a.group.position.z + a.av.position.z;
  a.anchor.set(wx, 2.35, wz); a.focus.set(wx, 1.0, wz);
}

/* ───────── Cámara: transiciones ───────── */
let tween = null;
function flyTo(pos, target, dur = 0.9) {
  tween = { t0: performance.now(), dur: dur * 1000, p0: camera.position.clone(), t0v: controls.target.clone(), p1: pos.clone(), t1v: target.clone() };
}
controls.addEventListener('start', () => { tween = null; });
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function stepTween(now) {
  if (!tween) return;
  const k = clamp((now - tween.t0) / tween.dur, 0, 1), e = ease(k);
  camera.position.lerpVectors(tween.p0, tween.p1, e);
  controls.target.lerpVectors(tween.t0v, tween.t1v, e);
  if (k >= 1) tween = null;
}
function recentrar() {
  const v = defaultView(); flyTo(v.pos, v.target, 0.9); select(null);
}
$('recentrar').addEventListener('click', recentrar);

/* ───────── Selección y tarjeta ───────── */
function select(key, fly) {
  selected = key;
  const card = $('card');
  if (!key) { card.hidden = true; document.body.classList.remove('has-card'); applyAll(); return; }
  const a = agents.get(key); if (!a) return;
  card.hidden = false; document.body.classList.add('has-card');
  fillCard();
  if (fly) {
    const dir = camera.position.clone().sub(controls.target); dir.y = Math.max(dir.y, dir.length() * 0.5);
    dir.normalize();
    const dist = IS_MOBILE ? 12.5 : 10;
    const tgt = a.focus.clone();
    // en móvil, el avatar se desplaza arriba para no quedar tapado por la tarjeta
    flyTo(tgt.clone().add(dir.multiplyScalar(dist)), tgt, 0.85);
  }
  applyAll();
}
function fillCard() {
  const a = agents.get(selected); if (!a) return;
  $('cPill').style.display = a.human ? 'none' : '';
  if (a.human) {
    $('cName').textContent = a.name; $('cArea').textContent = a.areaName; $('cSwatch').style.background = '#D4B57A';
    const d0 = $('cDetalle'); d0.textContent = a.role; d0.classList.remove('empty'); $('cTime').textContent = 'Equipo de Orozco Import';
    return;
  }
  const vis = a.vis || visualOf(a.key);
  const col = vis.st === 'offline' ? OFFLINE.color : ESTADOS[vis.st].color;
  $('cName').textContent = a.name;
  $('cArea').textContent = a.areaName;
  $('cSwatch').style.background = (AREAS[a.zoneName] || AREAS.General).color;
  const pill = $('cPill'); pill.style.setProperty('--c', col);
  pill.innerHTML = `<i></i>${esc(vis.st === 'offline' ? OFFLINE.label : ESTADOS[vis.st].label)}`;
  const d = $('cDetalle');
  const has = vis.detalle && vis.st !== 'offline';
  d.textContent = has ? vis.detalle : (vis.st === 'offline' ? 'Inicia sesión en el panel para ver qué está haciendo.' : 'Sin actividad registrada.');
  d.classList.toggle('empty', !has);
  $('cTime').textContent = vis.ts ? `Actualizado ${hace(vis.ts)} · ${new Date(vis.ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${vis.faded ? ' · inactivo +24 h' : ''}` : '';
}
$('cardClose').addEventListener('click', () => select(null));
addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

/* clic en avatar (distingue clic de arrastre) */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitMeshes, false)[0];
  return hit ? hit.object.userData.agente : null;
}
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; down = null;
  if (moved < 7 && dt < 600) { const k = pickAt(e.clientX, e.clientY); if (k) select(k, true); else if (pickBill(e.clientX, e.clientY)) focusBill(); else if (selected) select(null); }
});
let hoverPending = false;
if (!IS_MOBILE) canvas.addEventListener('pointermove', (e) => {
  if (e.buttons || hoverPending) return; hoverPending = true;
  requestAnimationFrame(() => { hoverPending = false; const k = pickAt(e.clientX, e.clientY); hoverKey = k; canvas.style.cursor = (k || pickBill(e.clientX, e.clientY)) ? 'pointer' : 'grab'; });
});

/* ───────── Banners ───────── */
function renderBanners() {
  const parts = [];
  if (!hasSession) parts.push(`<div class="banner">Sin sesión · <a href="${PANEL_URL}">Inicia sesión en el panel</a> para ver el estado real.</div>`);
  else if (noAccess) parts.push('<div class="banner warn">Tu usuario no tiene acceso al estado del equipo.</div>');
  else if (fetchError) parts.push('<div class="banner warn">No se pudo actualizar el estado. Reintentando…</div>');
  if (demoOn) parts.push('<div class="banner demo"><b>Modo demo</b> · estados simulados en tu navegador; no se toca la base de datos.</div>');
  const el = $('banners'); if (el.dataset.h !== parts.join('')) { el.innerHTML = parts.join(''); el.dataset.h = parts.join(''); }
}

/* ───────── Datos reales (solo lectura) ───────── */
let sb = null, channel = null, pollTimer = null, fetchRetriedKey = false;
function setOfflineAll() {
  for (const r of ROSTER) real.set(r.agente, { ...r, estado: 'libre', detalle: null, actualizado: 0, offline: true });
  for (const [k, v] of real) if (!ROSTER.find((r) => r.agente === k)) v.offline = true;
}
function upsertRow(row) {
  if (!row || !row.agente) return;
  const ts = row.actualizado ? new Date(row.actualizado).getTime() : Date.now();
  real.set(row.agente, { agente: row.agente, nombre: row.nombre || row.agente, area: row.area || 'General', estado: row.estado, detalle: row.detalle, actualizado: ts, offline: false });
  ensureAgent({ agente: row.agente, nombre: row.nombre || row.agente, area: row.area || 'General' });
}
async function fetchRows() {
  if (!sb || !hasSession) return;
  try {
    const { data, error, status } = await sb.from('agentes_estado').select('agente,nombre,area,estado,detalle,actualizado');
    if (error) {
      if (/api key/i.test(error.message || '') && !fetchRetriedKey) { fetchRetriedKey = true; try { localStorage.removeItem('oficina-pk-v1'); sb = null; unsubscribe(); await createClientWith(await discoverKey(true)); } catch (e2) { handleSession(null); } return; }
      if (status === 401 || status === 403 || /JWT/i.test(error.message || '')) { handleSession(null); return; }
      throw error;
    }
    fetchError = false;
    noAccess = !data || data.length === 0;
    if (data) {
      const seen = new Set(data.map((r) => r.agente));
      data.forEach(upsertRow);
      for (const [k, v] of real) if (!seen.has(k) && !noAccess) v.offline = true;
      if (noAccess) setOfflineAll();
    }
    lastUpdate = new Date(); fetchBilling(false); loadRecentEvents();
  } catch (e) { fetchError = true; console.warn('[oficina] lectura fallida', e && e.message); }
  applyAll(); renderBanners();
}
function subscribe() {
  if (!sb || channel) return;
  channel = sb.channel('oficina-agentes-estado')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agentes_estado' }, (payload) => {
      if (payload.eventType === 'DELETE') return;
      upsertRow(payload.new); lastUpdate = new Date(); noAccess = false; applyAll(); renderBanners();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agentes_eventos' }, (payload) => queueEvent(payload.new, false))
    .subscribe();
}
function unsubscribe() { if (channel && sb) { sb.removeChannel(channel); } channel = null; }
function handleSession(session) {
  const had = hasSession; hasSession = !!session;
  if (hasSession) {
    if (!pollTimer) pollTimer = setInterval(() => { if (!document.hidden) fetchRows(); }, 60000);
    subscribe(); fetchRows();
  } else {
    unsubscribe(); if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    setOfflineAll(); bill.state = 'off'; billTs = 0; lastUpdate = null; noAccess = false; fetchError = false;
    if (had) console.info('[oficina] sin sesión');
  }
  applyAll(); renderBanners();
}
/* La clave pública (anon/publishable) no se guarda en esta carpeta: se lee de los
   assets públicos del propio panel (mismo origen) y se cachea en localStorage. */
async function discoverKey(force) {
  if (!force) { try { const c = localStorage.getItem('oficina-pk-v1'); if (c) return c; } catch (e) { /* sin acceso */ } }
  const html = await (await fetch('/', { cache: 'no-cache' })).text();
  const paths = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const p of paths) {
    const js = await (await fetch(p)).text();
    const m = js.match(/sb_publishable_[A-Za-z0-9_-]{20,}/);
    if (m) { try { localStorage.setItem('oficina-pk-v1', m[0]); } catch (e) { /* ignorar */ } return m[0]; }
  }
  throw new Error('clave pública no encontrada');
}
function hasStoredSession() { try { return !!localStorage.getItem(AUTH_KEY); } catch (e) { return false; } }
async function createClientWith(key) {
  sb = window.supabase.createClient(CFG.url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  const { data } = await sb.auth.getSession();
  handleSession(data && data.session);
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'INITIAL_SESSION') return;
    setTimeout(() => { if (!!session !== hasSession || ev === 'TOKEN_REFRESHED') handleSession(session); }, 0);
  });
}
let initializing = false;
async function initData() {
  setOfflineAll();
  if (sb || initializing) return;
  if (!window.supabase || !hasStoredSession()) { applyAll(); renderBanners(); return; }
  initializing = true;
  try { await createClientWith(await discoverKey(false)); }
  catch (e) { console.warn('[oficina] auth', e && e.message); handleSession(null); }
  initializing = false;
}
addEventListener('storage', (e) => {
  if (!e.key || !e.key.includes('auth-token')) return;
  if (!sb) initData();
  else sb.auth.getSession().then(({ data }) => { if (!!data.session !== hasSession) handleSession(data.session); });
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && hasSession) fetchRows(); });

/* ───────── Modo demo (solo local) ───────── */
const DEMO_TXT = {
  trabajando: ['Revisando copias de seguridad y certificados', 'Preparando propuesta para un BMW X3 de Múnich', 'Revisando presupuestos de transporte desde Hamburgo', 'Actualizando la ficha de un Audi A4 Avant', 'Cuadrando facturas de octubre', 'Redactando anuncio para la landing de Golf GTI', 'Contestando a un lead de Instagram'],
  esperando: ['Esperando el OK de Fran para continuar', 'Pendiente de confirmación del cliente', 'Esperando respuesta del vendedor alemán'],
  bloqueado: ['Sin acceso al portal de la DGT', 'Falta la documentación del vendedor', 'Error al conectar con la API de Meta Ads'],
  libre: [null],
};
const pickR = (a) => a[Math.floor(Math.random() * a.length)];
function demoSet(key, st, minsAgo) {
  demoData.set(key, { agente: key, nombre: (agents.get(key) || {}).name || key, area: (agents.get(key) || {}).areaName, estado: st, detalle: pickR(DEMO_TXT[st]), actualizado: Date.now() - minsAgo * 60000, offline: false });
}
let demoTimer = null;
function demoStart() {
  const keys = [...agents.values()].filter((a) => !a.human).map((a) => a.key);
  const seq = ['trabajando', 'trabajando', 'esperando', 'bloqueado', 'libre', 'trabajando', 'esperando', 'libre', 'bloqueado'];
  keys.forEach((k, i) => demoSet(k, seq[i % seq.length], Math.floor(Math.random() * 12)));
  // un agente inactivo >24 h para enseñar el desvanecido
  const stale = keys.includes('contabilidad') ? 'contabilidad' : keys[4];
  if (stale) { demoSet(stale, 'libre', 26 * 60); }
  demoEvLoop(true);
  demoTimer = setInterval(() => {
    const cand = keys.filter((k) => k !== stale);
    const k = pickR(cand), cur = demoData.get(k).estado;
    const opts = ['trabajando', 'trabajando', 'libre', 'esperando', 'bloqueado'].filter((s) => s !== cur);
    demoSet(k, pickR(opts), 0); applyAll();
  }, 2800);
}
let demoEvTimer = null;
function demoEvLoop(first) {
  clearTimeout(demoEvTimer);
  demoEvTimer = setTimeout(() => {
    const ks = [...agents.values()].filter((a) => !a.human && !a.job && !a.q.length).map((a) => a.key);
    if (demoOn && ks.length > 1) {
      const de = pickR(ks), para = pickR(ks.filter((k) => k !== de));
      queueEvent({ de, para, tipo: 'mensaje' }, true);
      if (Math.random() < 0.5) setTimeout(() => { if (demoOn) queueEvent({ de: para, para: de, tipo: 'respuesta' }, true); }, 14000);
    }
    if (demoOn) demoEvLoop(false);
  }, first ? 2500 : 10000 + Math.random() * 10000);
}
function demoStop() {
  clearInterval(demoTimer); demoTimer = null; clearTimeout(demoEvTimer); demoEvTimer = null; demoData.clear();
  for (const a of agents.values()) a.q.length = 0;
}
$('demo').addEventListener('change', (e) => {
  demoOn = e.target.checked;
  if (demoOn) demoStart(); else demoStop();
  applyAll(); renderBanners(); renderEvLog();
});

/* ───────── Bucle principal ───────── */
const _v = new THREE.Vector3();
function updateTags() {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const ppmBase = (H / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const list = [];
  for (const a of agents.values()) {
    _v.copy(a.anchor).project(camera);
    if (_v.z > 1 || _v.z < -1) { if (a._on) { a.tag.style.display = 'none'; a._on = false; } continue; }
    a._d = camera.position.distanceTo(a.anchor); a._ppm = ppmBase / a._d;
    a._x = (_v.x * 0.5 + 0.5) * W; a._y = (-_v.y * 0.5 + 0.5) * H;
    list.push(a);
  }
  const pin = (a) => (a.key === selected || a.key === hoverKey ? 1 : 0);
  list.sort((p, q) => (pin(q) - pin(p)) || (p._d - q._d));   // primero la seleccionada/bajo el cursor, luego las más cercanas
  const placed = [];
  const hit = (r) => placed.some((q) => r.x0 < q.x1 && r.x1 > q.x0 && r.y0 < q.y1 && r.y1 > q.y0);
  for (const a of list) {
    const el = a.tag, s = clamp(a._ppm / 42, 0.78, 1.25), pinned = pin(a) === 1;
    if (!a._on) { el.style.display = 'block'; a._on = true; }
    if (a._nbName !== a.name && el.offsetWidth) { a._nb = a.tagRefs.top.offsetWidth; a._nbName = a.name; }
    const nb = a._nb || 80, det = (a.tagRefs.det.textContent || '').length;
    const fullW = Math.min(172, Math.max(nb + 33, det * 5.4 + 18)) * s, fullH = (a.human ? 44 : 56) * s;
    const smW = (nb + 33) * s, smH = 28 * s, bottom = a._y - 6;
    let full = false, dy = 0;   // etiqueta siempre mínima: nombre + punto (el detalle va en el tooltip / la tarjeta)
    const rect = () => { const w = full ? fullW : smW, h = full ? fullH : smH; return { x0: a._x - w / 2, x1: a._x + w / 2, y0: bottom - dy - h, y1: bottom - dy }; };
    if (!pinned) {
      if (full && hit(rect())) full = false;                          // si choca, solo nombre y punto
      for (let i = 0; i < 4 && hit(rect()); i++) dy += smH + 3;       // si aún choca, se apila hacia arriba
    }
    placed.push(rect());
    if (a._c !== !full) { a._c = !full; el.classList.toggle('compact', !full); }
    el.style.transform = `translate3d(${a._x.toFixed(1)}px,${(a._y - dy).toFixed(1)}px,0) translate(-50%,-100%) translateY(-6px) scale(${s.toFixed(3)})`;
    el.style.zIndex = String(2000 - Math.round(a._d * 10) + (pinned ? 1000 : 0));
  }
}

/* Tooltip con el detalle completo (al pasar el cursor por el avatar o su etiqueta) */
const tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.hidden = true; document.body.appendChild(tipEl);
let tipSig = '';
function tipHtml(a) {
  if (a.human) return `<div class="tip-name">${esc(a.name)}</div><div class="tip-meta">${esc(a.role)} · ${esc(a.areaName)}</div><div class="tip-time">Equipo de Orozco Import</div>`;
  const vis = a.vis || visualOf(a.key), off = vis.st === 'offline';
  const col = off ? OFFLINE.color : ESTADOS[vis.st].color, lab = off ? OFFLINE.label : ESTADOS[vis.st].label;
  const has = vis.detalle && !off;
  const det = has ? vis.detalle : (off ? 'Inicia sesión en el panel para ver qué está haciendo.' : 'Sin actividad registrada.');
  return `<div class="tip-name">${esc(a.name)}</div><div class="tip-meta">${esc(a.areaName)}</div>` +
    `<div class="tip-pill" style="--c:${col}"><i></i>${esc(lab)}</div><div class="tip-det${has ? '' : ' empty'}">${esc(det)}</div>` +
    (vis.ts ? `<div class="tip-time">Actualizado ${esc(hace(vis.ts))}</div>` : '');
}
function updateTip() {
  const a = !IS_MOBILE && hoverKey && hoverKey !== selected ? agents.get(hoverKey) : null;
  if (!a || !a._on) { if (!tipEl.hidden) { tipEl.hidden = true; tipSig = ''; } return; }
  const html = tipHtml(a);
  if (html !== tipSig) { tipEl.innerHTML = html; tipSig = html; }
  if (tipEl.hidden) tipEl.hidden = false;
  const r = a.tag.getBoundingClientRect(), W = innerWidth, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  const x = clamp(r.left + r.width / 2, w / 2 + 8, W - w / 2 - 8);
  let y = r.top - 10 - h, below = false;
  if (y < 64) { y = r.bottom + 10; below = true; }
  tipEl.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px,${y.toFixed(1)}px,0)`;
  tipEl.classList.toggle('below', below);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let lastT = performance.now(), frameAcc = 0, frameN = 0, started = false;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - lastT) / 1000, 0.1); lastT = now;
  const t = now / 1000;
  stepTween(now);
  for (const a of agents.values()) animate(a, t, dt);
  screenTex.offset.y = (screenTex.offset.y + dt * 0.12) % 1;
  controls.update();
  // límites de desplazamiento
  const tg = controls.target;
  const cx = clamp(tg.x, -PAN_LIMIT.x, PAN_LIMIT.x), cz = clamp(tg.z, -PAN_LIMIT.z, PAN_LIMIT.z), cy = clamp(tg.y, PAN_LIMIT.y0, PAN_LIMIT.y1);
  if (cx !== tg.x || cz !== tg.z || cy !== tg.y) { camera.position.x += cx - tg.x; camera.position.z += cz - tg.z; camera.position.y += cy - tg.y; tg.set(cx, cy, cz); }
  updateWalls(dt);
  renderer.render(scene, camera);
  updateTags(); updateTip();
  // pixel ratio adaptativo
  frameAcc += dt; frameN++;
  if (frameN === 90) {
    const avg = frameAcc / frameN; frameAcc = 0; frameN = 0;
    if (avg > 0.034 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
  }
  if (!started) { started = true; document.documentElement.dataset.ready = '1'; }
}
let secTick = 0;
setInterval(() => { secTick++; applyAll(); renderEvLog(); drawBilling(); if (secTick % 300 === 0) fetchBilling(true); }, 1000);

/* ───────── Arranque ───────── */
buildOffice();
for (const r of ROSTER) ensureAgent(r);
for (const r of HUMANS) ensureAgent(r);
resize();
{ const v = defaultView(); camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); }
applyAll(); renderBanners();
requestAnimationFrame(loop);
initData();
window.__oficina = { select: (k) => select(k, true), recentrar, camera, controls, agents, talk: (de, para, tipo) => queueEvent({ de, para, tipo }, true), nav: { findPath, navClear, navFree }, areas: AREAS, ensureAgent, applyAll };
