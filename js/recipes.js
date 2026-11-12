(() => {
  'use strict';

  const NAMES = {
    1: 'Grass', 2: 'Dirt', 3: 'Stone', 4: 'Sand', 5: 'Wood',
    6: 'Planks', 7: 'Leaves', 8: 'Glass'
  };
  const SWATCH = {
    1: '#63a83a', 2: '#7b5230', 3: '#8b8b90', 4: '#e3d59e',
    5: '#7b5a33', 6: '#b58a4f', 7: '#3f8f35', 8: '#a9d9e6'
  };

  const RECIPES = [
    {
      id: 'planks', tier: 'common', name: 'Planks',
      desc: 'Split one log into two planks.',
      cost: { 5: 1 }, out: { 6: 2 }
    },
    {
      id: 'glass', tier: 'common', name: 'Glass',
      desc: 'Melt two sand into a glass block.',
      cost: { 4: 2 }, out: { 8: 1 }
    },
    {
      id: 'grass', tier: 'common', name: 'Grass',
      desc: 'Seed dirt with a little foliage.',
      cost: { 2: 1, 7: 1 }, out: { 1: 1 }
    },
    {
      id: 'sand', tier: 'common', name: 'Sand',
      desc: 'Crush one stone into sand.',
      cost: { 3: 1 }, out: { 4: 1 }
    },
    {
      id: 'timber', tier: 'uncommon', name: 'Timber bundle',
      desc: 'Three logs become six planks.',
      cost: { 5: 3 }, out: { 6: 6 }
    },
    {
      id: 'stone', tier: 'uncommon', name: 'Packed stone',
      desc: 'Press dirt and sand into stone.',
      cost: { 2: 2, 4: 1 }, out: { 3: 1 }
    },
    {
      id: 'leaves', tier: 'uncommon', name: 'Leafy growth',
      desc: 'Grow two leaves from grass and planks.',
      cost: { 1: 1, 6: 1 }, out: { 7: 2 }
    },
    {
      id: 'wood', tier: 'uncommon', name: 'Reclaimed log',
      desc: 'Turn planks and leaves back into wood.',
      cost: { 6: 2, 7: 1 }, out: { 5: 1 }
    }
  ];

  const TIERS = [
    { key: 'common', label: 'Common', hint: 'Everyday conversions for building.' },
    { key: 'uncommon', label: 'Uncommon', hint: 'Better yields and rarer conversions.' }
  ];

  const el = document.getElementById('recipes');
  const listEl = document.getElementById('recipe-list');
  const noteEl = document.getElementById('craft-note');
  const closeBtn = document.getElementById('btn-craft-close');
  let wasPlaying = false;

  function toast(msg) {
    if (window.BC && window.BC.toast) window.BC.toast(msg);
  }
  function sfx(name) {
    const s = window.BCSound;
    if (s && typeof s[name] === 'function') s[name]();
  }
  function engine() {
    return window.BC && window.BC.engine;
  }
  function gamemode() {
    const e = engine();
    if (e && e.state) return e.state.gamemode;
    return (window.BC && window.BC.settings && window.BC.settings.gamemode) || 'survival';
  }
  function name(id) {
    return NAMES[id] || 'Block';
  }
  function swatch(id) {
    return SWATCH[id] || '#8b8b90';
  }
  function amount(map) {
    return Object.keys(map).reduce((n, id) => n + map[id], 0);
  }
  function canAfford(cost, inv) {
    return Object.keys(cost).every((id) => (inv[id] || 0) >= cost[id]);
  }
  function costText(cost) {
    return Object.keys(cost).map((id) => '1\u00d7 ' + name(id)).join(' + ');
  }
  function outText(result) {
    return Object.keys(result).map((id) => result[id] + '\u00d7 ' + name(id)).join(' + ');
  }

  function makeCost(cost, inv, gm) {
    const parts = Object.keys(cost).map((id) => {
      const need = cost[id];
      const have = inv[id] || 0;
      const cls = gm === 'survival' && have < need ? ' cost-short' : '';
      const haveTxt = gm === 'survival' ? '<em>have ' + have + '</em>' : '';
      return '<span class="cost' + cls + '">' +
        '<i style="background:' + swatch(id) + '"></i>' +
        '<span>' + need + '\u00d7 ' + name(id) + haveTxt + '</span>' +
        '</span>';
    });
    return '<div class="recipe-cost">' + parts.join('<span class="plus">+</span>') + '</div>';
  }

  function card(r, inv, gm, hasEngine) {
    const affordable = canAfford(r.cost, inv);
    const canCraft = !!hasEngine && (gm === 'creative' || affordable);
    const label = !hasEngine ? 'Play first' : (gm === 'creative' ? 'Unlimited' : 'Craft');
    const out = Object.keys(r.out);
    const outId = out[0];
    const count = amount(r.out);
    const total = Object.keys(r.out).length === 1
      ? r.out[outId]
      : count;
    const outLabel = Object.keys(r.out).length === 1
      ? total + '\u00d7 ' + name(outId)
      : outText(r.out);
    return '<article class="recipe-card" data-recipe="' + r.id + '">' +
      '<div class="recipe-head">' +
        '<span class="recipe-swatch" style="background:' + swatch(outId) + '"></span>' +
        '<div class="recipe-title">' +
          '<strong>' + r.name + '</strong>' +
          '<span class="tier tier-' + r.tier + '">' + r.tier + '</span>' +
        '</div>' +
        '<span class="recipe-out">' + outLabel + '</span>' +
      '</div>' +
      '<p class="recipe-desc">' + r.desc + '</p>' +
      makeCost(r.cost, inv, gm) +
      '<button class="chip craft-btn" type="button" data-craft="' + r.id + '"' +
        (canCraft ? '' : ' disabled') + '>' + label + '</button>' +
    '</article>';
  }

  function render() {
    const e = engine();
    const inv = e && e.inventory ? e.inventory : {};
    const gm = gamemode();
    const hasEngine = !!e;

    if (noteEl) {
      noteEl.textContent = !hasEngine
        ? 'Press Play to start a world, then craft from your mined blocks.'
        : gm === 'creative'
          ? 'Creative mode: blocks are unlimited. Recipes are shown for reference.'
          : 'Mine blocks, then spend them here to turn common materials into better ones.';
    }

    let html = '';
    for (const t of TIERS) {
      const group = RECIPES.filter((r) => r.tier === t.key);
      if (!group.length) continue;
      html += '<section class="recipe-group">' +
        '<header><h3>' + t.label + '</h3><p>' + t.hint + '</p></header>' +
        '<div class="recipe-cards">' +
        group.map((r) => card(r, inv, gm, hasEngine)).join('') +
        '</div></section>';
    }
    listEl.innerHTML = html;
  }

  function craft(id) {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return;
    const e = engine();
    if (!e) { toast('Press Play to start a world'); return; }
    if (gamemode() === 'creative') {
      toast('Creative mode: all blocks are unlimited');
      return;
    }
    if (!e.craft) { toast('Crafting is unavailable'); return; }
    if (!canAfford(r.cost, e.inventory || {})) {
      toast('Not enough blocks for ' + r.name);
      render();
      return;
    }
    if (e.craft(r.cost, r.out)) {
      sfx('craft');
      toast('Crafted ' + outText(r.out));
    } else {
      toast('Not enough blocks for ' + r.name);
    }
    render();
  }

  function open() {
    if (!el || !el.classList.contains('hidden')) return;
    wasPlaying = document.body.classList.contains('playing');
    const e = engine();
    if (wasPlaying && e && e.pause) e.pause();
    render();
    el.classList.remove('hidden');
    sfx('ui');
  }

  function close() {
    if (!el || el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    if (wasPlaying && document.body.classList.contains('playing')) {
      const e = engine();
      if (e && e.resume) e.resume();
    }
    wasPlaying = false;
    sfx('ui');
  }

  function isOpen() {
    return !!el && !el.classList.contains('hidden');
  }

  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-craft]');
      if (!btn || btn.disabled) return;
      craft(btn.getAttribute('data-craft'));
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', close);
  if (el) {
    el.addEventListener('click', (ev) => {
      if (ev.target === el) close();
    });
  }

  const topBtn = document.getElementById('btn-recipes-game');
  const menuBtn = document.getElementById('btn-recipes');
  if (topBtn) topBtn.addEventListener('click', open);
  if (menuBtn) menuBtn.addEventListener('click', open);

  window.BCRecipes = { open, close, isOpen, render, list: RECIPES };
})();
