(() => {
  'use strict';

  const TILE = 32;
  const WORLD_W = 220;
  const WORLD_H = 72;
  const SEA = 46;
  const DAY_LENGTH = 240;
  const SAVE_KEY = 'blockcraft.save.v1';
  const REACH = 6 * TILE;

  const T = {
    AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WOOD: 5, PLANKS: 6,
    LEAVES: 7, GLASS: 8, WATER: 9, COAL: 10, IRON: 11, BEDROCK: 12
  };

  const SOLID = new Set([
    T.GRASS, T.DIRT, T.STONE, T.SAND, T.WOOD, T.PLANKS,
    T.LEAVES, T.GLASS, T.COAL, T.IRON, T.BEDROCK
  ]);
  const BREAKABLE = new Set([...SOLID].filter((id) => id !== T.BEDROCK));

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

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const hotbarEl = document.getElementById('hotbar');
  const overlayEl = document.getElementById('overlay');
  const playBtn = document.getElementById('btn-play');
  const saveBtn = document.getElementById('btn-save');
  const newBtn = document.getElementById('btn-new');
  const installBtn = document.getElementById('btn-install');
  const toastEl = document.getElementById('toast');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnJump = document.getElementById('btn-jump');
  const btnMode = document.getElementById('btn-mode');

  const view = { w: innerWidth, h: innerHeight, dpr: 1 };
  const cam = { x: 0, y: 0 };
  const player = {
    x: 0, y: 0, w: TILE * 0.7, h: TILE * 1.8,
    vx: 0, vy: 0, onGround: false, face: 1, walk: 0, inWater: false
  };
  const input = { left: false, right: false, jump: false };
  const world = new Uint8Array(WORLD_W * WORLD_H);
  const clouds = [];

  let selected = 0;
  let mode = 'mine';
  let worldTime = DAY_LENGTH * 0.18;
  let started = false;
  let mineHeld = false;
  let target = null;
  let hover = null;
  let jumpBuffer = 0;
  let spawn = { x: 0, y: 0 };
  let toastTimer = 0;
  let installEvent = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const idx = (x, y) => y * WORLD_W + x;

  function get(x, y) {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return T.AIR;
    return world[idx(x, y)];
  }

  function set(x, y, v) {
    if (x < 0 || x >= WORLD_W || y < 0 || y >= WORLD_H) return;
    world[idx(x, y)] = v;
  }

  function solidAt(x, y) {
    if (x < 0 || x >= WORLD_W) return true;
    if (y < 0 || y >= WORLD_H) return false;
    return SOLID.has(world[idx(x, y)]);
  }

  function hash(x, y) {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

  function terrainH(x) {
    return Math.round(
      38 +
      Math.sin(x * 0.045) * 4.5 +
      Math.sin(x * 0.11 + 1.7) * 2.2 +
      Math.sin(x * 0.017 + 0.4) * 7
    );
  }

  function cleanColumn(x) {
    const h = terrainH(x);
    if (h >= SEA) return false;
    if (get(x, h) !== T.GRASS) return false;
    for (let i = 1; i <= 7; i++) {
      if (get(x, h - i) !== T.AIR) return false;
    }
    return true;
  }

  function generate(seed) {
    const rand = mulberry32(seed >>> 0);
    world.fill(T.AIR);

    for (let x = 0; x < WORLD_W; x++) {
      const h = terrainH(x);
      for (let y = 0; y < WORLD_H; y++) {
        let v = T.AIR;
        if (y >= WORLD_H - 2) {
          v = T.BEDROCK;
        } else if (y > h + 3) {
          v = T.STONE;
          const r = rand();
          if (r < 0.012) v = T.COAL;
          else if (r < 0.018) v = T.IRON;
        } else if (y > h) {
          v = T.DIRT;
        } else if (y === h) {
          v = h >= SEA - 1 ? T.SAND : T.GRASS;
        }
        world[idx(x, y)] = v;
      }

      if (h > SEA) {
        for (let y = SEA; y < h; y++) world[idx(x, y)] = T.WATER;
        for (let y = h; y <= h + 1 && y < WORLD_H; y++) world[idx(x, y)] = T.SAND;
      }
    }

    for (let x = 3; x < WORLD_W - 3; x++) {
      const h = terrainH(x);
      if (h >= SEA - 1) continue;
      if (get(x, h) !== T.GRASS) continue;
      if (rand() > 0.075) continue;
      if (get(x - 1, h) === T.WOOD || get(x + 1, h) === T.WOOD) continue;
      if (x >= 6 && get(x - 3, h) === T.WOOD) continue;

      const trunk = 3 + Math.floor(rand() * 3);
      for (let i = 1; i <= trunk; i++) set(x, h - i, T.WOOD);
      const top = h - trunk;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 0; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (dy === 0 && Math.abs(dx) === 2) continue;
          if (get(x + dx, top + dy) === T.AIR) set(x + dx, top + dy, T.LEAVES);
        }
      }
      set(x, top, T.LEAVES);
    }

    clouds.length = 0;
    for (let i = 0; i < 16; i++) {
      clouds.push({
        x: rand() * WORLD_W * TILE * 1.5,
        y: 28 + rand() * 130,
        s: 0.55 + rand() * 0.95,
        spd: 5 + rand() * 9
      });
    }

    let sx = Math.floor(WORLD_W / 2);
    let found = false;
    for (let d = 0; d < WORLD_W; d++) {
      const cands = [sx + d, sx - d];
      for (const cx of cands) {
        if (cx < 3 || cx >= WORLD_W - 3) continue;
        if (cleanColumn(cx)) { sx = cx; found = true; break; }
      }
      if (found) break;
    }

    let sy = 0;
    while (sy < WORLD_H - 1 && !SOLID.has(get(sx, sy))) sy++;
    player.x = sx * TILE + (TILE - player.w) / 2;
    player.y = sy * TILE - player.h - 1;
    player.vx = 0;
    player.vy = 0;
    player.face = 1;
    player.walk = 0;
    spawn = { x: player.x, y: player.y };
    worldTime = DAY_LENGTH * 0.18;
    snapCamera();
  }

  function respawn() {
    player.x = spawn.x;
    player.y = spawn.y;
    player.vx = 0;
    player.vy = 0;
  }

  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.floor(view.w * view.dpr);
    canvas.height = Math.floor(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    snapCamera();
  }

  function cameraTarget() {
    const cx = player.x + player.w / 2;
    const cy = player.y + player.h / 2;
    return {
      x: clamp(cx - view.w / 2, 0, Math.max(0, WORLD_W * TILE - view.w)),
      y: clamp(cy - view.h / 2, 0, Math.max(0, WORLD_H * TILE - view.h))
    };
  }

  function snapCamera() {
    const t = cameraTarget();
    cam.x = t.x;
    cam.y = t.y;
  }

  function collideX(dir) {
    const top = Math.floor(player.y / TILE);
    const bot = Math.floor((player.y + player.h - 0.01) / TILE);
    if (dir > 0) {
      const col = Math.floor((player.x + player.w - 0.01) / TILE);
      for (let y = top; y <= bot; y++) {
        if (solidAt(col, y)) {
          player.x = col * TILE - player.w - 0.01;
          player.vx = 0;
          break;
        }
      }
    } else if (dir < 0) {
      const col = Math.floor(player.x / TILE);
      for (let y = top; y <= bot; y++) {
        if (solidAt(col, y)) {
          player.x = (col + 1) * TILE + 0.01;
          player.vx = 0;
          break;
        }
      }
    }
  }

  function collideY() {
    const left = Math.floor(player.x / TILE);
    const right = Math.floor((player.x + player.w - 0.01) / TILE);
    if (player.vy > 0) {
      const row = Math.floor((player.y + player.h - 0.01) / TILE);
      for (let x = left; x <= right; x++) {
        if (solidAt(x, row)) {
          player.y = row * TILE - player.h - 0.01;
          player.vy = 0;
          player.onGround = true;
          break;
        }
      }
    } else if (player.vy < 0) {
      const row = Math.floor(player.y / TILE);
      for (let x = left; x <= right; x++) {
        if (solidAt(x, row)) {
          player.y = (row + 1) * TILE + 0.01;
          player.vy = 0;
          break;
        }
      }
    }
  }

  function update(dt) {
    worldTime = (worldTime + dt) % DAY_LENGTH;

    const speed = (player.inWater ? 3.2 : 4.8) * TILE;
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    player.vx = dir * speed;
    if (dir) {
      player.face = dir;
      player.walk += dt * 11;
    } else {
      player.walk = 0;
    }

    const cx = player.x + player.w / 2;
    player.inWater = get(Math.floor(cx / TILE), Math.floor((player.y + player.h * 0.8) / TILE)) === T.WATER;

    const gravity = player.inWater ? 10 : 34;
    player.vy += gravity * TILE * dt;
    const maxFall = (player.inWater ? 6 : 38) * TILE;
    if (player.vy > maxFall) player.vy = maxFall;

    if (jumpBuffer > 0) jumpBuffer -= dt;
    if (input.jump && player.inWater) {
      player.vy = Math.min(player.vy, -4 * TILE);
    }
    if ((input.jump || jumpBuffer > 0) && player.onGround) {
      player.vy = -12 * TILE;
      player.onGround = false;
      jumpBuffer = 0;
    }

    player.x += player.vx * dt;
    collideX(player.vx);

    player.onGround = false;
    player.y += player.vy * dt;
    collideY();

    if (player.y > WORLD_H * TILE + 400) respawn();

    for (const c of clouds) {
      c.x += c.spd * dt;
      if (c.x > WORLD_W * TILE * 1.5) c.x -= WORLD_W * TILE * 1.5;
    }

    updateMining(dt);
  }

  function updateMining(dt) {
    if (!mineHeld || !target) return;
    if (!inReach(target.x, target.y)) { target = null; return; }
    const id = get(target.x, target.y);
    if (!BREAKABLE.has(id)) { target.progress = 0; return; }
    target.progress += dt / (HARDNESS[id] || 0.4);
    if (target.progress >= 1) {
      set(target.x, target.y, T.AIR);
      target = null;
      save(true);
    }
  }

  function inReach(tx, ty) {
    const px = player.x + player.w / 2;
    const py = player.y + player.h / 2;
    const bx = tx * TILE + TILE / 2;
    const by = ty * TILE + TILE / 2;
    const dx = bx - px;
    const dy = by - py;
    return dx * dx + dy * dy <= REACH * REACH;
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function placeAt(tx, ty) {
    if (!inReach(tx, ty)) return;
    const cur = get(tx, ty);
    if (cur !== T.AIR && cur !== T.WATER) return;
    const id = HOTBAR[selected];
    if (overlap(tx * TILE, ty * TILE, TILE, TILE, player.x, player.y, player.w, player.h)) return;
    if (id === T.WOOD && overlap(tx * TILE, ty * TILE, TILE, TILE, player.x, player.y, player.w, player.h)) return;
    set(tx, ty, id);
    save(true);
  }

  function selectSlot(i) {
    selected = clamp(i | 0, 0, HOTBAR.length - 1);
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
        '<span class="key">' + (i + 1) + '</span>';
      b.setAttribute('aria-label', 'Select ' + NAMES[id]);
      b.addEventListener('click', () => selectSlot(i));
      hotbarEl.appendChild(b);
    });
    selectSlot(selected);
  }

  function setMode(m) {
    mode = m;
    btnMode.textContent = m === 'mine' ? 'Mine' : 'Place';
    btnMode.classList.toggle('place', m === 'place');
  }

  function rect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function noise(sx, sy, x, y, strength) {
    for (let i = 0; i < 4; i++) {
      const a = hash(x * 17 + i * 31, y * 13 + i * 7);
      const b = hash(x * 7 + i * 19, y * 29 + i * 3);
      const size = 4 + Math.floor(a * 3) * 4;
      ctx.fillStyle = a > 0.5
        ? 'rgba(255,255,255,' + strength + ')'
        : 'rgba(0,0,0,' + strength + ')';
      ctx.fillRect(
        Math.round(sx + b * (TILE - size)),
        Math.round(sy + a * (TILE - size)),
        size, size
      );
    }
  }

  function drawTile(x, y) {
    const id = get(x, y);
    if (id === T.AIR) return;
    const sx = Math.round(x * TILE - cam.x);
    const sy = Math.round(y * TILE - cam.y);
    if (sx <= -TILE || sy <= -TILE || sx >= view.w || sy >= view.h) return;

    if (id === T.WATER) {
      const wave = Math.sin(worldTime * 2 + x * 0.6) * 2;
      rect(sx, sy, TILE, TILE, 'rgba(46,110,200,0.55)');
      if (get(x, y - 1) === T.AIR) {
        rect(sx, sy + 1 + wave, TILE, 3, 'rgba(165,216,255,0.6)');
      }
      return;
    }

    if (id === T.GLASS) {
      rect(sx, sy, TILE, TILE, 'rgba(200,235,245,0.22)');
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
      rect(sx + 5, sy + 5, 9, 3, 'rgba(255,255,255,0.4)');
      return;
    }

    switch (id) {
      case T.GRASS:
        rect(sx, sy, TILE, TILE, '#7b5230');
        rect(sx, sy, TILE, 9, '#5fa83b');
        rect(sx, sy + 9, TILE, 2, '#4d8f2f');
        noise(sx, sy, x, y, 0.12);
        break;
      case T.DIRT:
        rect(sx, sy, TILE, TILE, '#7b5230');
        noise(sx, sy, x, y, 0.13);
        break;
      case T.STONE:
        rect(sx, sy, TILE, TILE, '#8b8b90');
        noise(sx, sy, x, y, 0.1);
        break;
      case T.SAND:
        rect(sx, sy, TILE, TILE, '#e3d59e');
        noise(sx, sy, x, y, 0.07);
        break;
      case T.WOOD:
        rect(sx, sy, TILE, TILE, '#7b5a33');
        rect(sx + 7, sy, 3, TILE, 'rgba(0,0,0,0.16)');
        rect(sx + 20, sy, 3, TILE, 'rgba(0,0,0,0.16)');
        noise(sx, sy, x, y, 0.08);
        break;
      case T.PLANKS:
        rect(sx, sy, TILE, TILE, '#b58a4f');
        rect(sx, sy + 10, TILE, 2, 'rgba(0,0,0,0.22)');
        rect(sx, sy + 22, TILE, 2, 'rgba(0,0,0,0.22)');
        noise(sx, sy, x, y, 0.07);
        break;
      case T.LEAVES:
        rect(sx, sy, TILE, TILE, '#3f8f35');
        noise(sx, sy, x, y, 0.17);
        rect(sx + 2, sy + 2, 5, 4, 'rgba(30,90,30,0.5)');
        rect(sx + 20, sy + 18, 7, 5, 'rgba(30,90,30,0.5)');
        break;
      case T.COAL: {
        rect(sx, sy, TILE, TILE, '#8b8b90');
        noise(sx, sy, x, y, 0.08);
        for (let i = 0; i < 3; i++) {
          const a = hash(x * 5 + i, y * 9 + i * 13);
          const b = hash(x * 11 + i * 3, y * 3 + i * 5);
          rect(sx + 5 + Math.floor(a * 16), sy + 5 + Math.floor(b * 16), 8, 8, '#1c1c22');
        }
        break;
      }
      case T.IRON: {
        rect(sx, sy, TILE, TILE, '#8b8b90');
        noise(sx, sy, x, y, 0.08);
        for (let i = 0; i < 3; i++) {
          const a = hash(x * 3 + i * 7, y * 5 + i);
          const b = hash(x * 13 + i, y * 7 + i * 3);
          rect(sx + 5 + Math.floor(a * 16), sy + 5 + Math.floor(b * 16), 7, 7, '#cf9c6b');
        }
        break;
      }
      default:
        rect(sx, sy, TILE, TILE, '#3b3b41');
        noise(sx, sy, x, y, 0.2);
    }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, view.h);
    g.addColorStop(0, '#4a9fe8');
    g.addColorStop(1, '#bfe4ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);

    const travel = WORLD_W * TILE * 1.5;
    ctx.fillStyle = '#ffffff';
    for (const c of clouds) {
      let x = c.x - cam.x * 0.5;
      x = ((x % travel) + travel) % travel - 240;
      if (x < -300 || x > view.w + 300) continue;
      const y = c.y - cam.y * 0.04;
      const s = c.s * 26;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.7, s * 0.7, 0, 0, Math.PI * 2);
      ctx.ellipse(x + s * 1.3, y + s * 0.2, s * 1.1, s * 0.55, 0, 0, Math.PI * 2);
      ctx.ellipse(x - s * 1.3, y + s * 0.25, s, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld() {
    const x0 = Math.max(0, Math.floor(cam.x / TILE));
    const x1 = Math.min(WORLD_W - 1, Math.floor((cam.x + view.w) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const y1 = Math.min(WORLD_H - 1, Math.floor((cam.y + view.h) / TILE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) drawTile(x, y);
    }
  }

  function drawPlayer() {
    const fx = player.x - cam.x;
    const fy = player.y - cam.y;
    const w = player.w;
    const h = player.h;
    const moving = Math.abs(player.vx) > 5;
    const swing = moving ? Math.sin(player.walk) * 4 : 0;

    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath();
    ctx.ellipse(fx + w / 2, fy + h + 2, w * 0.72, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#33427a';
    ctx.fillRect(fx + 2, fy + h * 0.55, w * 0.34, h * 0.45 + swing);
    ctx.fillRect(fx + w * 0.66, fy + h * 0.55, w * 0.34, h * 0.45 - swing);

    ctx.fillStyle = '#2fa394';
    ctx.fillRect(fx, fy + h * 0.28, w, h * 0.3);

    ctx.fillStyle = '#e6b98a';
    ctx.fillRect(fx - 2, fy + h * 0.31, 4, h * 0.24);
    ctx.fillRect(fx + w - 2, fy + h * 0.31, 4, h * 0.24);

    ctx.fillStyle = '#eec192';
    ctx.fillRect(fx + 1, fy, w - 2, h * 0.27);

    ctx.fillStyle = '#46301d';
    ctx.fillRect(fx + 1, fy, w - 2, h * 0.09);
    ctx.fillRect(fx + 1, fy, 4, h * 0.2);

    ctx.fillStyle = '#1f2a44';
    const eyeX = player.face > 0 ? fx + w - 9 : fx + 6;
    ctx.fillRect(eyeX, fy + h * 0.14, 3, 4);
  }

  function drawTargets() {
    if (!started) return;

    if (hover && inReach(hover.tx, hover.ty)) {
      const hx = Math.round(hover.tx * TILE - cam.x);
      const hy = Math.round(hover.ty * TILE - cam.y);
      const id = get(hover.tx, hover.ty);
      if (mode === 'mine' && BREAKABLE.has(id)) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
      } else if (mode === 'place' && (id === T.AIR || id === T.WATER)) {
        ctx.globalAlpha = 0.45;
        rect(hx, hy, TILE, TILE, SWATCH[HOTBAR[selected]]);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
      }
    }

    if (target && target.progress > 0) {
      const hx = Math.round(target.x * TILE - cam.x);
      const hy = Math.round(target.y * TILE - cam.y);
      rect(hx, hy, TILE, TILE, 'rgba(0,0,0,' + (0.08 + target.progress * 0.5) + ')');
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const p = target.progress;
      ctx.moveTo(hx + 4, hy + TILE * 0.3);
      ctx.lineTo(hx + TILE * 0.3, hy + 4 + p * 8);
      ctx.moveTo(hx + TILE - 4, hy + TILE * 0.55);
      ctx.lineTo(hx + TILE * 0.6, hy + TILE - 4);
      ctx.stroke();
    }
  }

  function render() {
    const t = worldTime / DAY_LENGTH;
    const elev = Math.sin(t * Math.PI * 2);
    const night = clamp(-elev, 0, 1) * 0.68;
    const warm = clamp(1 - Math.abs(elev) * 3, 0, 1) * 0.32;

    drawSky();
    drawWorld();
    drawPlayer();

    if (warm > 0) {
      rect(0, 0, view.w, view.h, 'rgba(255,138,70,' + warm + ')');
    }
    if (night > 0) {
      rect(0, 0, view.w, view.h, 'rgba(7,14,42,' + night + ')');
    }

    drawTargets();
  }

  function pointerWorld(e) {
    const r = canvas.getBoundingClientRect();
    return {
      tx: Math.floor((e.clientX - r.left + cam.x) / TILE),
      ty: Math.floor((e.clientY - r.top + cam.y) / TILE)
    };
  }

  function save(silent) {
    const rle = [];
    let cur = world[0];
    let count = 0;
    for (let i = 0; i < world.length; i++) {
      const v = world[i];
      if (v === cur) {
        count++;
      } else {
        rle.push(cur, count);
        cur = v;
        count = 1;
      }
    }
    rle.push(cur, count);

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        rle,
        px: player.x,
        py: player.y,
        time: worldTime,
        sel: selected
      }));
    } catch (err) {
      if (!silent) toast('Could not save (storage full?)');
      return;
    }
    if (!silent) toast('Saved');
  }

  function load() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (err) {
      return false;
    }
    if (!raw) return false;

    let d;
    try {
      d = JSON.parse(raw);
    } catch (err) {
      return false;
    }
    if (!d || d.v !== 1 || !Array.isArray(d.rle)) return false;

    let i = 0;
    for (let k = 0; k < d.rle.length; k += 2) {
      const id = d.rle[k] | 0;
      const n = d.rle[k + 1] | 0;
      if (id < 0 || id > 12 || n < 0) return false;
      for (let j = 0; j < n && i < world.length; j++) world[i++] = id;
    }
    if (i !== world.length) return false;

    player.x = Number(d.px) || 0;
    player.y = Number(d.py) || 0;
    player.vx = 0;
    player.vy = 0;
    worldTime = Number(d.time) || 0;
    selected = typeof d.sel === 'number' ? clamp(d.sel | 0, 0, HOTBAR.length - 1) : 0;
    spawn = { x: player.x, y: player.y };
    return true;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (!started) return;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    const p = pointerWorld(e);
    if (e.pointerType !== 'mouse') {
      if (mode === 'place') placeAt(p.tx, p.ty);
      else {
        mineHeld = true;
        target = { x: p.tx, y: p.ty, progress: 0 };
      }
      return;
    }
    if (e.button === 2) {
      placeAt(p.tx, p.ty);
      return;
    }
    if (e.button === 0) {
      if (mode === 'place') placeAt(p.tx, p.ty);
      else {
        mineHeld = true;
        target = { x: p.tx, y: p.ty, progress: 0 };
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!started) return;
    const p = pointerWorld(e);
    hover = { tx: p.tx, ty: p.ty };
    if (mineHeld) {
      if (!target || target.x !== p.tx || target.y !== p.ty) {
        target = { x: p.tx, y: p.ty, progress: 0 };
      }
    }
  });

  function stopMining() {
    mineHeld = false;
    target = null;
  }

  canvas.addEventListener('pointerup', stopMining);
  canvas.addEventListener('pointercancel', stopMining);
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    stopMining();
  });

  const KEY_LEFT = ['ArrowLeft', 'KeyA'];
  const KEY_RIGHT = ['ArrowRight', 'KeyD'];
  const KEY_JUMP = ['Space', 'KeyW', 'ArrowUp'];

  addEventListener('keydown', (e) => {
    if (KEY_LEFT.includes(e.code)) {
      input.left = true;
      e.preventDefault();
    } else if (KEY_RIGHT.includes(e.code)) {
      input.right = true;
      e.preventDefault();
    } else if (KEY_JUMP.includes(e.code)) {
      input.jump = true;
      jumpBuffer = 0.12;
      e.preventDefault();
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
  });

  addEventListener('keyup', (e) => {
    if (KEY_LEFT.includes(e.code)) input.left = false;
    else if (KEY_RIGHT.includes(e.code)) input.right = false;
    else if (KEY_JUMP.includes(e.code)) input.jump = false;
  });

  addEventListener('blur', () => {
    input.left = input.right = input.jump = false;
    stopMining();
  });

  function bindHold(el, on, off) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      on();
    });
    el.addEventListener('pointerup', (e) => {
      e.preventDefault();
      off();
    });
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  bindHold(btnLeft, () => { input.left = true; }, () => { input.left = false; });
  bindHold(btnRight, () => { input.right = true; }, () => { input.right = false; });
  bindHold(btnJump, () => { input.jump = true; jumpBuffer = 0.12; }, () => { input.jump = false; });
  btnMode.addEventListener('click', () => setMode(mode === 'mine' ? 'place' : 'mine'));

  playBtn.addEventListener('click', () => {
    overlayEl.classList.add('hidden');
    started = true;
    snapCamera();
  });

  saveBtn.addEventListener('click', () => save(false));

  newBtn.addEventListener('click', () => {
    if (confirm('Generate a new world? Your current world will be lost.')) {
      generate((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      save(true);
      toast('New world generated');
    }
  });

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    installBtn.hidden = false;
  });

  installBtn.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    try { await installEvent.userChoice; } catch (err) {}
    installEvent = null;
    installBtn.hidden = true;
  });

  addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    installEvent = null;
  });

  if (matchMedia('(display-mode: standalone)').matches) installBtn.hidden = true;

  addEventListener('pagehide', () => save(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save(true);
  });

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 150));

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (started) update(dt);
    const t = cameraTarget();
    cam.x += (t.x - cam.x) * 0.15;
    cam.y += (t.y - cam.y) * 0.15;
    render();
    requestAnimationFrame(frame);
  }

  resize();
  if (!load()) generate((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  buildHotbar();
  selectSlot(selected);
  setMode('mine');
  snapCamera();
  requestAnimationFrame(frame);

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  window.BlockCraft = {
    get state() {
      return {
        x: player.x, y: player.y, w: player.w, h: player.h,
        vx: player.vx, vy: player.vy,
        sel: selected, mode, started,
        cam: { x: cam.x, y: cam.y },
        time: worldTime, onGround: player.onGround
      };
    },
    tileAt: (x, y) => get(x, y),
    tileName: (id) => NAMES[id] || 'Air',
    select: selectSlot,
    setMode,
    save,
    T
  };
})();
