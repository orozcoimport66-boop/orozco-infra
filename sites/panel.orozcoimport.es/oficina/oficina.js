/* Oficina 3D · Orozco Import · tema Fórmula 1 (versión del 2026-11-03)
   Página independiente. Solo lectura sobre public.agentes_estado (nunca escribe).
   Cambio SOLO estético: paddock de F1. Los datos, estados, eventos y la facturación funcionan igual. */
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

/* ───────── Tema Fórmula 1 · constantes fáciles de cambiar ───────── */
/* DORSALES: números de los dos coches de la parrilla. Para cambiarlos, edita solo esta línea.
   (17 = «desde el 17», el año en que empezó Orozco Import; 26 = el año de la guía de marca.) */
const DORSALES = { fran: 17, javi: 26 };
const FLAG_SECONDS = 12;          // duración de la celebración (semáforo + bandera a cuadros)
const DEMO_FLAG_EVERY = [40, 70]; // en modo demo: cada cuántos segundos (mín, máx) ondea sola la bandera
/* Colores de Orozco Import (guía de marca: brand.orozcoimport.es y panel) */
const ORO = { navy: '#0F172A', navy2: '#1E293B', blue: '#2563EB', sky: '#60A5FA', white: '#F9F9F9', steel: '#64748B' };

const SLOTS = [[-1.65, -0.9], [1.65, -0.9], [-1.65, 1.85], [1.65, 1.85]];
const SLOTS_DIR = [[-1.65, -0.9], [1.65, -0.9], [-1.65, 1.85]];
const SLOTS_GEN = SLOTS.slice(0, 3);                    // el 4.º puesto choca con el sofá
const SLOTS_NARROW = [[0, -0.9], [0, 1.85]];            // zonas estrechas: puestos en columna
/* Zonas = boxes de equipos de F1 (colores inspirados en equipos reales, sin logos ni nombres):
   color = color del box y del mono; accent = color secundario; x/z = centro; w = ancho (el fondo ZONE_D es común). */
const ZONE_D = 6.0;
const GRID_W = 5.4;                                      // ancho de la calle central (parrilla de salida)
const ZROW = GRID_W / 2 + ZONE_D / 2 + 0.1;              // centro z de cada fila de boxes
const AREAS = {
  'Ventas':         { x: -6.9, z: -ZROW, w: 6.4, color: '#D91E26', accent: '#F9F9F9', ink: '#FFFFFF', slots: SLOTS },        // rojo
  'Operaciones':    { x: -1.2, z: -ZROW, w: 4.2, color: '#AEB8C4', accent: '#12B8A4', ink: '#0F172A', slots: SLOTS_NARROW }, // plata
  'Administración': { x:  3.4, z: -ZROW, w: 4.2, color: '#FF8000', accent: '#1F4FD8', ink: '#0F172A', slots: SLOTS_NARROW }, // naranja
  'Tecnología':     { x:  8.0, z: -ZROW, w: 4.2, color: '#16245C', accent: '#FFC905', ink: '#FFFFFF', slots: SLOTS_NARROW }, // azul oscuro
  'Dirección':      { x: -6.9, z:  ZROW, w: 6.4, color: '#2F8BFF', accent: '#F9F9F9', ink: '#0F172A', slots: SLOTS_DIR },    // azul claro
  'Marketing':      { x:  0.0, z:  ZROW, w: 6.4, color: '#0A7D5A', accent: '#C9E000', ink: '#FFFFFF', slots: SLOTS },        // verde
  'General':        { x:  6.9, z:  ZROW, w: 6.4, color: '#EE5FA7', accent: '#1B1B2F', ink: '#0F172A', slots: SLOTS_GEN },    // rosa
};
/* Zonas «especiales» (no son boxes): la parrilla y el muro de boxes, en la calle central */
const EXTRA = {
  'Parrilla':      { x: -1.8, z: 0, w: 12, color: ORO.blue, accent: ORO.sky },
  'Muro de boxes': { x: 6.75, z: 0, w: 6.4, color: ORO.blue, accent: ORO.sky },
};
const zoneOf = (n) => AREAS[n] || EXTRA[n] || AREAS['General'];
/* Puestos especiales: Fran y Javi en sus coches de la parrilla (pole y 2.º), Partner y Pip en el muro de boxes */
const PLACES = {
  fran:    { zone: 'Parrilla', x: -4.5, z: -1.35, kind: 'car' },
  javi:    { zone: 'Parrilla', x:  0.9, z:  1.15, kind: 'car' },
  partner: { zone: 'Muro de boxes', x: 5.2, z: 0.1, kind: 'pit', role: 'Ingeniero de carrera' },
  pip:     { zone: 'Muro de boxes', x: 8.3, z: 0.1, kind: 'pit', role: 'Estratega' },
};
/* Personas del equipo: sin fila de estado, solo nombre y cargo */
const HUMANS = [
  { agente: 'fran', nombre: 'Fran', rol: 'Gerente · dorsal ' + DORSALES.fran, area: 'Dirección', human: true, accent: ORO.blue },
  { agente: 'javi', nombre: 'Javi', rol: 'Marketing · dorsal ' + DORSALES.javi, area: 'Dirección', human: true, accent: ORO.white },
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
controls.maxDistance = 115;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.04;
controls.zoomToCursor = false;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

const PAN_LIMIT = { x: 12, z: 10.5, y0: 0, y1: 3 };

function defaultView() {
  const aspect = camera.aspect;
  let dist = 41;
  if (aspect < 1.55) dist = 41 * Math.pow(1.55 / aspect, 0.82);
  dist = Math.min(dist, 95);
  // en vertical (móvil) se mira desde un lateral para que el eje largo use la altura de la pantalla
  const portrait = aspect < 0.9;
  if (portrait) dist = clamp(42 / aspect, 70, 105);
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
const FW = 21.6, FD = 18.0;
const WALL_H = 4.0;
const wallsReg = [];   // 0 fondo, 1 izquierda, 2 frente, 3 derecha
function regWall(g, nx, nz) { g.traverse((o) => { if (o.isMesh) o.castShadow = false; }); wallsReg.push({ g, nx, nz, k: 0, decor: [] }); }

/* ───────── Oficina = paddock de F1: suelo, paredes, boxes, parrilla y muro de boxes ───────── */
const OBST = { rects: [], circles: [] };   // obstáculos para el pathfinding de la caminata
const redraws = [];                        // texturas de canvas que se repintan al cargar las fuentes
function canvasTex(w, h, draw, aniso = 4) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  const go = () => { x.clearRect(0, 0, w, h); draw(x, w, h); t.needsUpdate = true; };
  go(); redraws.push(go); return t;
}
const FONT = (w, s, mono) => `${w} ${s}px ${mono ? "'JetBrains Mono', ui-monospace, monospace" : "Geist, Inter, system-ui, sans-serif"}`;

/* neumáticos: pila de n ruedas con aro de color de compuesto (blando/medio/duro, sin marcas) en la de arriba */
const tyreGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.2, 20);
const tyreRingGeo = new THREE.RingGeometry(0.2, 0.285, 24);
const tyreHubGeo = new THREE.CircleGeometry(0.19, 20);
const COMPOUND = ['#E5342B', '#F5C518', '#EDEDED'];
function tyreStack(parent, x, z, n = 4, band = COMPOUND[0], rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(tyreGeo, mat('#15171C', 0.93)); t.position.y = 0.1 + i * 0.2; t.rotation.y = rot + i * 0.9; t.castShadow = true; t.receiveShadow = true; g.add(t);
  }
  const top = 0.2 * n + 0.003;
  const ring = new THREE.Mesh(tyreRingGeo, new THREE.MeshStandardMaterial({ color: band, roughness: 0.6 })); ring.rotation.x = -Math.PI / 2; ring.position.y = top; g.add(ring);
  const hub = new THREE.Mesh(tyreHubGeo, mat('#9AA1AB', 0.4, 0.6)); hub.rotation.x = -Math.PI / 2; hub.position.y = top + 0.001; g.add(hub);
  return g;
}
/* carrito de herramientas con cajones del color del equipo (el frente mira a +z, hacia los mecánicos) */
function toolChest(parent, x, z, color, accent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  g.add(box(0.84, 0.82, 0.5, mat(color, 0.45, 0.2), 0, 0.56, 0));
  g.add(box(0.88, 0.05, 0.54, mat('#8C95A0', 0.35, 0.6), 0, 0.995, 0));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.74, 0.012, 0.012, mat('#0B0F19', 0.5), 0, 0.3 + i * 0.2, 0.255, false, false));
    g.add(box(0.26, 0.022, 0.03, mat(accent, 0.4, 0.3), 0, 0.4 + i * 0.2, 0.27, false, false));
  }
  for (const sx of [-0.34, 0.34]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), mat('#0B0F19', 0.6)); w.rotation.z = Math.PI / 2; w.position.set(sx, 0.07, 0.15); g.add(w); }
  wrench(g, -0.2, 1.03, 0.0, 0.5); wrench(g, 0.15, 1.03, 0.08, -0.3);
  OBST.rects.push([parent.position.x + x - 0.5, parent.position.x + x + 0.5, parent.position.z + z - 0.32, parent.position.z + z + 0.32]);
  return g;
}
function wrench(parent, x, y, z, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g);
  const m = mat('#C3CAD3', 0.3, 0.8);
  g.add(box(0.26, 0.012, 0.03, m, 0, 0, 0, false, false));
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 5, 8), m); head.rotation.x = Math.PI / 2; head.position.x = 0.14; g.add(head);
  const head2 = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.01, 5, 8), m); head2.rotation.x = Math.PI / 2; head2.position.x = -0.14; g.add(head2);
}
function floorJack(parent, x, z, accent) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  g.add(box(0.7, 0.1, 0.3, mat('#2B3340', 0.5, 0.4), 0, 0.09, 0));
  g.add(box(0.2, 0.2, 0.2, mat(accent, 0.45, 0.3), 0.18, 0.24, 0));
  const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 8), mat('#C3CAD3', 0.3, 0.8)); ram.position.set(0.18, 0.44, 0); ram.castShadow = true; g.add(ram);
  g.add(box(0.5, 0.025, 0.025, mat('#6B7480', 0.4, 0.5), -0.28, 0.45, 0.0)).rotation.z = 0.35;
  for (const sz of [-0.13, 0.13]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), mat('#0B0F19', 0.6)); w.rotation.x = Math.PI / 2; w.position.set(-0.28, 0.045, sz); g.add(w); }
  OBST.rects.push([parent.position.x + x - 0.4, parent.position.x + x + 0.4, parent.position.z + z - 0.22, parent.position.z + z + 0.22]);
}
function extinguisher(parent, x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.4, 12), mat('#D32F2F', 0.45, 0.2)); m.position.set(x, 0.2, z); m.castShadow = true; parent.add(m);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.08, 8), mat('#111827', 0.5)); t.position.set(x, 0.44, z); parent.add(t);
}
/* semáforo / bandera a cuadros: estado compartido (se rellena en buildGrid) */
const FL = { t: -1, amp: 0, lit: 0, _was: true, lights: [], glows: [], flags: [], conf: null, why: '' };

function buildZone(name, a) {
  const g = new THREE.Group(); g.position.set(a.x, 0, a.z); world.add(g);
  // suelo de box: borde del color del equipo + losa de taller oscura
  g.add(flatShape(a.w + 0.16, ZONE_D + 0.16, 0.35, new THREE.MeshStandardMaterial({ color: a.color, roughness: 0.55 }), 0.006));
  g.add(flatShape(a.w, ZONE_D, 0.3, new THREE.MeshStandardMaterial({ color: mix(a.color, '#5A6272', 0.8), roughness: 0.8 }), 0.012));
  const lab = floorLabel(name.toUpperCase(), a.color, a.ink);
  lab.position.set(0, 0.03, 0.82); lab.scale.setScalar(Math.min(1, (a.w - 0.5) / (name.length * 0.36))); g.add(lab);
  // línea del color secundario en el borde del taller
  g.add(box(a.w - 0.5, 0.012, 0.07, mat(a.accent, 0.5), 0, 0.02, -ZONE_D / 2 + 0.28, false, false));
  // neumáticos, herramientas y extintor en el fondo del box (el lado al que miran los mecánicos)
  const zN = -ZONE_D / 2 + 0.55, hw = a.w / 2;
  const mk = (x, z, n, k, r) => { tyreStack(g, x, z, n, COMPOUND[k % 3], r); OBST.circles.push([a.x + x, a.z + z, 0.45]); };
  mk(-(hw - 0.5), zN, 4, 0, 0.3); mk(hw - 0.5, zN, 3, 1, 1.1);
  if (a.w > 5) { toolChest(g, -1.55, zN, a.color, a.accent); toolChest(g, 1.55, zN, a.color, a.accent); floorJack(g, 0, zN + 0.1, a.accent); tyreStack(g, 0.0, zN - 0.15, 0, COMPOUND[2]); }
  else { toolChest(g, -0.62, zN, a.color, a.accent); floorJack(g, 0.35, zN + 0.1, a.accent); extinguisher(g, hw - 1.1, zN + 0.05); }
  if (a.w > 5) extinguisher(g, hw - 1.1, zN + 0.1);
  // rincón de ruedas junto a los puestos
  mk(-(hw - 0.5), ZONE_D / 2 - 0.5, 2, 2, 0.8);
  // banda del color del equipo en la pared del fondo / de enfrente (se oculta con la pared)
  const north = a.z < 0, wi = north ? 0 : 2, zw = north ? -FD / 2 + 0.035 : FD / 2 - 0.035;
  const band = box(a.w + 0.1, 0.5, 0.07, mat(a.color, 0.5), a.x, 0.38, zw, false, false);
  const line = box(a.w + 0.1, 0.05, 0.075, mat(a.accent, 0.4), a.x, 0.68, zw, false, false);
  world.add(band, line); wallsReg[wi].decor.push(band, line);
}

/* parrilla de salida: asfalto, bordillos, líneas de la parrilla, línea de meta, semáforo y banderas */
const GX = -8.7;   // x del pórtico de salida
function buildGrid() {
  const gW = FW, gD = GRID_W;
  const ppm = 94.8;
  const tex = canvasTex(2048, 512, (x, w, h) => {
    x.fillStyle = '#2A2E37'; x.fillRect(0, 0, w, h);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 5000; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${(0.03 + r() * 0.05).toFixed(3)})`; x.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 3); }
    const X = (wx) => (wx + gW / 2) * ppm, Z = (wz) => (wz + gD / 2) * ppm;
    // líneas de borde
    x.fillStyle = 'rgba(249,249,249,.9)'; x.fillRect(0, Z(-2.42), w, 6); x.fillRect(0, Z(2.42) - 6, w, 6);
    // línea de meta a cuadros bajo el pórtico
    const sq = 19, x0 = X(GX - 0.2);
    for (let i = 0; i < 28; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#0B0F19' : '#F9F9F9'; x.fillRect(x0 + j * sq, i * sq, sq, sq); }
    // cajones de parrilla (uno por coche) y número de posición
    for (const [k, p] of [['fran', PLACES.fran], ['javi', PLACES.javi]]) {
      const bx = X(p.x - 3.5), bw = 5.4 * ppm, bz = Z(p.z - 1.1), bh = 2.2 * ppm;
      x.strokeStyle = 'rgba(249,249,249,.85)'; x.lineWidth = 5; x.strokeRect(bx, bz, bw, bh);
      x.fillStyle = 'rgba(249,249,249,.85)'; x.font = '700 70px Geist, Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(k === 'fran' ? 'P1' : 'P2', X(p.x + 1.3), Z(p.z) - 0);
    }
  }, 8);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(gW, gD), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.y = 0.016; asphalt.receiveShadow = true; world.add(asphalt);
  // bordillos rojos y blancos (instanciados)
  const kg = new THREE.BoxGeometry(0.6, 0.045, 0.16), N = Math.floor(gW / 0.6);
  const kr = new THREE.InstancedMesh(kg, new THREE.MeshStandardMaterial({ color: '#D91E26', roughness: 0.6 }), N);
  const kw = new THREE.InstancedMesh(kg, new THREE.MeshStandardMaterial({ color: '#F4F4F4', roughness: 0.6 }), N);
  const mx = new THREE.Matrix4(), off = new THREE.Matrix4().makeScale(0, 0, 0); let ir = 0, iw = 0;
  for (const sz of [-1, 1]) for (let i = 0; i < N; i++) {
    mx.makeTranslation(-gW / 2 + 0.3 + i * 0.6, 0.04, sz * (gD / 2 - 0.1));
    if ((i + (sz > 0 ? 1 : 0)) % 2) { if (ir < N) kr.setMatrixAt(ir++, mx); } else if (iw < N) kw.setMatrixAt(iw++, mx);
  }
  for (; ir < N; ir++) kr.setMatrixAt(ir, off); for (; iw < N; iw++) kw.setMatrixAt(iw, off);
  kr.receiveShadow = kw.receiveShadow = true; world.add(kr, kw);

  // pórtico de salida con semáforo (5 columnas × 2 luces; las luces miran a +x, hacia los coches)
  const dk = mat('#10141C', 0.5, 0.4);
  for (const sz of [-2.45, 2.45]) { world.add(box(0.2, 3.6, 0.2, dk, GX, 1.8, sz)); }
  world.add(box(0.34, 0.5, 5.3, dk, GX, 3.35, 0));
  world.add(box(0.36, 0.06, 5.3, mat('#D91E26', 0.5), GX, 3.62, 0, false, false));
  const sign = canvasTex(1024, 96, (x, w, h) => { x.fillStyle = '#0F172A'; x.fillRect(0, 0, w, h); x.fillStyle = '#2563EB'; x.fillRect(0, h - 8, w, 8); x.fillStyle = '#F9F9F9'; x.font = FONT(700, 54); x.textAlign = 'center'; x.textBaseline = 'middle'; if ('letterSpacing' in x) x.letterSpacing = '6px'; x.fillText('GRAN PREMIO OROZCO IMPORT', w / 2, h / 2 - 2); });
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.43), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false })); sp.rotation.y = Math.PI / 2; sp.position.set(GX + 0.176, 3.35, 0); world.add(sp);
  world.add(box(0.24, 0.8, 2.7, dk, GX, 2.6, 0));
  for (const sz of [-1.2, 1.2]) world.add(box(0.06, 0.4, 0.06, dk, GX, 3.05, sz, false, false));
  const zc = [-1.0, -0.5, 0, 0.5, 1.0];
  zc.forEach((z, i) => [2.42, 2.78].forEach((y) => {
    const lm = new THREE.MeshBasicMaterial({ color: '#2A0A0A', toneMapped: false });
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.15, 18), lm); l.rotation.y = Math.PI / 2; l.position.set(GX + 0.125, y, z); world.add(l);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#FF2A1F', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    gl.position.set(GX + 0.3, y, z); gl.scale.set(0.9, 0.9, 1); world.add(gl);
    FL.lights.push({ col: i, m: lm }); FL.glows.push({ col: i, s: gl });
  }));
  OBST.circles.push([GX, -2.45, 0.35], [GX, 2.45, 0.35]);

  // banderas a cuadros en dos mástiles (cuelgan; ondean cuando se cierra una venta)
  const ft = canvasTex(320, 240, (x) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#0B0F19' : '#F9F9F9'; x.fillRect(i * 40, j * 40, 40, 40); } });
  for (const sz of [-1, 1]) {
    const pz = sz * 2.55;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.2, 8), mat('#C3CAD3', 0.35, 0.7)); pole.position.set(GX + 0.6, 1.6, pz); pole.castShadow = true; world.add(pole);
    world.add(box(0.3, 0.08, 0.3, dk, GX + 0.6, 0.04, pz));
    const len = 1.5, hh = 1.1, geo = new THREE.PlaneGeometry(len, hh, 30, 14); geo.translate(len / 2, 0, 0);
    const base = Float32Array.from(geo.attributes.position.array);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: ft, side: THREE.DoubleSide }));
    m.position.set(GX + 0.6, 2.65, pz); m.rotation.y = sz < 0 ? -Math.PI / 2 : Math.PI / 2; m.castShadow = true;
    world.add(m); FL.flags.push({ m, geo, base, len, ph: sz > 0 ? 0 : 1.7 });
    OBST.circles.push([GX + 0.6, pz, 0.3]);
  }
  // confeti (solo visible durante la celebración)
  const NC = 160, cg = new THREE.BufferGeometry(), cp = new Float32Array(NC * 3), cc = new Float32Array(NC * 3);
  const pal = ['#2563EB', '#F9F9F9', '#60A5FA', '#0B0F19', '#F5C518'];
  for (let i = 0; i < NC; i++) { const c = new THREE.Color(pal[i % pal.length]); cc.set([c.r, c.g, c.b], i * 3); }
  cg.setAttribute('position', new THREE.BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const pts = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true }));
  pts.visible = false; pts.frustumCulled = false; world.add(pts);
  FL.conf = { pts, pos: cp, vel: new Float32Array(NC * 3), life: new Float32Array(NC), n: NC };
}

/* muro de boxes: mostrador largo con pantallas, pórtico con cartel y marcador de tiempos (estado del equipo) */
const BOARD = { ctx: null, tex: null, sig: '' };
let lastCounts = { trabajando: 0, libre: 0, esperando: 0, bloqueado: 0, offline: 0 };
function drawBoard() {
  if (!BOARD.ctx) return;
  const d = new Date(), hms = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Madrid' });
  const sig = JSON.stringify([lastCounts, hms, FL.t >= 0, demoOn]); if (sig === BOARD.sig) return; BOARD.sig = sig;
  const c = BOARD.ctx, W = 768, H = 256;
  c.fillStyle = '#080B12'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#2563EB'; c.fillRect(0, 0, W, 8);
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = '#F9F9F9'; c.font = FONT(700, 40); c.fillText('MARCADOR DEL EQUIPO', 22, 62);
  c.fillStyle = '#94A3B8'; c.font = FONT(500, 36, true); c.textAlign = 'right'; c.fillText(hms, W - 22, 62); c.textAlign = 'left';
  const rows = [['trabajando', 'EN PISTA', '#22C55E'], ['esperando', 'BANDERA AMARILLA', '#F59E0B'], ['bloqueado', 'BANDERA ROJA', '#EF4444'], ['libre', 'EN BOX', '#94A3B8']];
  rows.forEach(([k, lab, col], i) => {
    const y = 110 + i * 36;
    c.fillStyle = col; c.fillRect(22, y - 22, 14, 26);
    c.fillStyle = '#E2E8F0'; c.font = FONT(600, 26); c.fillText(lab, 50, y);
    c.fillStyle = '#F9F9F9'; c.font = FONT(700, 30, true); c.textAlign = 'right'; c.fillText(String(lastCounts[k] || 0), 440, y); c.textAlign = 'left';
  });
  if (FL.t >= 0) { c.fillStyle = '#F9F9F9'; c.fillRect(480, 100, 250, 130); for (let i = 0; i < 10; i++) for (let j = 0; j < 5; j++) { if ((i + j) % 2) { c.fillStyle = '#0B0F19'; c.fillRect(480 + i * 25, 100 + j * 26, 25, 26); } } }
  else { c.fillStyle = '#16233A'; for (let i = 0; i < 12; i++) { const h = 20 + ((i * 37) % 70); c.fillRect(480 + i * 21, 230 - h, 15, h); } c.fillStyle = '#2563EB'; c.fillRect(480, 232, 250, 4); }
  BOARD.tex.needsUpdate = true;
}
function buildPitWall() {
  const cx = EXTRA['Muro de boxes'].x, wz = -0.95;
  const navy = mat(ORO.navy, 0.5, 0.2);
  const wall = box(6.7, 0.95, 0.45, navy, cx, 0.475, wz); world.add(wall);
  world.add(box(6.8, 0.07, 0.52, mat('#F4F4F4', 0.4), cx, 0.985, wz));
  world.add(box(6.7, 0.13, 0.02, mat(ORO.blue, 0.4), cx, 0.5, wz + 0.235, false, false));
  world.add(box(6.7, 0.04, 0.02, mat('#F9F9F9', 0.4), cx, 0.3, wz + 0.235, false, false));
  OBST.rects.push([cx - 3.45, cx + 3.45, wz - 0.3, wz + 0.3]);
  // pórtico con cartel
  for (const sx of [-3.35, 3.35]) { world.add(box(0.14, 3.0, 0.14, mat('#10141C', 0.5, 0.4), cx + sx, 1.5, wz - 0.1)); OBST.circles.push([cx + sx, wz - 0.1, 0.3]); }
  world.add(box(6.9, 0.16, 0.2, mat('#10141C', 0.5, 0.4), cx, 3.0, wz - 0.1));
  const sg = canvasTex(1024, 128, (x, w, h) => { x.fillStyle = '#0F172A'; x.fillRect(0, 0, w, h); x.fillStyle = '#2563EB'; x.fillRect(0, 0, w, 10); x.fillStyle = '#F9F9F9'; x.font = FONT(800, 66); x.textAlign = 'center'; x.textBaseline = 'middle'; if ('letterSpacing' in x) x.letterSpacing = '10px'; x.fillText('MURO DE BOXES', w / 2, h / 2 + 4); });
  const sp = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.55), new THREE.MeshBasicMaterial({ map: sg, toneMapped: false })); sp.position.set(cx, 2.65, wz); world.add(sp);
  for (const sx of [-1.7, 0, 1.7]) { world.add(box(0.2, 0.12, 0.16, mat('#10141C', 0.5), cx + sx, 2.88, wz + 0.0)); }
  // marcador de tiempos
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 256; BOARD.ctx = cv.getContext('2d');
  BOARD.tex = new THREE.CanvasTexture(cv); BOARD.tex.colorSpace = THREE.SRGBColorSpace; BOARD.tex.anisotropy = 4;
  world.add(box(3.4, 1.2, 0.08, mat('#0B0F19', 0.5), cx, 1.7, wz - 0.12, false, true));
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0667), new THREE.MeshBasicMaterial({ map: BOARD.tex, toneMapped: false })); bm.position.set(cx, 1.7, wz - 0.075); world.add(bm);
  world.add(box(0.12, 0.62, 0.1, mat('#10141C', 0.5), cx - 1.2, 1.0, wz - 0.12)); world.add(box(0.12, 0.62, 0.1, mat('#10141C', 0.5), cx + 1.2, 1.0, wz - 0.12));
  drawBoard();
}

function buildOffice() {
  // plinto + losa (hormigón de paddock) con filete azul Orozco
  world.add(box(FW + 0.9, 0.5, FD + 0.9, mat('#1E293B', 0.9), 0, -0.55, 0, false, true));
  world.add(box(FW + 0.9, 0.04, FD + 0.9, mat(ORO.blue, 0.45, 0.35), 0, -0.29, 0, false, false));
  const slab = box(FW, 0.3, FD, mat('#8E95A0', 0.92), 0, -0.15, 0, false, true);
  world.add(slab);
  const grid = new THREE.GridHelper(Math.max(FW, FD), 26, 0x7a818c, 0x848b96);
  grid.scale.set(FW / Math.max(FW, FD), 1, FD / Math.max(FW, FD));
  grid.position.y = 0.004; grid.material.transparent = true; grid.material.opacity = 0.45;
  world.add(grid);

  // paredes bajas (estilo corte isométrico)
  const wallM = mat('#D9DDE4', 0.9), capM = mat('#0F172A', 0.6), trimM = mat('#D91E26', 0.4, 0.2);
  const H = WALL_H;
  const back = new THREE.Group();
  back.add(box(FW + 0.9, H, 0.3, wallM, 0, H / 2, 0));
  back.add(box(FW + 0.9, 0.12, 0.38, capM, 0, H + 0.06, 0));
  back.add(box(FW + 0.9, 0.05, 0.04, trimM, 0, 0.1, 0.17, false, false));
  back.position.z = -FD / 2 - 0.15; world.add(back); regWall(back, 0, -1);
  const left = new THREE.Group();
  left.add(box(0.3, H, FD + 0.9, wallM, 0, H / 2, 0));
  left.add(box(0.38, 0.12, FD + 0.9, capM, 0, H + 0.06, 0));
  left.add(box(0.04, 0.05, FD + 0.9, trimM, 0.17, 0.1, 0, false, false));
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
  const plate = box(3.4, 1.0, 0.08, mat('#0F172A', 0.5), -5.2, 2.7, -FD / 2 + 0.04, false, true);
  const edge = box(3.5, 1.1, 0.04, mat(ORO.blue, 0.4, 0.4), -5.2, 2.7, -FD / 2 + 0.015, false, false);
  world.add(plate, edge); wallsReg[0].decor.push(plate, edge);
  new THREE.TextureLoader().load('/logo-blanco.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), m);
    p.position.set(-5.2, 2.7, -FD / 2 + 0.085); world.add(p); wallsReg[0].decor.push(p);
  });

  // pared izquierda: banderines de equipos (solo colores) y ventanas
  const frameCols = ['#D91E26', '#AEB8C4', '#FF8000'];
  [-6, 0, 6].forEach((z, i) => {
    const f = box(0.06, 0.8, 1.5, mat('#0F172A'), -FW / 2 + 0.04, 2.3, z, false, true);
    const c = box(0.04, 0.62, 1.32, mat(frameCols[i], 0.7), -FW / 2 + 0.075, 2.3, z, false, false);
    const st = box(0.045, 0.62, 0.14, mat('#F9F9F9', 0.7), -FW / 2 + 0.08, 2.3, z - 0.3, false, false);
    world.add(f, c, st); wallsReg[1].decor.push(f, c, st);
    if (i < 2) {   // ventanas entre los cuadros
      const wz = z + 3.0;
      const wf = box(0.07, 1.7, 1.5, mat('#0F172A'), -FW / 2 + 0.04, 2.5, wz, false, false);
      const wg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.5, 1.3), new THREE.MeshBasicMaterial({ color: '#BFD9FF', toneMapped: false }));
      wg.position.set(-FW / 2 + 0.075, 2.5, wz);
      world.add(wf, wg); wallsReg[1].decor.push(wf, wg);
    }
  });

  // boxes (zonas)
  for (const [name, a] of Object.entries(AREAS)) buildZone(name, a);
  // sofá de hospitalidad en el box General + mesa auxiliar
  const gz = AREAS['General'];
  const sofa = new THREE.Group(); sofa.position.set(gz.x + 1.4, 0, gz.z + 2.35);
  sofa.add(box(2.4, 0.4, 0.9, mat('#2B3340'), 0, 0.25, 0));
  sofa.add(box(2.4, 0.55, 0.22, mat('#222A36'), 0, 0.6, 0.36));
  sofa.add(box(0.22, 0.55, 0.9, mat('#222A36'), -1.1, 0.5, 0));
  sofa.add(box(0.22, 0.55, 0.9, mat('#222A36'), 1.1, 0.5, 0));
  sofa.add(box(0.5, 0.3, 0.14, mat(gz.color), -0.7, 0.62, 0.1));
  sofa.add(box(0.5, 0.3, 0.14, mat(gz.accent), 0.7, 0.62, 0.1));
  world.add(sofa);
  const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 20), mat('#F2EFE9', 0.5));
  coffee.position.set(gz.x + 1.4, 0.34, gz.z + 1.35); coffee.castShadow = true; coffee.receiveShadow = true; world.add(coffee);
  const cl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), mat('#0F172A')); cl.position.set(gz.x + 1.4, 0.17, gz.z + 1.35); world.add(cl);
  OBST.rects.push([gz.x + 1.4 - 1.5, gz.x + 1.4 + 1.5, gz.z + 2.35 - 0.75, gz.z + 2.35 + 0.75]); OBST.circles.push([gz.x + 1.4, gz.z + 1.35, 0.7]);
  // mesa de estrategia en el box Dirección
  const dz = AREAS['Dirección'];
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 28), mat(mix(dz.color, '#FFFFFF', 0.15), 0.5, 0.2));
  tb.position.set(dz.x + 1.5, 0.74, dz.z + 1.75); tb.castShadow = true; tb.receiveShadow = true; world.add(tb);
  const tl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.72, 12), mat('#0F172A')); tl.position.set(dz.x + 1.5, 0.36, dz.z + 1.75); tl.castShadow = true; world.add(tl);
  OBST.circles.push([dz.x + 1.5, dz.z + 1.75, 1.15]);
  // pared izquierda: muro de neumáticos de repuesto
  for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
    const tz = 5.2 + k * 0.78, tx = -FW / 2 + 0.45 + (r % 2) * 0.0;
    if (r === 0) tyreStack(world, tx, tz, 5, COMPOUND[k % 3], k); 
  }
  OBST.rects.push([-11, -9.95, 4.8, 8.6]);

  buildGrid();
  buildPitWall();
  buildBilling();
}

function floorLabel(text, bg, ink) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 160;
  const ctx = c.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = '800 84px Geist, Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    const w = Math.min(1000, ctx.measureText(text).width + 90);
    ctx.fillStyle = bg; ctx.globalAlpha = 0.96; ctx.beginPath(); ctx.roundRect(512 - w / 2, 14, w, 132, 30); ctx.fill();
    ctx.fillStyle = ink; ctx.globalAlpha = 1; ctx.fillText(text, 512, 84);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  draw();
  if (document.fonts && document.fonts.load) document.fonts.load('800 84px Geist').then(draw).catch(() => {});
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
    /* Bandera a cuadros: venta nueva = aparece un lead terminado más reciente (o más leads terminados) que en la lectura anterior.
       Se compara solo con lo que esta misma consulta ya devuelve (facturacion, fecha_terminado): no hay lecturas nuevas.
       La primera lectura solo fija la referencia (no dispara). */
    const lastTs = (data || []).reduce((mx, r) => Math.max(mx, new Date(r.fecha_terminado).getTime() || 0), 0), nTot = (data || []).length;
    const prevSeen = bill.seen; bill.seen = { last: lastTs, n: nTot };
    if (prevSeen && (lastTs > prevSeen.last || nTot > prevSeen.n) && !demoOn) triggerFlag('Venta nueva en facturación');
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
  for (let k = 0; k < H / 20; k++) for (let q = 0; q < 2; q++) { c.fillStyle = (k + q) % 2 ? '#0B0F19' : '#F9F9F9'; c.fillRect(q * 10, k * 20, 10, 20); }
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
  c.fillStyle = ok ? '#F9F9F9' : '#64748B'; c.fillText(txt, 64, 400);
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
      c.fillStyle = i === 5 ? '#2563EB' : '#33507F'; c.beginPath(); c.roundRect(x, base - h, bw, h, 8); c.fill();
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
  const gold = box(SCR_W + 0.44, SCR_H + 0.44, 0.04, mat(ORO.blue, 0.4, 0.4), SCR_POS.x, SCR_POS.y, zf + 0.02, false, false);
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

/* ───────── Puesto de trabajo + avatar (mecánicos, ingenieros de carrera y pilotos) ───────── */
const SKINS = ['#F2C9A5', '#E3AD84', '#C98F66', '#9A6342', '#F6D9BD'];
const HAIRS = ['#2B2118', '#5A3A22', '#111827', '#A9741F', '#7C4A21', '#3B2F2F'];
const hitMeshes = [];
const telemTex = canvasTex(128, 128, (x, w, h) => {   // pantalla secundaria de telemetría (muro de boxes)
  x.fillStyle = '#0B1220'; x.fillRect(0, 0, w, h);
  const cols = ['#22C55E', '#60A5FA', '#F59E0B'];
  cols.forEach((c, k) => { x.strokeStyle = c; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 32; i++) { const y = 28 + k * 34 + Math.sin(i * 0.55 + k * 2) * 11 + Math.sin(i * 1.3 + k) * 5; i ? x.lineTo(i * 4, y) : x.moveTo(0, y); } x.stroke(); });
});
/* decal de nombre / dorsal para los coches */
function decalPlate(text, fg, bg, w = 512, h = 160) {
  return canvasTex(w, h, (x) => {
    if (bg) { x.fillStyle = bg; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 26); x.fill(); }
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = FONT(800, Math.round(h * 0.62));
    if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillText(text, w / 2, h / 2 + 4);
  });
}
const decalMesh = (tex, w, h, x, y, z, rx, ry, rz) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, rz || 0); return m;
};

/* Coche de F1 con los colores de Orozco Import. Coordenadas locales: el morro mira a -z, el piloto está en (0, ·, 0.7). */
function buildCar(R, who) {
  const car = new THREE.Group(); R.add(car);
  const navy = mat(ORO.navy, 0.35, 0.35), blue = mat(ORO.blue, 0.35, 0.3), white = mat('#F4F6FA', 0.4, 0.2), carbon = mat('#0B0E14', 0.55, 0.3), steel = mat('#9AA3AE', 0.3, 0.7);
  const add = (m) => { m.castShadow = true; m.receiveShadow = true; car.add(m); return m; };
  // fondo plano y difusor
  add(box(1.5, 0.05, 3.7, carbon, 0, 0.1, -0.2, false, true));
  // monocasco
  add(box(0.64, 0.42, 2.7, blue, 0, 0.3, -0.3));
  add(box(0.14, 0.02, 2.7, navy, 0, 0.515, -0.3, false, false));
  // morro cónico (más ancho hacia atrás) y aleta delantera
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.07, 1.9, 14), blue); nose.rotation.x = Math.PI / 2; nose.scale.set(1, 1, 0.62); nose.position.set(0, 0.27, -2.35); add(nose);
  add(box(2.1, 0.03, 0.42, carbon, 0, 0.11, -3.05));
  add(box(2.0, 0.03, 0.26, navy, 0, 0.19, -3.0));
  for (const s of [-1, 1]) add(box(0.04, 0.26, 0.55, white, s * 1.04, 0.2, -3.02));
  // pontones, cubierta del motor y toma de aire
  for (const s of [-1, 1]) {
    add(box(0.46, 0.34, 1.45, blue, s * 0.52, 0.3, 0.1));
    add(box(0.05, 0.12, 1.2, white, s * 0.77, 0.3, 0.1));
  }
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.3, 1.2, 12), blue); eng.rotation.x = Math.PI / 2; eng.scale.set(1, 1, 0.9); eng.position.set(0, 0.52, 1.35); add(eng);
  add(box(0.34, 0.26, 0.4, carbon, 0, 0.76, 0.98));   // toma de aire sobre el casco
  add(box(0.5, 0.03, 0.04, blue, 0, 0.64, 0.8, false, false));
  // alerón trasero
  add(box(1.5, 0.05, 0.38, white, 0, 1.0, 1.95));
  add(box(1.5, 0.04, 0.3, navy, 0, 1.14, 1.93));
  for (const s of [-1, 1]) add(box(0.04, 0.62, 0.55, navy, s * 0.76, 0.86, 1.95));
  add(box(0.08, 0.55, 0.1, carbon, 0, 0.7, 1.9));
  // ruedas (neumático, llanta y banda de compuesto)
  const wheelAt = (x, z, r, wd) => {
    const g = new THREE.Group(); g.position.set(x, r, z); car.add(g);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 22), mat('#14161B', 0.9)); t.rotation.z = Math.PI / 2; t.castShadow = true; t.receiveShadow = true; g.add(t);
    const sgn = Math.sign(x), fx = sgn * (wd / 2 + 0.004);
    const rim = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 18), mat('#C3CAD3', 0.3, 0.8)); rim.position.x = fx; rim.rotation.y = sgn * Math.PI / 2; g.add(rim);
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.64, r * 0.82, 22), new THREE.MeshStandardMaterial({ color: who.compound, roughness: 0.6 })); ring.position.x = fx - sgn * 0.001; ring.rotation.y = sgn * Math.PI / 2; g.add(ring);
    const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.16, 10), blue); hub.position.x = fx + sgn * 0.002; hub.rotation.y = sgn * Math.PI / 2; g.add(hub);
  };
  for (const s of [-1, 1]) { wheelAt(s * 0.9, -2.45, 0.33, 0.34); wheelAt(s * 0.9, 1.35, 0.37, 0.46); }
  // brazos de suspensión
  for (const s of [-1, 1]) for (const z of [-2.45, 1.35]) add(box(0.5, 0.025, 0.05, carbon, s * 0.6, 0.3, z));
  // halo
  const halo = (s) => {
    const cv = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.3, 0.55, 0.98), new THREE.Vector3(s * 0.34, 1.25, 0.8), new THREE.Vector3(s * 0.3, 1.52, 0.3), new THREE.Vector3(s * 0.14, 1.58, -0.12), new THREE.Vector3(0, 1.5, -0.36)]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(cv, 18, 0.024, 6, false), carbon); m.castShadow = true; car.add(m);
  };
  halo(-1); halo(1);
  const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.0, 6), carbon); pil.position.set(0, 1.02, -0.4); pil.rotation.x = 0.12; pil.castShadow = true; car.add(pil);
  // volante
  const sw = new THREE.Group(); sw.position.set(0, 0.7, 0.3); sw.rotation.x = -0.95; car.add(sw);
  sw.add(box(0.34, 0.2, 0.035, carbon, 0, 0, 0)); sw.add(box(0.26, 0.1, 0.02, mat('#2563EB', 0.5), 0, 0.01, -0.02, false, false));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), steel); col.position.set(0, 0.5, 0.2); col.rotation.x = -0.9; car.add(col);
  // decales: nombre y dorsal (lados, capó del motor y morro)
  const nameT = decalPlate(who.name.toUpperCase(), ORO.navy, '#F4F6FA', 512, 150), numT = decalPlate(String(who.number), '#F9F9F9', null, 256, 200), numB = decalPlate(String(who.number), ORO.navy, '#F4F6FA', 256, 160);
  for (const s of [-1, 1]) {
    car.add(decalMesh(nameT, 0.82, 0.24, s * 0.808, 0.33, 0.0, 0, s * Math.PI / 2));
    car.add(decalMesh(numB, 0.3, 0.19, s * 0.808, 0.33, 0.62, 0, s * Math.PI / 2));
    car.add(decalMesh(numB, 0.36, 0.23, s * 0.775, 0.9, 1.95, 0, s * Math.PI / 2));
  }
  car.add(decalMesh(numT, 0.46, 0.36, 0, 0.775, 1.55, -Math.PI / 2, 0, 0).translateY(0));
  // la «mesa»: un monitor sobre el morro (se rellena aparte) – el grupo del monitor lo crea buildStation
  return car;
}

/* casco de piloto/mecánico (mira a -z) y gorra */
function makeHelmet(head, shell, stripe, fadeMats) {
  const g = new THREE.Group(); g.position.y = 0.012;
  const shellM = mat(shell, 0.28, 0.25).clone(), stripeM = mat(stripe, 0.4).clone(), visM = mat('#06080D', 0.12, 0.7).clone();
  fadeMats.push(shellM, stripeM, visM);
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.238, 20, 14), shellM); s.scale.set(1, 1.04, 1.1); s.castShadow = true; g.add(s);
  const st = new THREE.Mesh(new THREE.TorusGeometry(0.241, 0.014, 6, 28), stripeM); st.rotation.y = Math.PI / 2; st.scale.set(1.1, 1.04, 1); g.add(st);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.085, 0.06), visM); vis.position.set(0, 0.035, -0.235); vis.castShadow = true; g.add(vis);
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.07), shellM); chin.position.set(0, -0.085, -0.2); g.add(chin);
  head.add(g); return g;
}
function makeCap(head, color, brim, fadeMats) {
  const g = new THREE.Group();
  const cm = mat(color, 0.6).clone(), bm = mat(brim, 0.6).clone(); fadeMats.push(cm, bm);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), cm); cap.position.y = 0.03; cap.castShadow = true; g.add(cap);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), bm); b.position.set(0, 0.08, -0.26); b.castShadow = true; g.add(b);
  head.add(g); return g;
}

function buildStation(info, slotIdx, zoneName, place) {
  const zone = zoneOf(zoneName), area = zone;
  const car = !!(place && place.kind === 'car'), pit = !!(place && place.kind === 'pit');
  let sx, sz;
  if (place) { sx = place.x - (zone.x || 0); sz = place.z - (zone.z || 0); }
  else { const slots = zone.slots; [sx, sz] = slots[slotIdx % slots.length]; }
  const g = new THREE.Group(); g.position.set((zone.x || 0) + sx, 0, (zone.z || 0) + sz); world.add(g);
  const R = car ? new THREE.Group() : g; if (car) { R.rotation.y = Math.PI / 2; g.add(R); }
  const h = hash(info.agente);
  // paleta del equipo: overol y acentos
  const OV = pit ? { body: ORO.blue, stripe: '#F4F6FA', trim: '#F4F6FA' } : car ? { body: ORO.navy, stripe: ORO.blue, trim: '#F4F6FA' } : { body: area.color, stripe: area.accent, trim: area.ink === '#FFFFFF' ? '#F4F6FA' : '#0F172A' };
  const bench = pit ? ORO.navy : mix(OV.body, '#0F172A', 0.55);

  // mesa de trabajo: banco de taller con paneles del color del equipo (en el coche: el propio monocasco)
  const topM = mat(pit ? '#DCE3EC' : '#2A313D', 0.45, 0.3), dark = mat(bench, 0.5, 0.2);
  if (!car) {
    R.add(box(1.9, 0.06, 0.8, topM, 0, 0.69, 0));
    R.add(box(1.92, 0.025, 0.82, mat(pit ? ORO.blue : OV.stripe, 0.5), 0, 0.665, 0, false, false));
    R.add(box(0.06, 0.66, 0.7, dark, -0.88, 0.33, 0));
    R.add(box(0.06, 0.66, 0.7, dark, 0.88, 0.33, 0));
    R.add(box(1.7, 0.4, 0.04, mat(OV.body, 0.5, 0.2), 0, 0.5, -0.33, true, true));   // panel trasero
    R.add(box(1.7, 0.05, 0.045, mat(pit ? ORO.blue : OV.stripe, 0.5), 0, 0.66, -0.335, false, false));
    R.add(box(0.4, 0.016, 0.14, mat('#0F172A', 0.4), 0, 0.728, 0.12, false, true));        // teclado
    R.add(box(0.07, 0.02, 0.11, mat('#0F172A', 0.4), 0.38, 0.73, 0.14, false, true));      // ratón
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 10), mat(OV.stripe, 0.5)); mug.position.set(-0.7, 0.78, 0.1); mug.castShadow = true; R.add(mug);
    R.add(box(0.28, 0.01, 0.2, mat('#F6F1E4', 0.9), -0.45, 0.724, 0.16, false, true));      // libreta
    if (!pit) { const lw = new THREE.Group(); lw.position.set(0.7, 0.72, -0.05); R.add(lw); wrench(lw, 0, 0.01, 0, 0.7); }
  }

  // monitor (en el coche, sobre el monocasco, delante del piloto)
  const mon = new THREE.Group(); mon.position.set(0, car ? 0.5 : 0.72, car ? -0.55 : -0.2); if (car) { mon.rotation.y = -0.65; mon.scale.setScalar(1.25); } R.add(mon);
  mon.add(box(0.26, 0.02, 0.16, mat('#1E293B', 0.5, 0.2), 0, 0.01, 0));
  mon.add(box(0.05, 0.2, 0.04, mat('#1E293B', 0.5, 0.2), 0, 0.11, 0));
  mon.add(box(0.7, 0.42, 0.035, mat('#0B1220', 0.4, 0.3), 0, 0.42, 0));
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: '#0b0f19', toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), screenMat); screen.position.set(0, 0.42, 0.0185); mon.add(screen);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1), new THREE.MeshBasicMaterial({ map: glowTex, color: '#22C55E', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.set(0, 0.42, 0.06); mon.add(glow);
  if (pit) {   // segunda pantalla de telemetría, inclinada hacia el ingeniero
    for (const s of [-1, 1]) {
      const m2 = new THREE.Group(); m2.position.set(s * 0.66, 0.72, -0.12); m2.rotation.y = -s * 0.4; R.add(m2);
      m2.add(box(0.05, 0.16, 0.04, mat('#1E293B', 0.5, 0.2), 0, 0.08, 0));
      m2.add(box(0.46, 0.34, 0.03, mat('#0B1220', 0.4, 0.3), 0, 0.34, 0));
      const sc2 = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ map: telemTex, toneMapped: false })); sc2.position.set(0, 0.34, 0.0165); m2.add(sc2);
    }
  }
  let carBody = null;
  if (car) carBody = buildCar(R, { name: info.nombre, number: DORSALES[info.agente] ?? '00', compound: info.agente === 'fran' ? '#F5C518' : '#E5342B' });

  // silla / taburete (no hay en el coche: el piloto va en el cockpit)
  const chair = new THREE.Group(); chair.position.set(0, 0, 0.7); R.add(chair);
  if (!car) {
    const cm = mat(mix(OV.body, '#111827', 0.45), 0.7), ca = mat(OV.stripe, 0.4, 0.4);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), cm); seat.position.set(0, 0.42, 0); seat.castShadow = true; seat.receiveShadow = true; chair.add(seat);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), ca); stem.position.y = 0.22; chair.add(stem);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 5), cm); base.position.y = 0.04; base.castShadow = true; chair.add(base);
    const back = box(0.52, 0.56, 0.07, cm, 0, 0.8, 0.34); back.rotation.x = 0.12; chair.add(back);
  }

  // avatar
  const skin = mat(SKINS[h % SKINS.length]).clone(), hairC = HAIRS[(h >>> 3) % HAIRS.length];
  const M = { skin, shirt: mat(OV.body, 0.7).clone(), pants: mat(mix(OV.body, '#000000', 0.12), 0.8).clone(), hair: mat(hairC, 0.85).clone(), acc: mat('#0F172A', 0.5).clone(), dark: mat('#111827', 0.5).clone(), stripe: mat(OV.stripe, 0.55).clone(), trim: mat(OV.trim, 0.55).clone() };
  const fadeMats = [M.skin, M.shirt, M.pants, M.hair, M.acc, M.dark, M.stripe, M.trim];
  const av = new THREE.Group(); av.position.set(0, car ? -0.2 : 0, 0.7); R.add(av);
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
    mk(new THREE.BoxGeometry(0.135, 0.04, 0.135), M.stripe, 0, -0.62, 0, lg);   // franja del peto en la pierna
  }
  // torso
  const torso = new THREE.Group(); hip.add(torso);
  mk(new THREE.CapsuleGeometry(0.19, 0.2, 3, 10), M.shirt, 0, 0.27, 0, torso);
  mk(new THREE.BoxGeometry(0.42, 0.05, 0.36), M.dark, 0, 0.04, 0, torso);                    // cinturón
  mk(new THREE.BoxGeometry(0.4, 0.05, 0.02), M.stripe, 0, 0.42, -0.185, torso);              // banda del pecho
  mk(new THREE.BoxGeometry(0.4, 0.05, 0.02), M.stripe, 0, 0.42, 0.185, torso);               // banda de la espalda
  mk(new THREE.BoxGeometry(0.2, 0.1, 0.02), M.trim, 0, 0.27, 0.19, torso);                   // parche de espalda (sin logo)
  mk(new THREE.BoxGeometry(0.1, 0.07, 0.02), M.trim, 0.1, 0.33, -0.19, torso);               // parche del pecho
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
  // rasgos y complementos
  let capObj = null;
  if (info.human) {
    const fran = info.agente === 'fran';
    mk(new THREE.SphereGeometry(0.03, 8, 8), M.skin, 0, -0.025, -0.19, head);
    for (const ex of [-0.07, 0.07]) mk(new THREE.BoxGeometry(0.07, 0.014, 0.02), M.hair, ex, 0.075, -0.18, head);
    mk(new THREE.BoxGeometry(0.09, 0.016, 0.02), mat('#8B4A45', 0.6), 0, -0.095, fran ? -0.172 : -0.2, head);
    if (!fran) mk(new THREE.BoxGeometry(0.2, 0.09, 0.07), M.hair, 0, -0.115, -0.15, head);   // barba corta
  } else if (pit) {   // ingeniero de carrera / estratega: gorra del equipo + auriculares con micro
    capObj = makeCap(head, info.agente === 'pip' ? ORO.blue : ORO.navy, '#F4F6FA', fadeMats);
    const hm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 18, Math.PI), M.acc); hm.position.y = 0.02; head.add(hm);
    for (const ex of [-0.2, 0.2]) mk(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), M.acc, ex, 0.02, 0, head).rotation.z = Math.PI / 2;
    mk(new THREE.BoxGeometry(0.014, 0.014, 0.16), M.acc, -0.2, -0.05, -0.1, head); mk(new THREE.SphereGeometry(0.022, 8, 8), M.dark, -0.2, -0.05, -0.19, head);
  } else {            // mecánico: gorra del color del box (se cambia por el casco al trabajar)
    capObj = makeCap(head, OV.body, OV.stripe, fadeMats);
    if (info.area === 'Ventas') { // comunicador de boxes
      const hm = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 18, Math.PI), M.acc); hm.position.y = 0.02; head.add(hm);
      for (const ex of [-0.2, 0.2]) mk(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10), M.acc, ex, 0.02, 0, head).rotation.z = Math.PI / 2;
    } else if (info.area === 'Administración' || info.agente === 'tecnologia' || info.area === 'Tecnología') { // gafas
      for (const ex of [-0.075, 0.075]) { const gl = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 14), M.acc); gl.position.set(ex, 0.025, -0.18); head.add(gl); }
    }
  }
  // casco: siempre en los pilotos; los demás solo cuando su estado es «trabajando»
  const helmet = info.human ? makeHelmet(head, info.agente === 'fran' ? ORO.navy : '#F4F6FA', ORO.blue, fadeMats)
    : makeHelmet(head, pit ? ORO.navy : OV.body, pit ? ORO.blue : OV.stripe, fadeMats);
  helmet.visible = !!info.human;
  // brazos
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.25, 0.44, 0); torso.add(sh);
    mk(new THREE.BoxGeometry(0.1, 0.3, 0.1), M.shirt, 0, -0.14, 0, sh);
    mk(new THREE.BoxGeometry(0.108, 0.05, 0.108), M.stripe, 0, -0.04, 0, sh);   // hombrera
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    mk(new THREE.BoxGeometry(0.085, 0.27, 0.085), M.skin, 0, -0.12, 0, el);
    mk(new THREE.BoxGeometry(0.095, 0.09, 0.095), M.dark, 0, -0.23, 0, el);        // guante
    arms.push({ sh, el, side });
  }

  // burbuja de conversación (…) sobre el avatar
  const talk = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexT, transparent: true, opacity: 0, depthWrite: false }));
  talk.position.set(0, 2.05, 0); talk.scale.set(0.01, 0.01, 1); av.add(talk);

  // burbuja de estado
  const bub = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexQ, transparent: true, opacity: 0, depthWrite: false }));
  bub.position.set(0, 1.92, 0.7); bub.scale.set(0.01, 0.01, 1); R.add(bub);

  // anillo de selección
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.25, 40), new THREE.MeshBasicMaterial({ color: ORO.sky, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.03, car ? 0.7 : 0.4); ring.visible = false; ring.renderOrder = 2; R.add(ring);
  if (car) ring.scale.set(1.45, 1.45, 1);

  // zona de clic (invisible)
  const hit = new THREE.Mesh(new THREE.BoxGeometry(car ? 2.3 : 1.9, car ? 1.7 : 2.0, car ? 5.4 : 2.2), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(0, car ? 0.85 : 1.0, car ? -0.8 : 0.5); hit.userData.agente = info.agente; R.add(hit); hitMeshes.push(hit);

  // rack de servidores junto a la mesa de Tecnología (LEDs parpadeantes)
  let obst = [], leds = [];
  if (info.agente === 'tecnologia') {
    const rack = new THREE.Group(); rack.position.set(1.72, 0, -0.1); R.add(rack);
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
  // en el coche, el obstáculo es todo el coche (R girado 90°: local (x,z) → mundo (z,-x))
  if (car) obst = [[-3.5, 1.9, -1.15, 1.15]];

  const dv = car ? new THREE.Vector3(0.7, 0, 0) : new THREE.Vector3(0, 0, 0.7);   // posición del avatar respecto al grupo
  const a = {
    zoneName, obst, leds, key: info.agente, group: g, hip, torso, head, arms, bub, ring, screenMat, glow, fadeMats, faded: false,
    helmet, cap: capObj, car, pit, noDefaultObst: car,
    anchor: new THREE.Vector3(g.position.x + dv.x, 2.2, g.position.z + dv.z),
    focus: new THREE.Vector3(g.position.x + dv.x, 1.0, g.position.z + dv.z - (car ? 0 : 0.2)),
    phase: (h % 628) / 100, human: !!info.human, role: info.rol,
    p: { lean: 0.22, headDown: 0, aS: 0.35, aE: 1.1, aZ: 0.1, mon: 0, type: 0, look: 0, bubble: 0, bubbleKind: 'q' },
    screenColor: new THREE.Color('#0b0f19'),
    tag: null, tagKey: '',
    av, chair, seatedLegs, standLegs, talk, stand: 0, yaw: 0, mv: 0, wph: 0, moving: false, talking: false, talkAmt: 0, q: [], job: null, chairSide: 1,
  };
  if (car) { a.anchorY = 2.2; }
  agents.set(info.agente, a);
  return a;
}

/* Colocación: Fran, Javi, Partner y Pip tienen puesto fijo (PLACES). Los demás ocupan el primer puesto libre
   de su box. Si el box es desconocido o está lleno, va al primer puesto libre de otro box. */
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
  const pl = PLACES[info.agente];
  if (pl) {
    const a = buildStation({ ...info, rol: info.rol || pl.role, area: label }, 0, pl.zone, pl);
    makeTag(a, { ...info, area: label });
    return a;
  }
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
    { const wear = vis.st === 'trabajando'; if (a.helmet && a.helmet.visible !== wear) { a.helmet.visible = wear; if (a.cap) a.cap.visible = !wear; } }
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
  lastCounts = counts;
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
const NAV = { x0: -10.4, x1: 10.4, z0: -9.0, z1: 9.0, c: 0.2 };
let nav = null;
function buildNav() {
  const nx = Math.ceil((NAV.x1 - NAV.x0) / NAV.c), nz = Math.ceil((NAV.z1 - NAV.z0) / NAV.c);
  const blocked = new Uint8Array(nx * nz);
  const rects = OBST.rects.slice(), circles = OBST.circles.slice();   // equipo fijo del paddock (se registra al construirlo)
  for (const a of agents.values()) {
    const p = a.group.position;
    if (!a.noDefaultObst) rects.push([p.x - 1.25, p.x + 1.25, p.z - 0.5, p.z + 0.55], [p.x - 0.4, p.x + 0.4, p.z + 0.4, p.z + 1.05]);
    for (const o of a.obst || []) rects.push([p.x + o[0], p.x + o[1], p.z + o[2], p.z + o[3]]);
  }
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
    const side = (tp.x - zoneOf(j.target.zoneName).x) < 0 ? 1 : -1;
    j.spot = [tp.x + side * 1.4, tp.z + 0.6];
    j.faceYaw = yawTo(tp.x - j.spot[0], tp.z + 0.7 - j.spot[1]);
    return findPath(g.x + a.av.position.x, g.z + a.av.position.z, j.spot[0], j.spot[1]);
  }
  return findPath(g.x + a.av.position.x, g.z + a.av.position.z, g.x, g.z + EXIT_Z);
}
function startJob(a) {
  const ev = a.q.shift(), b = agents.get(ev.para); if (!b || Date.now() - ev.ts > 150000) return;
  a.job = { ev, target: b, ph: 'rise', t: 0, path: null, i: 0 };
  a.chairSide = a.group.position.x - zoneOf(a.zoneName).x < 0 ? 1 : -1;
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
    case 'turn': a.yaw += angDiff(a.yaw, j.faceYaw) * (1 - Math.exp(-dt * 9)); if (j.t > 0.4) { j.ph = 'talk'; j.t = 0; sfx.radio(0.8); } break;
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
    $('cName').textContent = a.name; $('cArea').textContent = a.areaName; $('cSwatch').style.background = ORO.blue;
    const d0 = $('cDetalle'); d0.textContent = a.role; d0.classList.remove('empty'); $('cTime').textContent = 'Equipo de Orozco Import';
    return;
  }
  const vis = a.vis || visualOf(a.key);
  const col = vis.st === 'offline' ? OFFLINE.color : ESTADOS[vis.st].color;
  $('cName').textContent = a.name;
  $('cArea').textContent = a.areaName;
  $('cSwatch').style.background = zoneOf(a.zoneName).color;
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
    setOfflineAll(); bill.state = 'off'; billTs = 0; bill.seen = null; lastUpdate = null; noAccess = false; fetchError = false;
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

/* ───────── Sonido de boxes (WebAudio generado en el navegador: sin archivos ni música con derechos) ───────── */
/* Silenciado por defecto. Solo se activa con el botón «Sonido». Motores, semáforo y radio de equipo sintéticos. */
const sfx = (() => {
  let ctx = null, master = null, on = false, amb = null, nbuf = null;
  const ok = () => on && ctx && ctx.state !== 'closed';
  function env(g, t0, a, d, vol) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function tone(f0, f1, dur, type, vol, delay = 0, cutoff = 0) {
    if (!ok()) return; const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (cutoff) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(master); env(g, t0, Math.min(0.02, dur / 4), dur, vol); o.start(t0); o.stop(t0 + dur + 0.1);
  }
  function noise(dur, freq, q, vol, delay = 0, type = 'bandpass') {
    if (!ok()) return; const t0 = ctx.currentTime + delay;
    if (!nbuf) { nbuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(master); env(g, t0, Math.min(0.03, dur / 4), dur, vol); s.start(t0); s.stop(t0 + dur + 0.1);
  }
  /* motor: dos diente de sierra + armónico, con filtro y subida/bajada de régimen */
  function rev(dur = 2.6, peak = 300, vol = 0.12, delay = 0) {
    if (!ok()) return; const t0 = ctx.currentTime + delay;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(2600, t0 + dur * 0.55); lp.frequency.exponentialRampToValueAtTime(700, t0 + dur);
    const g = ctx.createGain(); lp.connect(g); g.connect(master); env(g, t0, 0.25, dur, vol);
    [[1, 'sawtooth', 1], [2.01, 'sawtooth', 0.55], [0.5, 'square', 0.4]].forEach(([m, ty, v]) => {
      const o = ctx.createOscillator(); o.type = ty; const og = ctx.createGain(); og.gain.value = v;
      o.frequency.setValueAtTime(70 * m, t0); o.frequency.exponentialRampToValueAtTime(peak * m, t0 + dur * 0.55); o.frequency.exponentialRampToValueAtTime(120 * m, t0 + dur);
      o.connect(og); og.connect(lp); o.start(t0); o.stop(t0 + dur + 0.2);
    });
    noise(dur * 0.9, 900, 0.7, vol * 0.5, delay + 0.1);
  }
  function scheduleAmbient() {
    clearTimeout(amb); if (!on) return;
    amb = setTimeout(() => { if (on && !document.hidden) { const r = Math.random(); if (r < 0.55) rev(1.6 + Math.random(), 160 + Math.random() * 120, 0.045); else api.radio(0.6); } scheduleAmbient(); }, 9000 + Math.random() * 14000);
  }
  const api = {
    get on() { return on; },
    async enable() {
      try {
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination); }
        await ctx.resume(); on = true; scheduleAmbient();
        rev(1.6, 220, 0.09);   // confirmación: un ligero acelerón
        return true;
      } catch (e) { on = false; return false; }
    },
    disable() { on = false; clearTimeout(amb); if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); },
    async toggle() { if (on) { api.disable(); return false; } return api.enable(); },
    light(n) { tone(660 + n * 0, 660, 0.22, 'square', 0.07, 0, 2200); },
    go() { rev(3.4, 340, 0.15); tone(523, 523, 0.18, 'triangle', 0.09, 0.9); tone(659, 659, 0.18, 'triangle', 0.09, 1.08); tone(784, 784, 0.45, 'triangle', 0.1, 1.26); },
    radio(v = 1) {   // «squelch» de la radio de equipo + doble pitido de cierre
      noise(0.28, 1700, 1.2, 0.06 * v); tone(1250, 1250, 0.07, 'sine', 0.07 * v, 0.3); tone(950, 950, 0.07, 'sine', 0.07 * v, 0.39);
    },
  };
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else if (on) ctx.resume().catch(() => {}); });
  return api;
})();

/* ───────── Bandera a cuadros: semáforo + banderas + confeti cuando se cierra una venta ───────── */
/* Se dispara con triggerFlag(motivo). En producción lo llama fetchBilling() cuando detecta una venta nueva
   (solo con los datos de facturación que la oficina YA lee). En modo demo se dispara sola o con el botón. */
const flagToast = document.createElement('div'); flagToast.id = 'flagToast'; flagToast.hidden = true; document.body.appendChild(flagToast);
function triggerFlag(why) {
  FL.t = 0; FL.why = (typeof why === 'string' && why) || 'Bandera a cuadros'; FL.lit = 0; FL.conf && (FL.conf.next = 0, FL.conf.spawned = false);
  flagToast.innerHTML = '<span class="chk"></span><b>¡Venta cerrada!</b><span>' + esc(FL.why) + '</span>'; flagToast.hidden = false; flagToast.classList.remove('out');
  sfx.radio(1);
}
const FLAG_LIGHT = { off: new THREE.Color('#2A0A0A'), on: new THREE.Color('#FF2A1F') };
function flagStep(dt, t) {
  const tt = FL.t;
  if (tt >= 0) FL.t += dt;
  let lit = 0;
  if (tt >= 0 && tt < 3.0) lit = Math.min(5, Math.floor(tt / 0.5) + 1);
  const waving = tt >= 3.0 && tt < FLAG_SECONDS;
  if (lit !== FL.lit) {
    if (lit > FL.lit) sfx.light(lit);
    if (lit === 0 && tt >= 3.0 && FL.lit === 5) { sfx.go(); }
    FL.lit = lit;
    for (const l of FL.lights) l.m.color.copy(l.col < lit ? FLAG_LIGHT.on : FLAG_LIGHT.off);
    for (const g of FL.glows) g.s.material.opacity = g.col < lit ? 0.85 : 0;
  }
  FL.amp = damp(FL.amp, waving ? 1 : 0, dt, waving ? 4 : 2.2);
  if (FL.amp > 0.005 || waving || tt >= 0 || FL._was) {
    for (const f of FL.flags) {
      const pos = f.geo.attributes.position, b = f.base, bend = (1 - FL.amp) * 1.3, cb = Math.cos(bend), sb = Math.sin(bend);
      for (let i = 0; i < pos.count; i++) {
        const bx = b[i * 3], by = b[i * 3 + 1], u = bx / f.len;
        const w = Math.sin(bx * 5.2 - t * 8 + f.ph) * 0.14 * u * (0.2 + 0.8 * FL.amp) + Math.sin(bx * 9 - t * 12 + f.ph) * 0.03 * u * FL.amp;
        const wy = Math.sin(bx * 4 - t * 6 + 1.3) * 0.05 * u * FL.amp;
        pos.setXYZ(i, bx * cb + (by + wy) * sb, -bx * sb + (by + wy) * cb, w);
      }
      pos.needsUpdate = true; f.geo.computeVertexNormals();
    }
    FL._was = FL.amp > 0.005;
  }
  // confeti
  const C = FL.conf;
  if (C) {
    if (waving) {
      C.pts.visible = true;
      const want = Math.min(C.n, Math.floor((tt - 3.0) * 70));
      while ((C.next || 0) < want) {
        const i = C.next % C.n; C.next++;
        C.pos[i * 3] = GX + 0.2 + Math.random() * 2.2; C.pos[i * 3 + 1] = 3.4 + Math.random() * 0.6; C.pos[i * 3 + 2] = (Math.random() - 0.5) * 5;
        C.vel[i * 3] = 0.3 + Math.random() * 1.6; C.vel[i * 3 + 1] = 0.6 + Math.random() * 2.2; C.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.2; C.life[i] = 2.6 + Math.random() * 1.8;
      }
    }
    if (C.pts.visible) {
      let alive = 0;
      for (let i = 0; i < C.n; i++) {
        if (C.life[i] <= 0) { C.pos[i * 3 + 1] = -20; continue; }
        C.life[i] -= dt; alive++;
        C.vel[i * 3 + 1] -= 3.2 * dt; C.vel[i * 3] *= 1 - 0.4 * dt; C.vel[i * 3 + 2] *= 1 - 0.4 * dt;
        C.pos[i * 3] += (C.vel[i * 3] + Math.sin(t * 5 + i) * 0.35) * dt; C.pos[i * 3 + 1] += C.vel[i * 3 + 1] * dt; C.pos[i * 3 + 2] += (C.vel[i * 3 + 2] + Math.cos(t * 4 + i) * 0.3) * dt;
        if (C.pos[i * 3 + 1] < 0.05) { C.pos[i * 3 + 1] = 0.05; C.vel[i * 3 + 1] = 0; C.vel[i * 3] *= 0.9; C.life[i] -= dt * 1.5; }
      }
      C.pts.geometry.attributes.position.needsUpdate = true;
      if (!waving && !alive) C.pts.visible = false;
    }
  }
  if (tt >= FLAG_SECONDS) { flagToast.classList.add('out'); }
  if (tt >= FLAG_SECONDS + 1) { FL.t = -1; flagToast.hidden = true; }
}

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
let demoTimer = null, demoFlagTimer = null;
function demoFlagLoop(first) {
  clearTimeout(demoFlagTimer);
  demoFlagTimer = setTimeout(() => { if (!demoOn) return; triggerFlag('Venta simulada (demo)'); demoFlagLoop(false); }, (first ? 9 : DEMO_FLAG_EVERY[0] + Math.random() * (DEMO_FLAG_EVERY[1] - DEMO_FLAG_EVERY[0])) * 1000);
}
function demoStart() {
  const keys = [...agents.values()].filter((a) => !a.human).map((a) => a.key);
  const seq = ['trabajando', 'trabajando', 'esperando', 'bloqueado', 'libre', 'trabajando', 'esperando', 'libre', 'bloqueado'];
  keys.forEach((k, i) => demoSet(k, seq[i % seq.length], Math.floor(Math.random() * 12)));
  // un agente inactivo >24 h para enseñar el desvanecido
  const stale = keys.includes('contabilidad') ? 'contabilidad' : keys[4];
  if (stale) { demoSet(stale, 'libre', 26 * 60); }
  demoEvLoop(true);
  demoFlagLoop(true);
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
  clearInterval(demoTimer); demoTimer = null; clearTimeout(demoEvTimer); demoEvTimer = null; clearTimeout(demoFlagTimer); demoFlagTimer = null; demoData.clear();
  for (const a of agents.values()) a.q.length = 0;
}
$('demo').addEventListener('change', (e) => {
  demoOn = e.target.checked;
  if (demoOn) demoStart(); else demoStop();
  applyAll(); renderBanners(); renderEvLog(); document.body.classList.toggle('demo-on', demoOn);
});
if ($('flagTest')) $('flagTest').addEventListener('click', () => triggerFlag('Prueba de bandera (demo)'));
if ($('sonido')) $('sonido').addEventListener('click', async () => { const on = await sfx.toggle(); $('sonido').setAttribute('aria-pressed', on ? 'true' : 'false'); $('sonido').querySelector('span').textContent = on ? 'Sonido: sí' : 'Sonido: no'; });

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
  flagStep(dt, t);
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
setInterval(() => { secTick++; applyAll(); renderEvLog(); drawBilling(); drawBoard(); if (secTick % 300 === 0) fetchBilling(true); }, 1000);

/* ───────── Arranque ───────── */
buildOffice();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redraws.forEach((f) => f())).catch(() => {});
for (const r of ROSTER) ensureAgent(r);
for (const r of HUMANS) ensureAgent(r);
resize();
{ const v = defaultView(); camera.position.copy(v.pos); controls.target.copy(v.target); controls.update(); }
applyAll(); renderBanners();
requestAnimationFrame(loop);
initData();
window.__oficina = { select: (k) => select(k, true), recentrar, camera, controls, agents, talk: (de, para, tipo) => queueEvent({ de, para, tipo }, true), nav: { findPath, navClear, navFree }, areas: AREAS, ensureAgent, applyAll, bandera: triggerFlag, DORSALES, FL, sfx, view: (k) => view(k) };
