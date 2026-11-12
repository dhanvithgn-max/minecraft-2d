(() => {
  'use strict';

  const SET_KEY = 'blockcraft.settings.v1';
  const overlayEl = document.getElementById('overlay');
  const playBtn = document.getElementById('btn-play');
  const saveBtn = document.getElementById('btn-save');
  const newBtn = document.getElementById('btn-new');
  const menuBtn = document.getElementById('btn-menu');
  const gameSetBtn = document.getElementById('btn-settings-game');
  const menuSetBtn = document.getElementById('btn-settings');
  const installBtn = document.getElementById('btn-install');
  const toastEl = document.getElementById('toast');
  const fpsEl = document.getElementById('fps');
  const settingsEl = document.getElementById('settings');

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SET_KEY)) || {}; } catch (e) { return {}; }
  }
  const settings = Object.assign(
    { sound: true, sens: 1, invertY: false, renderDist: 1, showFps: false, dim: '2d', gamemode: 'survival' },
    loadSettings()
  );
  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {}
    applyFps();
  }

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1500);
  }

  const loaded = {};
  function script(src) {
    if (loaded[src]) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('failed to load ' + src));
      document.head.appendChild(s);
      loaded[src] = true;
    });
  }

  let engine = null;
  let engineDim = null;
  async function boot(dim) {
    if (engine) { engine.destroy(); engine = null; engineDim = null; }
    document.body.classList.toggle('dim-2d', dim === '2d');
    document.body.classList.toggle('dim-3d', dim === '3d');
    if (dim === '3d') {
      await script('js/three.min.js');
      await script('js/game3d.js');
      engine = window.__BC3D__({ gamemode: settings.gamemode });
    } else {
      await script('js/game.js');
      engine = window.__BC2D__({ gamemode: settings.gamemode });
    }
    engineDim = dim;
  }

  function syncChips() {
    document.getElementById('dim-2d').setAttribute('aria-pressed', settings.dim === '2d');
    document.getElementById('dim-3d').setAttribute('aria-pressed', settings.dim === '3d');
    document.getElementById('mode-surv').setAttribute('aria-pressed', settings.gamemode === 'survival');
    document.getElementById('mode-creat').setAttribute('aria-pressed', settings.gamemode === 'creative');
    document.getElementById('controls-2d').classList.toggle('hidden', settings.dim !== '2d');
    document.getElementById('controls-3d').classList.toggle('hidden', settings.dim !== '3d');
  }

  async function pickDim(dim) {
    if (settings.dim === dim) return;
    settings.dim = dim;
    saveSettings();
    syncChips();
    if (engine && document.body.classList.contains('playing')) {
      await boot(dim);
      if (engine) engine.resume();
    }
  }

  function pickMode(mode) {
    if (settings.gamemode === mode) return;
    settings.gamemode = mode;
    saveSettings();
    syncChips();
    if (engine && engine.setGamemode) engine.setGamemode(mode);
    toast(mode === 'creative' ? 'Creative mode' : 'Survival mode');
  }

  playBtn.addEventListener('click', async () => {
    BCSound.unlock();
    BCSound.ui();
    overlayEl.classList.add('hidden');
    document.body.classList.add('playing');
    if (!engine || engineDim !== settings.dim) await boot(settings.dim);
    else engine.resume();
  });

  document.getElementById('dim-2d').addEventListener('click', () => pickDim('2d'));
  document.getElementById('dim-3d').addEventListener('click', () => pickDim('3d'));
  document.getElementById('mode-surv').addEventListener('click', () => pickMode('survival'));
  document.getElementById('mode-creat').addEventListener('click', () => pickMode('creative'));

  function openMenu() {
    if (engine) { engine.save(true); engine.pause(); }
    overlayEl.classList.remove('hidden');
    document.body.classList.remove('playing');
    syncChips();
  }
  menuBtn.addEventListener('click', () => { BCSound.ui(); openMenu(); });
  saveBtn.addEventListener('click', () => { if (engine) engine.save(false); });
  newBtn.addEventListener('click', () => { if (engine) engine.newWorld(); });

  function openSettings() {
    BCSound.ui();
    settingsEl.classList.remove('hidden');
  }
  function closeSettings() {
    settingsEl.classList.add('hidden');
    BCSound.ui();
  }
  menuSetBtn.addEventListener('click', openSettings);
  gameSetBtn.addEventListener('click', openSettings);
  document.getElementById('btn-set-close').addEventListener('click', closeSettings);
  settingsEl.addEventListener('click', (e) => {
    if (e.target === settingsEl) closeSettings();
  });

  const deathEl = document.getElementById('death');
  const recipesOpen = () => !!(window.BCRecipes && window.BCRecipes.isOpen());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (recipesOpen()) {
        window.BCRecipes.close();
        e.preventDefault();
      } else if (!settingsEl.classList.contains('hidden')) {
        closeSettings();
        e.preventDefault();
      } else if (overlayEl.classList.contains('hidden') && deathEl.classList.contains('hidden')) {
        openMenu();
        e.preventDefault();
      }
      return;
    }
    if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (window.BCRecipes && settingsEl.classList.contains('hidden')) {
        if (recipesOpen()) window.BCRecipes.close();
        else window.BCRecipes.open();
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'Enter' && document.activeElement && document.activeElement.tagName === 'BODY') {
      if (!settingsEl.classList.contains('hidden')) return;
      if (!overlayEl.classList.contains('hidden')) {
        playBtn.click();
        e.preventDefault();
      }
    }
  });

  const bind = (id, key, prop) => {
    const el = document.getElementById(id);
    if (el.type === 'checkbox') {
      el.checked = !!settings[key];
      el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); });
    } else {
      el.value = settings[key];
      el.addEventListener('input', () => { settings[key] = prop === parseInt ? parseInt(el.value, 10) : parseFloat(el.value); saveSettings(); });
    }
  };
  bind('set-sound', 'sound');
  bind('set-fps', 'showFps');
  bind('set-sens', 'sens', parseFloat);
  bind('set-inv', 'invertY');
  bind('set-rd', 'renderDist', parseInt);
  document.getElementById('btn-set-reset').addEventListener('click', () => {
    Object.assign(settings, { sound: true, sens: 1, invertY: false, renderDist: 1, showFps: false });
    saveSettings();
    document.getElementById('set-sound').checked = true;
    document.getElementById('set-fps').checked = false;
    document.getElementById('set-sens').value = 1;
    document.getElementById('set-inv').checked = false;
    document.getElementById('set-rd').value = 1;
    toast('Settings reset');
  });

  function applyFps() {
    fpsEl.classList.toggle('hidden', !settings.showFps);
  }
  applyFps();

  let installEvent = null;
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
  addEventListener('appinstalled', () => { installBtn.hidden = true; installEvent = null; });
  if (matchMedia('(display-mode: standalone)').matches) installBtn.hidden = true;

  document.getElementById('btn-respawn').addEventListener('click', () => {
    document.getElementById('death').classList.add('hidden');
    if (engine) engine.respawn();
  });

  syncChips();

  window.BC = {
    settings,
    saveSettings,
    toast,
    boot,
    openMenu,
    syncChips,
    engineMode(mode) {
      settings.gamemode = mode;
      saveSettings();
      syncChips();
    },
    get engine() { return engine; },
    sound: window.BCSound
  };

  if ('serviceWorker' in navigator) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
