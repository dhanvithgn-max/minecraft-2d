(() => {
  'use strict';

  window.__BC2D__ = function (opts) {
    opts = opts || {};

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
    const heartsEl = document.getElementById('hearts');
    const fpsEl = document.getElementById('fps');
    const dmgEl = document.getElementById('dmg');
    const deathEl = document.getElementById('death');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const btnJump = document.getElementById('btn-jump');
    const btnMode = document.getElementById('btn-mode');
    const btnFly = document.getElementById('btn-fly');

    const abort = new AbortController();
    const on = (target, type, fn, extra) =>
      target.addEventListener(type, fn, Object.assign({ signal: abort.signal }, extra || {}));

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const idx = (x, y) => y * WORLD_W + x;

    const sfx = (name) => {
      const s = window.BCSound;
      if (s && typeof s[name] === 'function') s[name]();
    };
    const toast = (msg) => {
      if (window.BC && window.BC.toast) window.BC.toast(msg);
    };
    const showFps = () => !!(window.BC && window.BC.settings && window.BC.settings.showFps);

    const view = { w: innerWidth, h: innerHeight, dpr: 1 };
    const cam = { x: 0, y: 0 };
    const player = {
      x: 0, y: 0, w: TILE * 0.7, h: TILE * 1.8,
      vx: 0, vy: 0, onGround: false, face: 1, walk: 0, inWater: false
    };
    const input = { left: false, right: false, jump: false };
    const world = new Uint8Array(WORLD_W * WORLD_H);
    const clouds = [];
    const stars = [];
    const particles = [];
    const inv = {};

    let gamemode = opts.gamemode === 'creative' ? 'creative' : 'survival';
    let selected = 0;
    let mode = 'mine';
    let worldTime = DAY_LENGTH * 0.18;
    let paused = false;
    let dead = false;
    let hp = 20;
    let mineHeld = false;
    let target = null;
    let hover = null;
    let jumpBuffer = 0;
    let spawn = { x: 0, y: 0 };
    let fallPeak = 0;
    let airborne = false;
    let raf = 0;

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

    function makeStars() {
      const rnd = mulberry32(0xB10C);
      stars.length = 0;
      for (let i = 0; i < 90; i++) {
        stars.push({
          x: rnd(), y: rnd() * 0.64,
          s: rnd() < 0.18 ? 2 : 1,
          p: rnd() * Math.PI * 2
        });
      }
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
      fallPeak = player.y;
      airborne = false;
      worldTime = DAY_LENGTH * 0.18;
      snapCamera();
    }

    function resetPlayer() {
      player.x = spawn.x;
      player.y = spawn.y;
      player.vx = 0;
      player.vy = 0;
      fallPeak = player.y;
      airborne = false;
    }

    function respawn() {
      hp = 20;
      dead = false;
      deathEl.classList.add('hidden');
      resetPlayer();
      updateHearts();
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

    function damage(amount) {
      if (gamemode === 'creative' || dead || amount <= 0) return;
      hp = Math.max(0, hp - amount);
      updateHearts();
      dmgEl.classList.remove('show');
      void dmgEl.offsetWidth;
      dmgEl.classList.add('show');
      if (hp <= 0) {
        die();
      } else {
        sfx('hurt');
      }
    }

    function die() {
      dead = true;
      stopMining();
      sfx('death');
      deathEl.classList.remove('hidden');
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
        airborne = true;
        fallPeak = player.y;
        sfx('jump');
      }

      player.x += player.vx * dt;
      collideX(player.vx);

      player.onGround = false;
      player.y += player.vy * dt;
      collideY();

      if (player.onGround) {
        if (airborne) {
          const dist = (player.y - fallPeak) / TILE;
          if (!player.inWater && dist > 4.5) {
            damage(Math.floor((dist - 4.5) * 2) + 1);
          }
          if (dist > 1.4) sfx('land');
          airborne = false;
        }
        fallPeak = player.y;
      } else {
        airborne = true;
        if (player.y < fallPeak) fallPeak = player.y;
      }

      if (player.y > WORLD_H * TILE + 400) resetPlayer();

      for (const c of clouds) {
        c.x += c.spd * dt;
        if (c.x > WORLD_W * TILE * 1.5) c.x -= WORLD_W * TILE * 1.5;
      }

      updateParticles(dt);
      updateMining(dt);
    }

    function breakBlock(x, y) {
      const id = get(x, y);
      if (!BREAKABLE.has(id)) return false;
      spawnParticles(x, y, id, 11, 1);
      set(x, y, T.AIR);
      if (gamemode === 'survival' && HOTBAR.includes(id)) {
        inv[id] = (inv[id] || 0) + 1;
        updateHotbar();
      }
      sfx('break');
      save(true);
      return true;
    }

    function updateMining(dt) {
      if (!mineHeld || !target) return;
      if (gamemode === 'creative') {
        if (BREAKABLE.has(get(target.x, target.y))) breakBlock(target.x, target.y);
        return;
      }
      if (!inReach(target.x, target.y)) { target = null; return; }
      const id = get(target.x, target.y);
      if (!BREAKABLE.has(id)) { target.progress = 0; return; }
      target.progress += dt / (HARDNESS[id] || 0.4);
      if (target.progress >= 1) {
        breakBlock(target.x, target.y);
        target = null;
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
      if (gamemode === 'survival' && !(inv[id] > 0)) {
        toast('No ' + NAMES[id] + ' — mine some first');
        return;
      }
      set(tx, ty, id);
      spawnParticles(tx, ty, id, 5, 0.55);
      if (gamemode === 'survival') {
        inv[id] = Math.max(0, (inv[id] || 0) - 1);
        updateHotbar();
      }
      sfx('place');
      save(true);
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
      heartsEl.classList.toggle('low', gamemode === 'survival' && hp <= 6);
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

    const toRgb = (hex) => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
    const mixRgb = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
    const cssRgb = (c) => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';

    function drawSun(x, y, elev) {
      const r = 24 + elev * 8;
      const glow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 3.6);
      glow.addColorStop(0, 'rgba(255, 250, 205, 0.95)');
      glow.addColorStop(0.35, 'rgba(255, 226, 130, 0.35)');
      glow.addColorStop(1, 'rgba(255, 200, 90, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff6c9';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawMoon(x, y, strength) {
      const r = 20;
      const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.8);
      glow.addColorStop(0, 'rgba(222, 234, 255, 0.5)');
      glow.addColorStop(1, 'rgba(180, 200, 255, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(232, 240, 255,' + (0.72 + strength * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(170, 190, 220, 0.5)';
      ctx.beginPath();
      ctx.arc(x - 5, y - 4, 3.4, 0, Math.PI * 2);
      ctx.arc(x + 6, y + 3, 2.6, 0, Math.PI * 2);
      ctx.arc(x + 1, y - 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHills() {
      const t = worldTime / DAY_LENGTH;
      const day = clamp(Math.sin(t * Math.PI * 2) * 1.7 + 0.5, 0, 1);
      const layers = [
        { base: 0.7, amp: 26, speed: 0.12, color: mixRgb([14, 22, 38], [58, 100, 66], day) },
        { base: 0.78, amp: 20, speed: 0.22, color: mixRgb([12, 18, 30], [71, 118, 70], day) }
      ];
      for (const layer of layers) {
        const baseY = view.h * layer.base;
        const offset = cam.x * layer.speed;
        ctx.fillStyle = cssRgb(layer.color);
        ctx.beginPath();
        ctx.moveTo(-40, view.h + 2);
        for (let x = -40; x <= view.w + 40; x += 22) {
          const y = baseY +
            Math.sin((x + offset) * 0.006) * layer.amp +
            Math.sin((x + offset) * 0.017 + 1.3) * layer.amp * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(view.w + 40, view.h + 2);
        ctx.closePath();
        ctx.fill();
      }
    }

    function drawSky() {
      const t = worldTime / DAY_LENGTH;
      const elev = Math.sin(t * Math.PI * 2);
      const day = clamp(elev * 1.7 + 0.5, 0, 1);
      const night = clamp(-elev, 0, 1);
      const warm = clamp(1 - Math.abs(elev) * 3.2, 0, 1) * 0.5;

      const top = mixRgb([9, 14, 42], [74, 159, 232], day);
      const bottom = mixRgb([24, 34, 74], [191, 228, 255], day);
      if (warm > 0) {
        bottom[0] += 60 * warm;
        bottom[1] += 18 * warm;
        bottom[2] -= 20 * warm;
      }

      const g = ctx.createLinearGradient(0, 0, 0, view.h);
      g.addColorStop(0, cssRgb(top));
      g.addColorStop(1, cssRgb(bottom));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);

      if (night > 0.03) {
        ctx.fillStyle = '#eef4ff';
        for (const s of stars) {
          const twinkle = 0.45 + 0.55 * Math.sin(worldTime * 1.8 + s.p);
          ctx.globalAlpha = night * twinkle;
          ctx.fillRect(Math.round(s.x * view.w), Math.round(s.y * view.h), s.s, s.s);
        }
        ctx.globalAlpha = 1;
      }

      const sunX = view.w * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      const sunY = view.h * 0.56 - elev * view.h * 0.44;
      if (elev > -0.06) drawSun(sunX, sunY, clamp(elev, 0, 1));

      const moonX = view.w * (0.5 - 0.5 * Math.cos((t + 0.5) * Math.PI * 2));
      const moonY = view.h * 0.56 + elev * view.h * 0.44;
      if (elev < 0.06) drawMoon(moonX, moonY, night);

      const travel = WORLD_W * TILE * 1.5;
      for (const c of clouds) {
        let x = c.x - cam.x * 0.5;
        x = ((x % travel) + travel) % travel - 240;
        if (x < -300 || x > view.w + 300) continue;
        const y = c.y - cam.y * 0.04;
        const s = c.s * 26;
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.globalAlpha = 0.16 + day * 0.36;
        ctx.beginPath();
        ctx.ellipse(x, y, s * 1.7, s * 0.7, 0, 0, Math.PI * 2);
        ctx.ellipse(x + s * 1.3, y + s * 0.2, s * 1.1, s * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(x - s * 1.3, y + s * 0.25, s, s * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function spawnParticles(tx, ty, id, count, power) {
      const color = SWATCH[id] || '#8b8b90';
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (18 + Math.random() * 74) * power;
        const life = 0.32 + Math.random() * 0.32;
        particles.push({
          x: cx + (Math.random() - 0.5) * TILE * 0.7,
          y: cy + (Math.random() - 0.5) * TILE * 0.7,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 46 * power,
          life,
          max: life,
          size: 2 + Math.random() * 3.5,
          color
        });
      }
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    }

    function updateParticles(dt) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.vy += 520 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cam.x), Math.round(p.y - cam.y), p.size, p.size);
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
      if (!document.body.classList.contains('playing')) return;
      const pulse = 0.7 + 0.3 * Math.sin(worldTime * 6);

      if (hover && inReach(hover.tx, hover.ty)) {
        const hx = Math.round(hover.tx * TILE - cam.x);
        const hy = Math.round(hover.ty * TILE - cam.y);
        const id = get(hover.tx, hover.ty);
        if (mode === 'mine' && BREAKABLE.has(id)) {
          ctx.strokeStyle = 'rgba(255,255,255,' + pulse + ')';
          ctx.lineWidth = 2;
          ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
        } else if (mode === 'place' && (id === T.AIR || id === T.WATER)) {
          ctx.globalAlpha = 0.3 + 0.2 * pulse;
          rect(hx, hy, TILE, TILE, SWATCH[HOTBAR[selected]]);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255,255,255,' + pulse + ')';
          ctx.lineWidth = 2;
          ctx.strokeRect(hx + 1, hy + 1, TILE - 2, TILE - 2);
        }
      }

      if (target && target.progress > 0) {
        const hx = Math.round(target.x * TILE - cam.x);
        const hy = Math.round(target.y * TILE - cam.y);
        const p = clamp(target.progress, 0, 1);
        rect(hx, hy, TILE, TILE, 'rgba(0,0,0,' + (0.06 + p * 0.42) + ')');
        const seed = target.x * 53 + target.y * 97;
        ctx.strokeStyle = 'rgba(10,10,14,' + (0.32 + p * 0.5) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          if (p < (i + 1) / 7) break;
          const a = hash(seed + i, 11) * Math.PI * 2;
          const len = TILE * (0.16 + hash(seed + i, 23) * 0.38) * p;
          const x0 = hx + TILE / 2 + (hash(seed + i, 37) - 0.5) * TILE * 0.34;
          const y0 = hy + TILE / 2 + (hash(seed + i, 41) - 0.5) * TILE * 0.34;
          ctx.moveTo(x0, y0);
          ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
          if (p > 0.55) {
            ctx.moveTo(x0 + Math.cos(a) * len * 0.6, y0 + Math.sin(a) * len * 0.6);
            ctx.lineTo(x0 + Math.cos(a + 0.8) * len * 0.55, y0 + Math.sin(a + 0.8) * len * 0.55);
          }
        }
        ctx.stroke();
      }
    }

    function render() {
      const t = worldTime / DAY_LENGTH;
      const elev = Math.sin(t * Math.PI * 2);
      const night = clamp(-elev, 0, 1) * 0.6;
      const warm = clamp(1 - Math.abs(elev) * 3, 0, 1) * 0.24;

      drawSky();
      drawHills();
      drawWorld();
      drawParticles();
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
          sel: selected,
          hp,
          inv
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
      hp = typeof d.hp === 'number' ? clamp(d.hp | 0, 0, 20) : 20;
      if (d.inv && typeof d.inv === 'object') {
        for (const id of HOTBAR) inv[id] = Math.max(0, d.inv[id] | 0);
      }
      spawn = { x: player.x, y: player.y };
      fallPeak = player.y;
      airborne = false;
      return true;
    }

    function stopMining() {
      mineHeld = false;
      target = null;
    }

    function newWorld() {
      generate((Date.now() ^ (Math.random() * 1e9)) >>> 0);
      for (const id of HOTBAR) inv[id] = 0;
      particles.length = 0;
      hp = 20;
      dead = false;
      deathEl.classList.add('hidden');
      updateHearts();
      updateHotbar();
      save(true);
      toast('New world generated');
    }

    on(canvas, 'contextmenu', (e) => e.preventDefault());

    on(canvas, 'pointerdown', (e) => {
      if (!document.body.classList.contains('playing') || paused || dead) return;
      if (e.pointerType !== 'mouse' && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      const p = pointerWorld(e);
      if (e.pointerType !== 'mouse') {
        if (mode === 'place') placeAt(p.tx, p.ty);
        else {
          mineHeld = true;
          target = { x: p.tx, y: p.ty, progress: 0 };
          sfx('mine');
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
          sfx('mine');
        }
      }
    });

    on(canvas, 'pointermove', (e) => {
      if (!document.body.classList.contains('playing') || paused || dead) return;
      const p = pointerWorld(e);
      hover = { tx: p.tx, ty: p.ty };
      if (mineHeld) {
        if (!target || target.x !== p.tx || target.y !== p.ty) {
          target = { x: p.tx, y: p.ty, progress: 0 };
        }
      }
    });

    on(canvas, 'pointerup', stopMining);
    on(canvas, 'pointercancel', stopMining);
    on(canvas, 'pointerleave', () => {
      hover = null;
      stopMining();
    });

    const KEY_LEFT = ['ArrowLeft', 'KeyA'];
    const KEY_RIGHT = ['ArrowRight', 'KeyD'];
    const KEY_JUMP = ['Space', 'KeyW', 'ArrowUp'];

    const playing = () => document.body.classList.contains('playing') && !paused && !dead;

    on(window, 'keydown', (e) => {
      if (!document.body.classList.contains('playing')) return;
      if (KEY_LEFT.includes(e.code)) {
        input.left = true;
        e.preventDefault();
      } else if (KEY_RIGHT.includes(e.code)) {
        input.right = true;
        e.preventDefault();
      } else if (KEY_JUMP.includes(e.code) && !e.repeat) {
        input.jump = true;
        jumpBuffer = 0.12;
        e.preventDefault();
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= HOTBAR.length) selectSlot(n - 1);
    });

    on(window, 'keyup', (e) => {
      if (KEY_LEFT.includes(e.code)) input.left = false;
      else if (KEY_RIGHT.includes(e.code)) input.right = false;
      else if (KEY_JUMP.includes(e.code)) input.jump = false;
    });

    on(window, 'blur', () => {
      input.left = input.right = input.jump = false;
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

    bindHold(btnLeft, () => { input.left = true; }, () => { input.left = false; });
    bindHold(btnRight, () => { input.right = true; }, () => { input.right = false; });
    bindHold(btnJump, () => { input.jump = true; jumpBuffer = 0.12; }, () => { input.jump = false; });
    on(btnMode, 'click', () => setMode(mode === 'mine' ? 'place' : 'mine'));

    on(window, 'pagehide', () => save(true));
    on(document, 'visibilitychange', () => {
      if (document.hidden) save(true);
    });

    on(window, 'resize', resize);
    on(window, 'orientationchange', () => setTimeout(resize, 150));

    let last = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;

    function frame(now) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!paused && !dead) update(dt);

      const t = cameraTarget();
      cam.x += (t.x - cam.x) * 0.15;
      cam.y += (t.y - cam.y) * 0.15;

      render();

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

    btnFly.classList.add('hidden');
    document.body.classList.remove('dim-3d');
    document.body.classList.add('dim-2d');

    resize();
    if (!load()) {
      generate((Date.now() ^ (Math.random() * 1e9)) >>> 0);
    }
    buildHotbar();
    setMode('mine');
    makeStars();
    if (hp <= 0) { hp = 20; dead = false; }
    setGamemode(gamemode);
    updateHearts();
    deathEl.classList.add('hidden');
    snapCamera();
    raf = requestAnimationFrame(frame);

    return {
      destroy() {
        abort.abort();
        cancelAnimationFrame(raf);
        save(true);
        hotbarEl.innerHTML = '';
        heartsEl.innerHTML = '';
        document.body.classList.remove('survival', 'creative');
        btnFly.classList.remove('hidden');
        fpsEl.textContent = '';
        stopMining();
        particles.length = 0;
      },
      pause() {
        paused = true;
        save(true);
        stopMining();
        input.left = input.right = input.jump = false;
      },
      resume() {
        paused = false;
        last = performance.now();
        snapCamera();
      },
      save,
      newWorld,
      setGamemode,
      respawn,
      get inventory() { return getInventory(); },
      craft,
      get state() {
        return {
          x: player.x, y: player.y, w: player.w, h: player.h,
          vx: player.vx, vy: player.vy,
          sel: selected, mode, gamemode, hp, dead, paused,
          cam: { x: cam.x, y: cam.y },
          time: worldTime, onGround: player.onGround
        };
      },
      tileAt: (x, y) => get(x, y),
      tileName: (id) => NAMES[id] || 'Air',
      select: selectSlot,
      setMode,
      T
    };
  };
})();
