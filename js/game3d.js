(() => {
  'use strict';

  window.__BC3D__ = function (opts) {
    opts = opts || {};
    const THREE = window.THREE;

    const canvas = document.getElementById('game3d');
    const hotbarEl = document.getElementById('hotbar');
    const heartsEl = document.getElementById('hearts');
    const fpsEl = document.getElementById('fps');
    const dmgEl = document.getElementById('dmg');
    const deathEl = document.getElementById('death');
    const btnMode = document.getElementById('btn-mode');
    const btnJump = document.getElementById('btn-jump');
    const btnFly = document.getElementById('btn-fly');
    const joyEl = document.getElementById('joy');
    const knobEl = document.getElementById('joy-knob');

    if (!THREE) {
      if (window.BC && window.BC.toast) window.BC.toast('3D engine failed to load');
      return null;
    }

    const abort = new AbortController();
    const on = (target, type, fn, extra) =>
      target.addEventListener(type, fn, Object.assign({ signal: abort.signal }, extra || {}));

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sfx = (name) => {
      const s = window.BCSound;
      if (s && typeof s[name] === 'function') s[name]();
    };
    const toast = (msg) => {
      if (window.BC && window.BC.toast) window.BC.toast(msg);
    };
    const showFps = () => !!(window.BC && window.BC.settings && window.BC.settings.showFps);

    const T = {
      AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, PLANKS: 6,
      LEAVES: 7, GLASS: 8, WATER: 9, COAL: 10, IRON: 11, BEDROCK: 12
    };
    const SOLID = new Set([
      T.GRASS, T.DIRT, T.STONE, T.SAND, T.WOOD, T.PLANKS,
      T.LEAVES, T.GLASS, T.COAL, T.IRON, T.BEDROCK
    ]);
    const BREAKABLE = new Set([...SOLID].filter((id) => id !== T.BEDROCK));
    const TRANSPARENT = new Set([T.WATER, T.GLASS]);
    const NAMES = {
      1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Sand', 5: 'Wood',
      6: 'Planks', 7: 'Leaves', 8: 'Glass', 9: 'Water',
      10: 'Coal', 11: 'Iron', 12: 'Bedrock'
    };
    const SWATCH = {
      1: '#63a83a', 2: '#7b5230', 3: '#8b8b90', 4: '#e3d59e', 5: '#7b5a33',
      6: '#b58a4f', 7: '#3f8f35', 8: '#a9d9e6', 9: '#2f6ec8',
      10: '#8b8b90', 11: '#8b8b90', 12: '#3b3b41'
    };
    const HARDNESS = {
      1: 0.28, 2: 0.3, 3: 0.55, 4: 0.3, 5: 0.45, 6: 0.35,
      7: 0.12, 8: 0.18, 10: 0.75, 11: 0.85
    };
    const HOTBAR = [T.GRASS, T.DIRT, T.STONE, T.SAND, T.WOOD, T.PLANKS, T.LEAVES, T.GLASS];

    const W = 64;
    const D = 64;
    const H = 48;
    const CHUNK = 16;
    const SEA = 12;
    const SAVE_KEY = 'blockcraft.3d.save.v1';
    const REACH = 6;
    const EYE = 1.62;
    const HALF = 0.3;
    const PH = 1.8;
    const GRAV = 26;
    const WALK = 5.2;
    const FLY = 10;
    const JUMP = 8.6;

    const world = new Uint8Array(W * H * D);
    const inv = {};
    const COLORS = {
      1: { top: [0.42, 0.68, 0.25], side: [0.49, 0.33, 0.20], bottom: [0.42, 0.28, 0.16] },
      2: { side: [0.49, 0.33, 0.20] },
      3: { side: [0.55, 0.55, 0.57] },
      4: { side: [0.89, 0.84, 0.63] },
      5: { top: [0.62, 0.49, 0.29], side: [0.49, 0.36, 0.21], bottom: [0.55, 0.42, 0.25] },
      6: { side: [0.71, 0.55, 0.32] },
      7: { side: [0.25, 0.56, 0.21] },
      8: { side: [0.74, 0.92, 0.96] },
      9: { side: [0.18, 0.43, 0.78] },
      10: { side: [0.42, 0.42, 0.45] },
      11: { side: [0.70, 0.55, 0.38] },
      12: { side: [0.24, 0.24, 0.27] }
    };

    const FACES = [
      { dir: [1, 0, 0], shade: 0.82, corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
      { dir: [-1, 0, 0], shade: 0.78, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
      { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
      { dir: [0, -1, 0], shade: 0.52, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
      { dir: [0, 0, 1], shade: 0.70, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
      { dir: [0, 0, -1], shade: 0.75, corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
    ];

    const player = {
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: -0.12, onGround: false, fly: false
    };
    const input = {
      forward: false, back: false, left: false, right: false,
      turnLeft: false, turnRight: false, jump: false, down: false
    };

    let gamemode = opts.gamemode === 'creative' ? 'creative' : 'survival';
    let selected = 0;
    let mode = 'mine';
    let paused = false;
    let dead = false;
    let hp = 20;
    let raf = 0;
    let seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    let spawn = { x: 0, y: 0, z: 0 };
    let fallPeak = 0;
    let airborne = false;
    let locked = false;
    let mineHeld = false;
    let autoMine = false;
    let mineTarget = null;
    let lastBrokenKey = '';
    let breakCooldown = 0;
    let currentTarget = null;
    let lastSpace = 0;
    let lastJumpTap = 0;
    let joyX = 0;
    let joyY = 0;
    let joyId = null;
    let touchLook = null;
    let saveTimer = 0;
    let elapsed = 0;
    let bobPhase = 0;

    const bi = (x, y, z) => x + W * (z + D * y);
    const inWorld = (x, y, z) => x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D;

    function getB(x, y, z) {
      if (!inWorld(x, y, z)) return T.AIR;
      return world[bi(x, y, z)];
    }
    function put(x, y, z, id) {
      if (!inWorld(x, y, z)) return;
      world[bi(x, y, z)] = id;
    }

    function hash2(x, z, s) {
      let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
    function vnoise(x, z, s) {
      const xi = Math.floor(x), zi = Math.floor(z);
      const xf = x - xi, zf = z - zi;
      const u = xf * xf * (3 - 2 * xf);
      const v = zf * zf * (3 - 2 * zf);
      const a = hash2(xi, zi, s);
      const b = hash2(xi + 1, zi, s);
      const c = hash2(xi, zi + 1, s);
      const d = hash2(xi + 1, zi + 1, s);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    function heightAt(x, z) {
      const n = vnoise(x * 0.055, z * 0.055, seed) * 0.6 +
        vnoise(x * 0.12, z * 0.12, seed + 37) * 0.28 +
        vnoise(x * 0.021, z * 0.021, seed + 91) * 0.12;
      return clamp(Math.round(5 + n * 20), 3, H - 8);
    }
    function surfaceY(x, z) {
      for (let y = H - 1; y >= 0; y--) {
        if (SOLID.has(getB(x, y, z))) return y;
      }
      return 0;
    }

    function generate() {
      world.fill(T.AIR);
      const rand = mulberry32(seed >>> 0);
      for (let x = 0; x < W; x++) {
        for (let z = 0; z < D; z++) {
          const h = heightAt(x, z);
          for (let y = 0; y <= h; y++) {
            let v = T.STONE;
            if (y === 0) v = T.BEDROCK;
            else if (y >= h - 3) v = h <= SEA + 2 ? T.SAND : (y === h ? T.GRASS : T.DIRT);
            else {
              const r = rand();
              if (r < 0.014) v = T.COAL;
              else if (r < 0.022) v = T.IRON;
            }
            world[bi(x, y, z)] = v;
          }
          if (h < SEA) {
            for (let y = h + 1; y <= SEA; y++) world[bi(x, y, z)] = T.WATER;
          }
        }
      }

      const tr = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      for (let i = 0; i < 70; i++) {
        const x = 2 + Math.floor(tr() * (W - 4));
        const z = 2 + Math.floor(tr() * (D - 4));
        const h = heightAt(x, z);
        if (h <= SEA + 2) continue;
        if (getB(x, h, z) !== T.GRASS) continue;
        const th = 4 + Math.floor(tr() * 3);
        for (let y = 1; y <= th; y++) put(x, h + y, z, T.WOOD);
        const top = h + th;
        for (let ly = -1; ly <= 1; ly++) {
          for (let lx = -2; lx <= 2; lx++) {
            for (let lz = -2; lz <= 2; lz++) {
              if (Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
              if (lx * lx + lz * lz > 5 && ly >= 0) continue;
              if (getB(x + lx, top + ly, z + lz) === T.AIR) {
                put(x + lx, top + ly, z + lz, T.LEAVES);
              }
            }
          }
        }
      }

      findSpawn();
    }

    function findSpawn() {
      const cx = Math.floor(W / 2);
      const cz = Math.floor(D / 2);
      let best = null;
      for (let r = 0; r < Math.max(W, D); r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const x = clamp(cx + dx, 2, W - 3);
            const z = clamp(cz + dz, 2, D - 3);
            const h = surfaceY(x, z);
            const top = getB(x, h, z);
            if (h > SEA + 1 && (top === T.GRASS || top === T.SAND) &&
              getB(x, h + 1, z) === T.AIR && getB(x, h + 2, z) === T.AIR) {
              best = { x, z, y: h + 1 };
              break;
            }
          }
          if (best) break;
        }
        if (best) break;
      }
      if (!best) best = { x: cx, z: cz, y: surfaceY(cx, cz) + 1 };
      spawn = { x: best.x + 0.5, y: best.y + 0.02, z: best.z + 0.5 };
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      player.vx = player.vy = player.vz = 0;
      player.yaw = 0;
      player.pitch = -0.12;
      player.onGround = true;
      player.fly = false;
      fallPeak = player.y;
      airborne = false;
    }

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9ed2f0);
    scene.fog = new THREE.Fog(0xc6e4f6, 48, 126);

    const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.05, 320);
    camera.rotation.order = 'YXZ';

    on(window, 'wheel', (e) => {
      if (!playing()) return;
      e.preventDefault();
      camera.fov = clamp(camera.fov + Math.sign(e.deltaY) * 4, 55, 100);
      camera.updateProjectionMatrix();
    }, { passive: false });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x53603f, 0.72));
    const sun = new THREE.DirectionalLight(0xfff3df, 0.52);
    sun.position.set(40, 80, 25);
    scene.add(sun);

    const chunkGroup = new THREE.Group();
    scene.add(chunkGroup);

    const opaqueMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const transMat = new THREE.MeshLambertMaterial({
      vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false
    });

    const highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x101018, transparent: true, opacity: 0.8 })
    );
    highlight.visible = false;
    scene.add(highlight);

    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4f9fe6) },
        bottomColor: { value: new THREE.Color(0xdff2ff) },
        offset: { value: 22 },
        exponent: { value: 0.72 }
      },
      vertexShader: [
        'varying vec3 vWorld;',
        'void main() {',
        '  vec4 world = modelMatrix * vec4(position, 1.0);',
        '  vWorld = world.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 bottomColor;',
        'uniform float offset;',
        'uniform float exponent;',
        'varying vec3 vWorld;',
        'void main() {',
        '  float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;',
        '  gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide,
      depthWrite: false
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(240, 24, 16), skyMat);
    skyDome.renderOrder = -2;
    scene.add(skyDome);

    function glowTexture(inner, mid, outer) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      rg.addColorStop(0, inner);
      rg.addColorStop(0.22, mid);
      rg.addColorStop(0.55, outer);
      rg.addColorStop(1, 'rgba(255, 220, 140, 0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }

    const sunTex = glowTexture('rgba(255,252,230,1)', 'rgba(255,242,180,0.95)', 'rgba(255,224,140,0.25)');
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, transparent: true, depthWrite: false, fog: false
    }));
    sunSprite.position.set(112, 148, -158);
    sunSprite.scale.set(84, 84, 1);
    scene.add(sunSprite);

    function cloudTexture() {
      const c = document.createElement('canvas');
      c.width = 160;
      c.height = 80;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      g.shadowColor = 'rgba(255, 255, 255, 0.85)';
      g.shadowBlur = 10;
      g.fillStyle = 'rgba(255, 255, 255, 0.9)';
      const blobs = [[54, 46, 30, 15], [84, 38, 34, 18], [118, 48, 24, 13], [70, 54, 38, 14]];
      for (const b of blobs) {
        g.beginPath();
        g.ellipse(b[0], b[1], b[2], b[3], 0, 0, Math.PI * 2);
        g.fill();
      }
      return new THREE.CanvasTexture(c);
    }

    const cloudTex = cloudTexture();
    const cloudMat = new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.78, depthWrite: false, fog: false
    });
    const clouds3d = [];
    for (let i = 0; i < 10; i++) {
      const sp = new THREE.Sprite(cloudMat);
      sp.position.set(-90 + Math.random() * 180, 56 + Math.random() * 26, -90 + Math.random() * 180);
      sp.scale.set(32 + Math.random() * 34, 15 + Math.random() * 11, 1);
      sp.userData.speed = 1.1 + Math.random() * 1.6;
      scene.add(sp);
      clouds3d.push(sp);
    }

    const mineOverlay = new THREE.Mesh(
      new THREE.BoxGeometry(1.012, 1.012, 1.012),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
    );
    mineOverlay.visible = false;
    scene.add(mineOverlay);

    const MAX_PARTICLES = 90;
    const particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const particlePool = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const m = new THREE.Mesh(particleGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      m.userData = { vx: 0, vy: 0, vz: 0, life: 0, max: 1, scale: 1, spin: 0 };
      scene.add(m);
      particlePool.push(m);
    }
    let particleCursor = 0;

    const chunkMeshes = new Map();
    const keyOf = (cx, cz) => cx + ',' + cz;

    function faceColor(id, faceIndex, jitter) {
      const c = COLORS[id] || COLORS[T.STONE];
      let base = c.side;
      if (faceIndex === 2) base = c.top || c.side;
      else if (faceIndex === 3) base = c.bottom || c.side;
      const shade = FACES[faceIndex].shade * jitter;
      return [Math.min(1, base[0] * shade), Math.min(1, base[1] * shade), Math.min(1, base[2] * shade)];
    }

    function jitterAt(x, y, z) {
      let h = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(z + 47, 2147483647);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return 0.9 + (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000 * 0.18;
    }

    function buildChunk(cx, cz) {
      const key = keyOf(cx, cz);
      const old = chunkMeshes.get(key);
      if (old) {
        for (const m of old) {
          chunkGroup.remove(m);
          m.geometry.dispose();
        }
        chunkMeshes.delete(key);
      }

      const op = { p: [], n: [], c: [], i: [] };
      const tr = { p: [], n: [], c: [], i: [] };
      const x0 = cx * CHUNK;
      const x1 = Math.min(x0 + CHUNK, W);
      const z0 = cz * CHUNK;
      const z1 = Math.min(z0 + CHUNK, D);

      for (let x = x0; x < x1; x++) {
        for (let z = z0; z < z1; z++) {
          for (let y = 0; y < H; y++) {
            const id = getB(x, y, z);
            if (!id) continue;
            const transparent = TRANSPARENT.has(id);
            const bucket = transparent ? tr : op;
            const jitter = jitterAt(x, y, z);

            for (let f = 0; f < FACES.length; f++) {
              const face = FACES[f];
              const nx = x + face.dir[0];
              const ny = y + face.dir[1];
              const nz = z + face.dir[2];
              const nid = getB(nx, ny, nz);
              let show;
              if (transparent) show = nid === T.AIR;
              else show = nid === T.AIR || TRANSPARENT.has(nid);
              if (!show) continue;

              const col = faceColor(id, f, jitter);
              const base = bucket.p.length / 3;
              for (const corner of face.corners) {
                bucket.p.push(x + corner[0], y + corner[1], z + corner[2]);
                bucket.n.push(face.dir[0], face.dir[1], face.dir[2]);
                bucket.c.push(col[0], col[1], col[2]);
              }
              bucket.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
        }
      }

      const meshes = [];
      if (op.i.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(op.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(op.n, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(op.c, 3));
        geo.setIndex(op.i);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, opaqueMat);
        chunkGroup.add(mesh);
        meshes.push(mesh);
      }
      if (tr.i.length) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(tr.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(tr.n, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(tr.c, 3));
        geo.setIndex(tr.i);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, transMat);
        mesh.renderOrder = 2;
        chunkGroup.add(mesh);
        meshes.push(mesh);
      }
      if (meshes.length) chunkMeshes.set(key, meshes);
    }

    function buildAllChunks() {
      for (const meshes of chunkMeshes.values()) {
        for (const m of meshes) {
          chunkGroup.remove(m);
          m.geometry.dispose();
        }
      }
      chunkMeshes.clear();
      for (let cz = 0; cz < D / CHUNK; cz++) {
        for (let cx = 0; cx < W / CHUNK; cx++) buildChunk(cx, cz);
      }
    }

    function rebuildAround(x, z) {
      const cx = Math.floor(x / CHUNK);
      const cz = Math.floor(z / CHUNK);
      const seen = new Set();
      const doIt = (a, b) => {
        const k = keyOf(a, b);
        if (seen.has(k)) return;
        seen.add(k);
        buildChunk(a, b);
      };
      doIt(cx, cz);
      if (x % CHUNK === 0 && cx > 0) doIt(cx - 1, cz);
      if (x % CHUNK === CHUNK - 1 && cx < W / CHUNK - 1) doIt(cx + 1, cz);
      if (z % CHUNK === 0 && cz > 0) doIt(cx, cz - 1);
      if (z % CHUNK === CHUNK - 1 && cz < D / CHUNK - 1) doIt(cx, cz + 1);
    }

    function setBlock(x, y, z, id) {
      if (!inWorld(x, y, z)) return false;
      world[bi(x, y, z)] = id;
      rebuildAround(x, z);
      return true;
    }

    function isSolidBlock(x, y, z) {
      if (x < 0 || x >= W || z < 0 || z >= D || y < 0) return true;
      if (y >= H) return false;
      return SOLID.has(world[bi(x, y, z)]);
    }

    function collides(x, y, z) {
      const minX = Math.floor(x - HALF);
      const maxX = Math.floor(x + HALF);
      const minY = Math.floor(y);
      const maxY = Math.floor(y + PH - 0.001);
      const minZ = Math.floor(z - HALF);
      const maxZ = Math.floor(z + HALF);
      for (let bx = minX; bx <= maxX; bx++) {
        for (let by = minY; by <= maxY; by++) {
          for (let bz = minZ; bz <= maxZ; bz++) {
            if (isSolidBlock(bx, by, bz)) return true;
          }
        }
      }
      return false;
    }

    function inWater() {
      const x = Math.floor(player.x);
      const z = Math.floor(player.z);
      return getB(x, Math.floor(player.y + 0.2), z) === T.WATER ||
        getB(x, Math.floor(player.y + 1.0), z) === T.WATER;
    }

    function damage(amount) {
      if (gamemode === 'creative' || dead || amount <= 0) return;
      hp = Math.max(0, hp - amount);
      updateHearts();
      dmgEl.classList.remove('show');
      void dmgEl.offsetWidth;
      dmgEl.classList.add('show');
      if (hp <= 0) die();
      else sfx('hurt');
    }

    function die() {
      dead = true;
      stopMining();
      sfx('death');
      deathEl.classList.remove('hidden');
      if (locked && document.exitPointerLock) document.exitPointerLock();
    }

    function updatePlayer(dt) {
      const water = inWater();
      const speed = player.fly ? FLY : (water ? WALK * 0.62 : WALK);

      const turn = 2.3 * dt;
      if (input.turnLeft) player.yaw += turn;
      if (input.turnRight) player.yaw -= turn;

      let mx = joyX;
      let mz = -joyY;
      if (input.right) mx += 1;
      if (input.left) mx -= 1;
      if (input.forward) mz += 1;
      if (input.back) mz -= 1;
      if (Math.abs(mx) < 0.14) mx = 0;
      if (Math.abs(mz) < 0.14) mz = 0;
      const mlen = Math.hypot(mx, mz);
      if (mlen > 1) { mx /= mlen; mz /= mlen; }

      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const vx = (mx * cos + mz * -sin) * speed;
      const vz = (mx * -sin + mz * -cos) * speed;

      if (player.fly) {
        let vy = 0;
        if (input.jump) vy += FLY;
        if (input.down) vy -= FLY;
        player.vy = vy;
      } else if (water) {
        player.vy -= GRAV * 0.22 * dt;
        if (player.vy < -3.2) player.vy = -3.2;
        if (input.jump) player.vy = 3.4;
      } else {
        player.vy -= GRAV * dt;
        if (player.vy < -32) player.vy = -32;
        if (input.jump && player.onGround) {
          player.vy = JUMP;
          player.onGround = false;
          airborne = true;
          fallPeak = player.y;
          sfx('jump');
        }
      }

      player.onGround = false;

      const maxMove = Math.max(Math.abs(vx), Math.abs(player.vy), Math.abs(vz)) * dt;
      const steps = clamp(Math.ceil(maxMove / 0.35), 1, 10);
      const sdt = dt / steps;
      let landed = false;

      for (let s = 0; s < steps; s++) {
        const nx = player.x + vx * sdt;
        if (!collides(nx, player.y, player.z)) player.x = nx;

        const nz = player.z + vz * sdt;
        if (!collides(player.x, player.y, nz)) player.z = nz;

        const ny = player.y + player.vy * sdt;
        if (!collides(player.x, ny, player.z)) {
          player.y = ny;
        } else {
          if (player.vy < 0) {
            player.onGround = true;
            landed = true;
          }
          player.vy = 0;
        }
      }

      if (!water) {
        if (player.onGround) {
          if (airborne) {
            const dist = fallPeak - player.y;
            if (!player.fly && dist > 3.6) {
              damage(Math.floor((dist - 3.6) * 2) + 1);
            }
            if (dist > 1.5) sfx('land');
            airborne = false;
          }
          fallPeak = player.y;
        } else {
          if (!airborne) { airborne = true; fallPeak = player.y; }
          else if (player.y > fallPeak) fallPeak = player.y;
        }
      } else {
        airborne = false;
        fallPeak = player.y;
      }

      if (landed && player.fly) player.onGround = true;

      if (player.y < -20) respawn();

      camera.position.set(player.x, player.y + EYE, player.z);
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;
      camera.rotation.z = 0;
    }

    const raycaster = new THREE.Raycaster();
    const screenCenter = new THREE.Vector2(0, 0);

    function updateTargeting() {
      if (!playing()) {
        currentTarget = null;
        highlight.visible = false;
        return;
      }
      scene.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(screenCenter, camera);
      raycaster.far = REACH;
      const hits = raycaster.intersectObjects(chunkGroup.children, false);
      let hit = null;
      for (const h of hits) {
        if (h.distance <= REACH) { hit = h; break; }
      }
      if (!hit) {
        currentTarget = null;
        highlight.visible = false;
        return;
      }
      const n = hit.face ? hit.face.normal : new THREE.Vector3(0, 1, 0);
      const q = hit.point.clone().addScaledVector(n, -0.5);
      const bx = Math.floor(q.x);
      const by = Math.floor(q.y);
      const bz = Math.floor(q.z);
      currentTarget = {
        x: bx, y: by, z: bz,
        px: bx + Math.round(n.x),
        py: by + Math.round(n.y),
        pz: bz + Math.round(n.z)
      };
      highlight.position.set(bx + 0.5, by + 0.5, bz + 0.5);
      highlight.visible = true;
    }

    function keyOfBlock(t) {
      return t.x + ',' + t.y + ',' + t.z;
    }

    function spawnBlockParticles(x, y, z, id, count, power) {
      const base = COLORS[id] || COLORS[T.STONE];
      const col = base.top || base.side || [0.5, 0.5, 0.5];
      for (let i = 0; i < count; i++) {
        const p = particlePool[particleCursor++ % MAX_PARTICLES];
        const u = p.userData;
        const a = Math.random() * Math.PI * 2;
        const sp = (1.4 + Math.random() * 2.8) * power;
        p.material.color.setRGB(col[0], col[1], col[2]);
        p.material.opacity = 1;
        p.position.set(
          x + (Math.random() - 0.5) * 0.72,
          y + (Math.random() - 0.5) * 0.72,
          z + (Math.random() - 0.5) * 0.72
        );
        u.vx = Math.cos(a) * sp;
        u.vz = Math.sin(a) * sp;
        u.vy = (1.2 + Math.random() * 2.2) * power;
        u.life = u.max = 0.34 + Math.random() * 0.34;
        u.scale = 0.55 + Math.random() * 0.85;
        u.spin = (Math.random() - 0.5) * 11;
        p.rotation.set(0, 0, 0);
        p.scale.setScalar(u.scale);
        p.visible = true;
      }
    }

    function updateBlockParticles(dt) {
      for (const p of particlePool) {
        if (!p.visible) continue;
        const u = p.userData;
        u.life -= dt;
        if (u.life <= 0) {
          p.visible = false;
          continue;
        }
        u.vy -= 22 * dt;
        p.position.x += u.vx * dt;
        p.position.y += u.vy * dt;
        p.position.z += u.vz * dt;
        p.rotation.x += u.spin * dt;
        p.rotation.y += u.spin * 0.6 * dt;
        p.material.opacity = Math.max(0, Math.min(1, (u.life / u.max) * 1.5));
        p.scale.setScalar(u.scale * Math.max(0.3, u.life / u.max));
      }
    }

    function blockOverlapsPlayer(x, y, z) {
      return x < player.x + HALF && x + 1 > player.x - HALF &&
        y < player.y + PH && y + 1 > player.y &&
        z < player.z + HALF && z + 1 > player.z - HALF;
    }

    function breakBlock(x, y, z) {
      const id = getB(x, y, z);
      if (!BREAKABLE.has(id)) return false;
      spawnBlockParticles(x + 0.5, y + 0.5, z + 0.5, id, 12, 1);
      setBlock(x, y, z, T.AIR);
      if (gamemode === 'survival' && HOTBAR.includes(id)) {
        inv[id] = (inv[id] || 0) + 1;
        updateHotbar();
      }
      sfx('break');
      scheduleSave();
      return true;
    }

    function placeBlock() {
      const t = currentTarget;
      if (!t) return;
      const { px, py, pz } = t;
      if (!inWorld(px, py, pz)) return;
      const cur = getB(px, py, pz);
      if (cur !== T.AIR && cur !== T.WATER) return;
      if (blockOverlapsPlayer(px, py, pz)) return;
      const id = HOTBAR[selected];
      if (gamemode === 'survival' && !(inv[id] > 0)) {
        toast('No ' + NAMES[id] + ' — mine some first');
        return;
      }
      setBlock(px, py, pz, id);
      spawnBlockParticles(px + 0.5, py + 0.5, pz + 0.5, id, 6, 0.55);
      if (gamemode === 'survival') {
        inv[id] = Math.max(0, (inv[id] || 0) - 1);
        updateHotbar();
      }
      sfx('place');
      scheduleSave();
    }

    function updateMining(dt) {
      if (breakCooldown > 0) breakCooldown -= dt;
      if (!mineHeld || !currentTarget) {
        if (!mineHeld) mineTarget = null;
        return;
      }
      const t = currentTarget;
      const key = keyOfBlock(t);

      if (gamemode === 'creative') {
        if (breakCooldown > 0) return;
        if (key === lastBrokenKey && getB(t.x, t.y, t.z) === T.AIR) return;
        if (breakBlock(t.x, t.y, t.z)) {
          breakCooldown = 0.1;
          lastBrokenKey = key;
          if (autoMine) { mineHeld = false; autoMine = false; }
        }
        return;
      }

      if (!mineTarget || mineTarget.x !== t.x || mineTarget.y !== t.y || mineTarget.z !== t.z) {
        mineTarget = { x: t.x, y: t.y, z: t.z, progress: 0 };
      }
      const id = getB(t.x, t.y, t.z);
      if (!BREAKABLE.has(id)) { mineTarget = null; return; }
      mineTarget.progress += dt / (HARDNESS[id] || 0.4);
      if (mineTarget.progress >= 1) {
        breakBlock(t.x, t.y, t.z);
        mineTarget = null;
        if (autoMine) { mineHeld = false; autoMine = false; }
      }
    }

    function stopMining() {
      mineHeld = false;
      autoMine = false;
      mineTarget = null;
      lastBrokenKey = '';
    }

    function selectSlot(i) {
      const next = clamp(i | 0, 0, HOTBAR.length - 1);
      if (next !== selected) sfx('select');
      selected = next;
      [...hotbarEl.children].forEach((el, k) => {
        el.classList.toggle('sel', k === selected);
        el.setAttribute('aria-pressed', k === selected ? 'true' : 'false');
      });
    }

    function buildHotbar() {
      hotbarEl.innerHTML = '';
      HOTBAR.forEach((id, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.innerHTML =
          '<span class="sw" style="background:' + SWATCH[id] + '"></span>' +
          '<span class="n">' + NAMES[id] + '</span>' +
          '<span class="key">' + (i + 1) + '</span>' +
          '<span class="cnt" hidden></span>';
        b.setAttribute('aria-label', 'Select ' + NAMES[id]);
        b.addEventListener('click', () => selectSlot(i));
        hotbarEl.appendChild(b);
      });
      selectSlot(selected);
      updateHotbar();
    }

    function updateHotbar() {
      [...hotbarEl.children].forEach((el, i) => {
        const cnt = el.querySelector('.cnt');
        if (!cnt) return;
        const id = HOTBAR[i];
        if (gamemode === 'survival') {
          const n = inv[id] || 0;
          cnt.hidden = false;
          cnt.textContent = String(n);
          cnt.classList.toggle('zero', n === 0);
        } else {
          cnt.hidden = true;
        }
      });
    }

    function updateHearts() {
      heartsEl.innerHTML = '';
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('span');
        s.className = 'heart';
        const full = hp >= (i + 1) * 2;
        const half = !full && hp >= i * 2 + 1;
        if (full) s.classList.add('full');
        else if (half) s.classList.add('half');
        s.textContent = '\u2665';
        heartsEl.appendChild(s);
      }
    }

    function setGamemode(m) {
      gamemode = m === 'creative' ? 'creative' : 'survival';
      if (gamemode === 'creative') {
        hp = 20;
        dead = false;
        deathEl.classList.add('hidden');
      } else {
        player.fly = false;
      }
      document.body.classList.toggle('survival', gamemode === 'survival');
      document.body.classList.toggle('creative', gamemode === 'creative');
      updateHearts();
      updateHotbar();
    }

    function getInventory() {
      const out = {};
      for (const id of HOTBAR) out[id] = inv[id] || 0;
      return out;
    }

    function craft(cost, result) {
      if (!cost || !result) return false;
      if (gamemode === 'survival') {
        for (const id in cost) {
          if ((inv[id] || 0) < cost[id]) return false;
        }
        for (const id in cost) inv[id] = (inv[id] || 0) - cost[id];
      }
      for (const id in result) inv[id] = (inv[id] || 0) + result[id];
      updateHotbar();
      save(true);
      return true;
    }

    function setMode(m) {
      mode = m;
      btnMode.textContent = m === 'mine' ? 'Mine' : 'Place';
      btnMode.classList.toggle('place', m === 'place');
      stopMining();
    }

    function toggleFly() {
      if (gamemode !== 'creative') {
        toast('Flying is a creative-mode ability');
        return;
      }
      player.fly = !player.fly;
      player.vy = 0;
      if (player.fly) player.onGround = false;
      toast(player.fly ? 'Flying on' : 'Flying off');
    }

    function respawn() {
      hp = 20;
      dead = false;
      deathEl.classList.add('hidden');
      player.x = spawn.x;
      player.y = spawn.y;
      player.z = spawn.z;
      player.vx = player.vy = player.vz = 0;
      player.fly = false;
      player.onGround = true;
      fallPeak = player.y;
      airborne = false;
      updateHearts();
    }

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save(true), 500);
    }

    function save(silent) {
      clearTimeout(saveTimer);
      saveTimer = 0;
      const rle = [];
      let cur = world[0];
      let count = 0;
      for (let i = 0; i < world.length; i++) {
        const v = world[i];
        if (v === cur) count++;
        else { rle.push(cur, count); cur = v; count = 1; }
      }
      rle.push(cur, count);
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
          v: 1, w: W, h: H, d: D, rle,
          px: player.x, py: player.y, pz: player.z,
          yaw: player.yaw, pitch: player.pitch,
          hp, inv
        }));
      } catch (err) {
        if (!silent) toast('Could not save (storage full?)');
        return;
      }
      if (!silent) toast('Saved');
    }

    function load() {
      let raw;
      try { raw = localStorage.getItem(SAVE_KEY); } catch (err) { return false; }
      if (!raw) return false;
      let d;
      try { d = JSON.parse(raw); } catch (err) { return false; }
      if (!d || d.v !== 1 || d.w !== W || d.h !== H || d.d !== D || !Array.isArray(d.rle)) return false;
      let i = 0;
      for (let k = 0; k < d.rle.length; k += 2) {
        const id = d.rle[k] | 0;
        const n = d.rle[k + 1] | 0;
        if (id < 0 || id > 12 || n < 0) return false;
        for (let j = 0; j < n && i < world.length; j++) world[i++] = id;
      }
      if (i !== world.length) return false;
      player.x = Number(d.px) || spawn.x;
      player.y = Number(d.py) || spawn.y;
      player.z = Number(d.pz) || spawn.z;
      player.yaw = Number(d.yaw) || 0;
      player.pitch = clamp(Number(d.pitch) || 0, -1.55, 1.55);
      player.vx = player.vy = player.vz = 0;
      hp = typeof d.hp === 'number' ? clamp(d.hp | 0, 0, 20) : 20;
      if (d.inv && typeof d.inv === 'object') {
        for (const id of HOTBAR) inv[id] = Math.max(0, d.inv[id] | 0);
      }
      spawn = { x: player.x, y: player.y, z: player.z };
      fallPeak = player.y;
      airborne = false;
      return true;
    }

    function newWorld() {
      seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
      generate();
      for (const id of HOTBAR) inv[id] = 0;
      hp = 20;
      dead = false;
      deathEl.classList.add('hidden');
      updateHearts();
      updateHotbar();
      buildAllChunks();
      save(true);
      toast('New world generated');
    }

    const playing = () => document.body.classList.contains('playing') && !paused && !dead;

    function requestLock() {
      if (canvas.requestPointerLock) {
        try { canvas.requestPointerLock(); } catch (err) {}
      }
    }

    on(document, 'pointerlockchange', () => {
      const wasLocked = locked;
      locked = document.pointerLockElement === canvas;
      if (!locked) {
        stopMining();
        if (wasLocked && playing() && window.BC && typeof window.BC.openMenu === 'function') {
          window.BC.openMenu();
        }
      }
    });

    on(canvas, 'contextmenu', (e) => e.preventDefault());

    on(canvas, 'pointerdown', (e) => {
      if (!playing()) return;
      if (e.pointerType === 'mouse') {
        if (!locked) { requestLock(); return; }
        if (e.button === 0) {
          mineHeld = true;
          mineTarget = null;
          lastBrokenKey = '';
        } else if (e.button === 2) {
          placeBlock();
        }
        return;
      }
      touchLook = {
        id: e.pointerId,
        lx: e.clientX, ly: e.clientY, moved: 0
      };
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      e.preventDefault();
    });

    on(canvas, 'pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (!playing() || !locked) return;
        const sens = (window.BC && window.BC.settings && window.BC.settings.sens) || 1;
        const inv = window.BC && window.BC.settings && window.BC.settings.invertY;
        player.yaw -= e.movementX * 0.0024 * sens;
        player.pitch = clamp(player.pitch - e.movementY * 0.0024 * sens * (inv ? -1 : 1), -1.55, 1.55);
        return;
      }
      if (!touchLook || touchLook.id !== e.pointerId) return;
      const dx = e.clientX - touchLook.lx;
      const dy = e.clientY - touchLook.ly;
      touchLook.lx = e.clientX;
      touchLook.ly = e.clientY;
      touchLook.moved += Math.abs(dx) + Math.abs(dy);
      if (touchLook.moved > 12) {
        const sens = (window.BC && window.BC.settings && window.BC.settings.sens) || 1;
        player.yaw -= dx * 0.005 * sens;
        player.pitch = clamp(player.pitch - dy * 0.005 * sens, -1.55, 1.55);
      }
      e.preventDefault();
    });

    on(canvas, 'pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 0) mineHeld = false;
        return;
      }
      if (!touchLook || touchLook.id !== e.pointerId) return;
      const tap = touchLook.moved <= 12;
      touchLook = null;
      if (!tap) return;
      if (mode === 'place') {
        placeBlock();
      } else {
        mineHeld = true;
        autoMine = true;
        mineTarget = null;
      }
    });

    on(canvas, 'pointercancel', () => {
      touchLook = null;
      stopMining();
    });

    on(window, 'keydown', (e) => {
      if (!document.body.classList.contains('playing')) return;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': input.forward = true; e.preventDefault(); break;
        case 'KeyS': case 'ArrowDown': input.back = true; e.preventDefault(); break;
        case 'KeyA': input.left = true; e.preventDefault(); break;
        case 'KeyD': input.right = true; e.preventDefault(); break;
        case 'ArrowLeft': input.turnLeft = true; e.preventDefault(); break;
        case 'ArrowRight': input.turnRight = true; e.preventDefault(); break;
        case 'ShiftLeft': case 'ShiftRight': input.down = true; break;
        case 'Space':
          if (!e.repeat) {
            const now = performance.now();
            if (gamemode === 'creative' && now - lastSpace < 320) toggleFly();
            lastSpace = now;
            input.jump = true;
          }
          e.preventDefault();
          break;
        default: break;
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
    });

    on(window, 'keyup', (e) => {
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': input.forward = false; break;
        case 'KeyS': case 'ArrowDown': input.back = false; break;
        case 'KeyA': input.left = false; break;
        case 'KeyD': input.right = false; break;
        case 'ArrowLeft': input.turnLeft = false; break;
        case 'ArrowRight': input.turnRight = false; break;
        case 'ShiftLeft': case 'ShiftRight': input.down = false; break;
        case 'Space': input.jump = false; break;
        default: break;
      }
    });

    on(window, 'blur', () => {
      input.forward = input.back = input.left = input.right = input.jump = input.down = false;
      input.turnLeft = input.turnRight = false;
      stopMining();
    });

    function bindHold(el, down, up) {
      on(el, 'pointerdown', (e) => {
        e.preventDefault();
        down();
      });
      on(el, 'pointerup', (e) => {
        e.preventDefault();
        up();
      });
      on(el, 'pointercancel', up);
      on(el, 'pointerleave', up);
    }

    bindHold(btnJump, () => {
      input.jump = true;
      const now = performance.now();
      if (gamemode === 'creative' && now - lastJumpTap < 320) toggleFly();
      lastJumpTap = now;
    }, () => { input.jump = false; });

    on(btnFly, 'click', () => { sfx('ui'); toggleFly(); });
    on(btnMode, 'click', () => {
      sfx('ui');
      setMode(mode === 'mine' ? 'place' : 'mine');
    });

    function resetJoy() {
      joyId = null;
      joyX = 0;
      joyY = 0;
      knobEl.style.transform = '';
    }
    function moveJoy(e) {
      const r = joyEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const max = r.width / 2 - 26;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      knobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      joyX = dx / max;
      joyY = dy / max;
    }
    on(joyEl, 'pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      if (joyEl.setPointerCapture) {
        try { joyEl.setPointerCapture(e.pointerId); } catch (err) {}
      }
      moveJoy(e);
    });
    on(joyEl, 'pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      e.preventDefault();
      moveJoy(e);
    });
    on(joyEl, 'pointerup', (e) => {
      if (e.pointerId === joyId) resetJoy();
    });
    on(joyEl, 'pointercancel', resetJoy);

    on(window, 'pagehide', () => save(true));
    on(document, 'visibilitychange', () => {
      if (document.hidden) save(true);
    });

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    on(window, 'resize', resize);
    on(window, 'orientationchange', () => setTimeout(resize, 150));

    let last = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt;

      if (!paused && !dead) {
        updatePlayer(dt);
        updateTargeting();
        updateMining(dt);
        updateBlockParticles(dt);

        const moving = input.forward || input.back || input.left || input.right;
        if (player.onGround && !player.fly && moving) {
          bobPhase += dt * 10;
          camera.position.y += Math.sin(bobPhase) * 0.045;
        } else {
          bobPhase = 0;
        }

        if (mineTarget && getB(mineTarget.x, mineTarget.y, mineTarget.z) !== T.AIR) {
          mineOverlay.visible = true;
          mineOverlay.position.set(mineTarget.x + 0.5, mineTarget.y + 0.5, mineTarget.z + 0.5);
          mineOverlay.material.opacity = Math.min(0.42, mineTarget.progress * 0.5);
        } else {
          mineOverlay.visible = false;
        }
        if (highlight.visible) {
          highlight.material.opacity = 0.62 + 0.28 * Math.sin(elapsed * 6);
        }

        for (const c of clouds3d) {
          c.position.x += c.userData.speed * dt;
          if (c.position.x > 112) c.position.x = -112;
        }
      } else {
        highlight.visible = false;
        mineOverlay.visible = false;
      }

      if (paused || dead) {
        camera.position.set(player.x, player.y + EYE, player.z);
        camera.rotation.y = player.yaw;
        camera.rotation.x = player.pitch;
      }

      renderer.render(scene, camera);

      if (showFps()) {
        fpsAccum += dt;
        fpsFrames++;
        if (fpsAccum >= 0.5) {
          fpsEl.textContent = Math.round(fpsFrames / fpsAccum) + ' fps';
          fpsAccum = 0;
          fpsFrames = 0;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    document.body.classList.remove('dim-2d');
    document.body.classList.add('dim-3d');
    btnFly.classList.remove('hidden');

    resize();
    generate();
    load();
    buildAllChunks();
    buildHotbar();
    setMode('mine');
    setGamemode(gamemode);
    if (hp <= 0) { hp = 20; dead = false; }
    deathEl.classList.add('hidden');
    updateHearts();
    camera.position.set(player.x, player.y + EYE, player.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    raf = requestAnimationFrame(frame);

    return {
      destroy() {
        abort.abort();
        cancelAnimationFrame(raf);
        save(true);
        if (locked && document.exitPointerLock) document.exitPointerLock();
        for (const meshes of chunkMeshes.values()) {
          for (const m of meshes) {
            chunkGroup.remove(m);
            m.geometry.dispose();
          }
        }
        chunkMeshes.clear();
        highlight.geometry.dispose();
        highlight.material.dispose();
        skyDome.geometry.dispose();
        skyMat.dispose();
        sunTex.dispose();
        sunSprite.material.dispose();
        cloudTex.dispose();
        cloudMat.dispose();
        mineOverlay.geometry.dispose();
        mineOverlay.material.dispose();
        particleGeo.dispose();
        for (const p of particlePool) p.material.dispose();
        opaqueMat.dispose();
        transMat.dispose();
        renderer.dispose();
        hotbarEl.innerHTML = '';
        heartsEl.innerHTML = '';
        document.body.classList.remove('survival', 'creative');
        btnFly.classList.add('hidden');
        fpsEl.textContent = '';
        stopMining();
      },
      pause() {
        paused = true;
        save(true);
        stopMining();
        input.forward = input.back = input.left = input.right = input.jump = input.down = false;
        input.turnLeft = input.turnRight = false;
        resetJoy();
        if (locked && document.exitPointerLock) document.exitPointerLock();
      },
      resume() {
        paused = false;
        last = performance.now();
      },
      save,
      newWorld,
      setGamemode,
      respawn,
      get inventory() { return getInventory(); },
      craft,
      get state() {
        return {
          x: player.x, y: player.y, z: player.z,
          yaw: player.yaw, pitch: player.pitch,
          sel: selected, mode, gamemode, hp, dead, paused,
          fly: player.fly, onGround: player.onGround,
          fov: camera.fov, target: currentTarget
        };
      },
      tileAt: (x, y, z) => getB(x, y, z),
      tileName: (id) => NAMES[id] || 'Air',
      select: selectSlot,
      setMode,
      toggleFly,
      T
    };
  };
})();
