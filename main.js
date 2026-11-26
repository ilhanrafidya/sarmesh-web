import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- page chrome ---------- */
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 10), { passive: true });
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

/* ---------- 3D viewer ---------- */
const NODES = {
  FIELD:   { title: 'Field Node',   text: 'Dibawa petugas di lapangan. Mengirim posisi GPS dan pesan status.' },
  RELAY:   { title: 'Relay Node',   text: 'Meneruskan paket antar node untuk memperluas jangkauan.' },
  COMMAND: { title: 'Command Node', text: 'Di posko. Menerima data dan meneruskannya ke laptop.' },
};

const viewerEl = document.getElementById('viewer');
const canvas = document.getElementById('c3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;

const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 20);
camera.position.set(0.12, 0.08, 0.5);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(0.35, 0.6, 0.55);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -0.3, right: 0.3, top: 0.3, bottom: -0.3, near: 0.05, far: 2 });
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.002;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0x9fc8ff, 1.3); rim.position.set(-0.5, 0.35, -0.6); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.7); fill.position.set(-0.4, 0.1, 0.5); scene.add(fill);
const top = new THREE.DirectionalLight(0xffffff, 0.8); top.position.set(0, 1, 0.1); scene.add(top);
const rim2 = new THREE.DirectionalLight(0xbcd8ff, 1.1); rim2.position.set(0.6, 0.3, -0.5); scene.add(rim2);

// soft floor shadow
const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.45 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 0.12; controls.maxDistance = 1.1;
controls.maxPolarAngle = Math.PI * 0.62;
controls.rotateSpeed = 0.7; controls.zoomSpeed = 0.8;
controls.autoRotate = true; controls.autoRotateSpeed = 0.6;

function resize() {
  const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewerEl); resize();

/* loading */
const draco = new DRACOLoader().setDecoderPath('/vendor/draco/');
const loader = new GLTFLoader().setDRACOLoader(draco);
const loadbar = document.getElementById('loadbar');

let groups = {};            // FIELD/RELAY/COMMAND roots
let parts = {};             // node -> [{obj, p0, p1}]
let current = 'FIELD';
let explodeT = 0, explodeTarget = 0;
let floorY = { FIELD: 0, RELAY: 0, COMMAND: 0 };
let frames = {};            // node -> {center, dist0, dist1}
const tmpBox = new THREE.Box3();

loader.load('/assets/sarmesh.glb', gltf => {
  const root = gltf.scene;
  scene.add(root);
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (m && m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });
  for (const k of Object.keys(NODES)) {
    const g = root.getObjectByName(k);
    groups[k] = g;
    parts[k] = [];
    g.traverse(o => {
      const e = o.userData && o.userData.explode;
      if (!e) return;
      // Blender local (x,y,z) -> glTF local (x, z, -y); values are in mm (parent space)
      const d = new THREE.Vector3(e[0], e[2], -e[1]);
      parts[k].push({ obj: o, p0: o.position.clone(), p1: o.position.clone().add(d) });
    });
  }
  for (const k of Object.keys(NODES)) {
    const mags = parts[k].map(p => p.p1.distanceTo(p.p0));
    const mx = Math.max(...mags) || 1;
    parts[k].forEach((p, i) => { p.delay = (mags[i] / mx); });
  }
  root.updateMatrixWorld(true);
  for (const k of Object.keys(NODES)) frames[k] = computeFrame(k);
  showNode('FIELD', true);
  document.getElementById('loader').classList.add('done');
}, xhr => {
  if (xhr.total) loadbar.style.width = (100 * xhr.loaded / xhr.total) + '%';
}, err => {
  console.error(err);
  document.querySelector('#loader span').textContent = 'Model gagal dimuat. Muat ulang halaman.';
});

// t in 0..1 (linear time). Each part gets its own eased window so layers
// peel off one after another; t=0 and t=1 are exact endpoints.
const STAG = 0.35;
const easeIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function setExplode(k, t, opening = true) {
  for (const p of parts[k]) {
    const d = (opening ? (1 - p.delay) : p.delay) * STAG;
    const local = Math.min(1, Math.max(0, (t - d) / (1 - STAG)));
    p.obj.position.lerpVectors(p.p0, p.p1, easeIO(local));
  }
}
function computeFrame(k) {
  const g = groups[k];
  setExplode(k, 0); g.updateMatrixWorld(true);
  tmpBox.setFromObject(g);
  const c0 = tmpBox.getCenter(new THREE.Vector3()), s0 = tmpBox.getSize(new THREE.Vector3());
  const minY = tmpBox.min.y;
  setExplode(k, 1); g.updateMatrixWorld(true);
  tmpBox.setFromObject(g);
  const c1 = tmpBox.getCenter(new THREE.Vector3()), s1 = tmpBox.getSize(new THREE.Vector3());
  setExplode(k, 0); g.updateMatrixWorld(true);
  c0.y -= s0.length() * 0.06; c1.y -= s1.length() * 0.06;
  return { c0, c1, r0: s0.length() / 2, r1: s1.length() / 2, minY };
}
function fitDist(r) {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const f = Math.min(vfov, hfov);
  return (r / Math.sin(f / 2)) * 1.22;
}

/* camera tween */
let camTween = null;
const DIR_CLOSED = new THREE.Vector3(0.34, 0.2, 1).normalize();
const DIR_OPEN = new THREE.Vector3(1.05, 0.45, 0.95).normalize();
function tweenCam(target, dist, dur = 1100, toDir = null) {
  const fromDir = camera.position.clone().sub(controls.target).normalize();
  camTween = {
    t0: performance.now(), dur,
    fromT: controls.target.clone(), toT: target.clone(),
    fromD: camera.position.distanceTo(controls.target), toD: dist,
    fromDir, dir: toDir ? toDir.clone() : fromDir.clone(),
  };
}
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

function showNode(k, instant) {
  current = k;
  for (const n of Object.keys(groups)) groups[n].visible = n === k;
  // reset explode of others
  for (const n of Object.keys(groups)) if (n !== k) setExplode(n, 0);
  explodeT = explodeTarget; setExplode(k, explodeT);
  floor.position.y = frames[k].minY - 0.0005;
  key.target.position.copy(frames[k].c0);
  const fr = frames[k];
  const c = fr.c0.clone().lerp(fr.c1, explodeTarget);
  const d = fitDist(THREE.MathUtils.lerp(fr.r0, fr.r1, explodeTarget));
  if (instant) {
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(explodeTarget ? DIR_OPEN : DIR_CLOSED, d);
  } else tweenCam(c, d, 1100, explodeTarget ? DIR_OPEN : DIR_CLOSED);
  document.getElementById('niTitle').textContent = NODES[k].title;
  document.getElementById('niText').textContent = NODES[k].text;
  clearPick();
}

/* segmented control */
const seg = document.getElementById('seg'), segInd = document.getElementById('segInd');
function moveInd() {
  const b = seg.querySelector('button.on');
  segInd.style.width = b.offsetWidth + 'px';
  segInd.style.transform = `translateX(${b.offsetLeft - 4}px)`;
}
seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || !groups.FIELD) return;
  seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  moveInd(); showNode(b.dataset.node);
});
addEventListener('resize', moveInd); requestAnimationFrame(moveInd);
document.fonts && document.fonts.ready.then(moveInd);

/* explode button */
const btn = document.getElementById('btnExplode'), btnLabel = document.getElementById('btnLabel');
btn.addEventListener('click', () => {
  if (!groups.FIELD) return;
  explodeTarget = explodeTarget ? 0 : 1;
  btn.classList.toggle('open', !!explodeTarget);
  btnLabel.textContent = explodeTarget ? 'Tutup' : 'Buka';
  const fr = frames[current];
  tweenCam(explodeTarget ? fr.c1 : fr.c0, fitDist(explodeTarget ? fr.r1 : fr.r0), 1700, explodeTarget ? DIR_OPEN : DIR_CLOSED);
  controls.autoRotate = false;
  if (!explodeTarget) clearPick();
});
document.getElementById('btnReset').addEventListener('click', () => {
  if (!groups.FIELD) return;
  const fr = frames[current];
  tweenCam(explodeTarget ? fr.c1 : fr.c0, fitDist(explodeTarget ? fr.r1 : fr.r0), 900, explodeTarget ? DIR_OPEN : DIR_CLOSED);
  clearPick();
});

/* picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const card = document.getElementById('card');
let picked = null, saved = [];
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; controls.autoRotate = false; });
canvas.addEventListener('pointerup', e => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6 || !groups.FIELD) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObject(groups[current], true);
  const hit = hits.find(h => h.object.visible);
  if (!hit) { clearPick(); return; }
  let o = hit.object;
  while (o && !(o.userData && o.userData.label)) o = o.parent;
  if (!o) { clearPick(); return; }
  pick(o);
});
document.getElementById('cardX').addEventListener('click', clearPick);

function pick(o) {
  clearPick(true);
  // group all siblings sharing the same label (e.g. the OLED pieces)
  const label = o.userData.label;
  const targets = [];
  o.parent.children.forEach(s => { if (s.userData && s.userData.label === label) targets.push(s); });
  targets.forEach(t => t.traverse(m => {
    if (!m.isMesh) return;
    saved.push([m, m.material]);
    const mm = m.material.clone();
    if ('emissive' in mm) { mm.emissive = new THREE.Color(0x1a6fff); mm.emissiveIntensity = 0.45; }
    m.material = mm;
  }));
  picked = o;
  document.getElementById('cardK').textContent = NODES[current].title;
  document.getElementById('cardT').textContent = label;
  document.getElementById('cardD').textContent = o.userData.desc || '';
  card.classList.add('show');
}
function clearPick(keepCard) {
  for (const [m, mat] of saved) { m.material.dispose(); m.material = mat; }
  saved = []; picked = null;
  if (!keepCard) card.classList.remove('show');
}

/* hover cursor */
canvas.addEventListener('pointermove', e => {
  if (!groups.FIELD || e.buttons) return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  canvas.style.cursor = ray.intersectObject(groups[current], true).length ? 'pointer' : 'grab';
});

/* render loop (only while visible) */
let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(viewerEl);

function tick(now) {
  requestAnimationFrame(tick);
  if (!visible) return;
  if (groups.FIELD && explodeT !== explodeTarget) {
    const dt = Math.min(0.1, (now - (tick.last || now)) / 1000);
    const step = dt / 1.7; // full open/close in ~1.7 s
    explodeT = explodeTarget > explodeT ? Math.min(1, explodeT + step) : Math.max(0, explodeT - step);
    setExplode(current, explodeT, explodeTarget === 1);
  }
  tick.last = now;
  if (camTween) {
    const k = Math.min(1, (now - camTween.t0) / camTween.dur), e = ease(k);
    controls.target.lerpVectors(camTween.fromT, camTween.toT, e);
    const dir = camTween.fromDir.clone().lerp(camTween.dir, e).normalize();
    const d = THREE.MathUtils.lerp(camTween.fromD, camTween.toD, e);
    camera.position.copy(controls.target).addScaledVector(dir, d);
    if (k >= 1) camTween = null;
  }
  controls.update();
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
