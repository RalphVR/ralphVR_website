// Tabletop Skater's site: the stickers on the table, the sounds (made in code), the move clips, the demo video, the
// screenshots' lightbox and the scroll reveals. The skater at the table's edge is js/rink.js. No libraries, no trackers.
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---------------------------------------------------------------- sounds
  // Web Audio, nothing recorded or downloaded: noise and sine thumps shaped into a board's sounds. Off until the
  // visitor presses the Sound switch (a browser won't start audio without a press anyway).
  const sound = (() => {
    let ctx = null, on = false, noise = null, rollGain = null, grindGain = null;
    function start() {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      rollGain = loop("lowpass", 380, 0.7);        // wheels on wood
      grindGain = loop("bandpass", 2700, 3.5);     // a truck on steel
    }
    function loop(type, freq, q) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(ctx.destination); src.start();
      return g;
    }
    function burst(type, freq, q, dur, vol) {
      const src = ctx.createBufferSource(); src.buffer = noise;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); const t = ctx.currentTime;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(ctx.destination); src.start(t, Math.random() * 0.5, dur + 0.02);
    }
    function thump(f0, f1, dur, vol) {
      const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
    }
    const level = (g, v) => { if (on && g) g.gain.setTargetAtTime(v, ctx.currentTime, 0.04); };
    return {
      get on() { return on; },
      toggle() {
        if (!ctx) start();
        on = !on;
        if (on) ctx.resume(); else { rollGain.gain.value = 0; grindGain.gain.value = 0; }
        return on;
      },
      pop() { if (on) { burst("highpass", 1900, 0.8, 0.05, 0.5); thump(230, 95, 0.08, 0.5); } },
      land() { if (on) { thump(150, 55, 0.13, 0.7); burst("bandpass", 900, 0.7, 0.06, 0.3); } },
      caught() { if (on) burst("bandpass", 2400, 2, 0.03, 0.35); },
      bail() { if (on) { thump(115, 40, 0.28, 0.8); burst("lowpass", 520, 0.5, 0.32, 0.4); } },
      slap() { if (on) { burst("bandpass", 1300, 1, 0.035, 0.5); thump(210, 120, 0.04, 0.3); } },
      roll(v) { level(rollGain, v * 0.1); },
      grind(v) { level(grindGain, v * 0.16); },
    };
  })();

  const soundBtn = $(".sound");
  if (soundBtn && (window.AudioContext || window.webkitAudioContext)) {
    soundBtn.hidden = false;
    soundBtn.addEventListener("click", () => {
      const on = sound.toggle();
      soundBtn.setAttribute("aria-pressed", String(on));
      soundBtn.querySelector("b").textContent = on ? "on" : "off";
      if (on) sound.slap();
    });
  }

  // ---------------------------------------------------------------- stickers on the table
  // The game's own stickers (assets/img/st-<name>.webp, sizes from build-assets.py).
  const STICKERS = { "skater": [296, 308], "deck": [280, 311], "wheel": [300, 284], "ramp": [300, 270], "city": [300, 291], "fingers": [300, 293], "shred": [272, 307], "kickflip-club": [300, 300], "grind-line": [295, 296], "xr-skate": [300, 300], "bolt-deck": [300, 293], "cone": [295, 288], "new-trick": [300, 281], "skull": [300, 284], "skater-worn": [286, 312], "deck-worn": [300, 238], "kicker": [300, 198], "spray": [300, 224], "helmet": [296, 240], "skyline": [300, 182], "crown": [300, 219], "dice": [300, 208], "bolt": [224, 236], "wing-wheel": [300, 198], "goggles": [300, 203], "sunset": [300, 205], "palms": [300, 206], "checker": [300, 182] };
  // Where the hero's first stickers lie: [name, x %, y %, width px, turn deg], clear of the title and the words.
  const WIDE = [["deck-worn", 10, 15, 170, -20], ["sunset", 89, 13, 180, 8], ["spray", 6, 44, 150, -9], ["wing-wheel", 93, 40, 170, 12],
                ["crown", 25, 9, 118, 7], ["cone", 76, 8, 104, -8], ["dice", 15, 66, 132, 13], ["grind-line", 86, 64, 128, -10],
                ["palms", 4, 70, 120, 5], ["bolt", 96, 68, 84, 16]];
  const NARROW = [["deck-worn", 7, 6, 104, -22], ["sunset", 93, 7, 110, 10], ["spray", 2, 31, 84, -9], ["wing-wheel", 99, 33, 96, 12], ["bolt", 95, 67, 58, 16]];
  const layer = $(".hero__stickers");
  const extras = [];
  const narrow = () => innerWidth < 760;

  function place(name, x, y, w, r, fresh) {
    const [sw, sh] = STICKERS[name];
    const img = new Image(sw, sh);
    img.src = `assets/img/st-${name}.webp`;
    img.alt = "";
    img.className = "sticker" + (fresh && !reduce ? " is-new" : "");
    img.dataset.name = name;
    img.style.cssText = `left:${x};top:${y};--w:${w}px;--r:${r}deg`;
    layer.appendChild(img);
    return img;
  }
  // Smack one down at a spot (pixels in the hero). The page keeps a dozen; the oldest peels away.
  function slap(px, py) {
    if (!layer) return;
    const shown = new Set($$(".sticker", layer).map(i => i.dataset.name));
    const free = Object.keys(STICKERS).filter(n => !shown.has(n));
    const name = (free.length ? free : Object.keys(STICKERS))[Math.floor(Math.random() * (free.length || 28))];
    const w = narrow() ? rand(64, 92) : rand(96, 142);
    extras.push(place(name, px + "px", py + "px", w, rand(-24, 24), true));
    sound.slap();
    if (extras.length > 12) {
      const old = extras.shift();
      old.classList.add("is-leaving");
      setTimeout(() => old.remove(), 600);
    }
  }
  // A spot beside the title (or above it on a phone), not on top of another sticker.
  function slapRandom() {
    if (!layer) return;
    const box = layer.getBoundingClientRect();
    const others = $$(".sticker", layer).map(i => i.getBoundingClientRect());
    for (let tries = 0; tries < 14; tries++) {
      const side = Math.random() < 0.5;
      const x = narrow() ? rand(0.06, 0.94) * box.width : (side ? rand(0.03, 0.24) : rand(0.76, 0.97)) * box.width;
      const y = (narrow() ? rand(0.02, 0.12) : rand(0.08, 0.68)) * box.height;
      const clear = others.every(o => Math.hypot(o.left + o.width / 2 - box.left - x, o.top + o.height / 2 - box.top - y) > (narrow() ? 70 : 150));
      if (clear || tries === 13) return slap(x, y);
    }
  }
  if (layer) {
    for (const [name, x, y, w, r] of narrow() ? NARROW : WIDE) place(name, x + "%", y + "%", w, r, false);
    $(".hero").addEventListener("click", e => {
      if (e.target.closest("a, button, .rink, .store-btn")) return;
      const box = layer.getBoundingClientRect();
      slap(e.clientX - box.left, e.clientY - box.top);
    });
  }

  // What the skater's script (rink.js) uses.
  window.TS = { sound, slapRandom, reduce };

  // ---------------------------------------------------------------- scroll reveals
  const reveals = $$(".reveal");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.12 });
    reveals.forEach(el => io.observe(el));
  } else reveals.forEach(el => el.classList.add("is-in"));

  // ---------------------------------------------------------------- the move clips: play while they're in view
  const clips = $$(".move__clip");
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) { const p = v.play(); if (p) p.catch(() => { v.controls = true; }); } else v.pause();
    }), { threshold: 0.35 });
    clips.forEach(v => { v.controls = false; io.observe(v); });
  }

  // ---------------------------------------------------------------- the demo video: YouTube, only once Play is pressed
  const video = $(".video[data-youtube]");
  function playVideo() {
    if (!video || video.classList.contains("is-playing")) return;
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${video.dataset.youtube}?autoplay=1&rel=0&playsinline=1`;
    f.title = "Tabletop Skater demonstration video";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.allowFullscreen = true;
    video.appendChild(f);
    video.classList.add("is-playing");
  }
  if (video) {
    $(".play", video).addEventListener("click", playVideo);
    $$("[data-play-video]").forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      video.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      playVideo();
    }));
  }

  // ---------------------------------------------------------------- screenshots: the lightbox
  const box = $(".lightbox");
  const shots = $$(".shots__strip button");
  if (box && box.showModal && shots.length) {
    const img = $("img", box);
    let at = 0;
    const show = i => {
      at = (i + shots.length) % shots.length;
      img.src = shots[at].dataset.full;
      img.alt = $("img", shots[at]).alt;
    };
    shots.forEach((b, i) => b.addEventListener("click", () => { show(i); box.showModal(); }));
    $(".lightbox__prev", box).addEventListener("click", () => show(at - 1));
    $(".lightbox__next", box).addEventListener("click", () => show(at + 1));
    $(".lightbox__close", box).addEventListener("click", () => box.close());
    box.addEventListener("click", e => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", e => {
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
  }
})();
