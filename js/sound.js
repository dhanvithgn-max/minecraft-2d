(() => {
  'use strict';

  let ac = null;

  function ctx() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function on() {
    return window.BC && BC.settings.sound;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const c = ctx();
    if (!c || !on()) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.05);
  }

  function noise(dur, vol, cutoff) {
    const c = ctx();
    if (!c || !on()) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const n = c.createBufferSource();
    n.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = vol;
    n.connect(f).connect(g).connect(c.destination);
    n.start();
  }

  window.BCSound = {
    unlock: ctx,
    jump: () => tone(320, 0.12, 'square', 0.07, 560),
    land: () => noise(0.09, 0.16, 500),
    mine: () => noise(0.05, 0.06, 1400),
    break: () => { noise(0.16, 0.22, 800); tone(170, 0.1, 'triangle', 0.09, 90); },
    place: () => { tone(230, 0.07, 'triangle', 0.13, 180); noise(0.05, 0.09, 700); },
    craft: () => { tone(460, 0.08, 'triangle', 0.1, 620); setTimeout(() => tone(680, 0.1, 'triangle', 0.09, 900), 70); },
    hurt: () => tone(340, 0.2, 'sawtooth', 0.11, 110),
    death: () => tone(240, 0.55, 'sawtooth', 0.13, 60),
    select: () => tone(520, 0.05, 'square', 0.05, 640),
    ui: () => tone(420, 0.06, 'square', 0.05, 520)
  };
})();
