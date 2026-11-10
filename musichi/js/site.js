/* Musichi website: the page as a small Musichi.

   The whole page is a room full of dust (a WebGL layer of glowing points over everything, which ignores the mouse).
   The music's waves pass through it as they do in the app: each beat or onset sends a wave out from where the action
   is, and every mote lights as the wave's front reaches it, then fades (the app's onset rule: light where the energy
   arrives, not where it sits). The headings and the staff lines light up as the fronts cross them too. The cursor (or
   a finger) is the hand: it carries the dust with it and lights it in the hand's blue, and it pulses on the beat.

   Four stages let you play the app's movements: a long line to trace (the hand gathers particles; the end bursts),
   arcs to swipe from their narrow ends, ringed orbs to push, and a room whose wall opens onto the app's cosmos once the
   motes have mapped a patch of it. Left alone for a few seconds, a ghost hand plays each one. The title is made of
   particles that spring to the letters of the in-game title and let go when you press the orb or scroll away.

   Without the field (prefers-reduced-motion, or no WebGL) the page shows still frames from the app instead. */
(function () {
  "use strict";

  const html = document.documentElement;
  const S = window.MusichiSound || null;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
  const frac = (v) => v - Math.floor(v);
  const rgba = (c, a) => `rgba(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0},${clamp(a, 0, 1).toFixed(3)})`;
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const WARM = [1, 0.93, 0.83];       // the dust's own colour
  const HAND = [0.55, 0.8, 1];        // the hand's light (the app's left-hand sky blue, softened)
  const LINE = [1, 0.97, 0.92];       // the lines of energy
  const WHITE = [1, 1, 1];

  const hooks = { wave: null };

  setupHints();
  setupLightbox();
  setupTrailer();
  setupSoundWords();
  if (reduced || !startField()) html.classList.add("still");

  // ================================================================================================================
  // Small page parts that work with or without the field
  // ================================================================================================================

  function setupHints() {
    document.querySelectorAll("[data-hint-fine]").forEach((el) => {
      el.textContent = fine ? el.dataset.hintFine : el.dataset.hintTouch;
    });
  }

  function setupLightbox() {
    const box = document.querySelector(".lightbox");
    const buttons = Array.from(document.querySelectorAll("[data-full]"));
    if (!box || !buttons.length || typeof box.showModal !== "function") return;
    const img = box.querySelector("img");
    let at = 0;
    const show = (i) => {
      at = (i + buttons.length) % buttons.length;
      img.src = buttons[at].dataset.full;
      img.alt = buttons[at].querySelector("img").alt;
    };
    buttons.forEach((b, i) => b.addEventListener("click", () => { show(i); box.showModal(); }));
    box.querySelector(".lightbox__prev").addEventListener("click", () => show(at - 1));
    box.querySelector(".lightbox__next").addEventListener("click", () => show(at + 1));
    box.querySelector(".lightbox__close").addEventListener("click", () => box.close());
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
  }

  function setupTrailer() {
    const film = document.querySelector(".film");
    const video = document.getElementById("trailer-video");
    if (!film || !video) return;
    video.controls = false;                 // the ringed orb first; the player's own controls once it plays
    const play = () => {
      if (S && S.Ear.mode === "song") S.Ear.stop();
      video.play().catch(() => {});
    };
    film.querySelector(".play").addEventListener("click", play);
    video.addEventListener("play", () => {
      film.classList.add("is-playing");
      video.controls = true;
      if (S && S.Ear.mode === "song") S.Ear.stop();
    });
    document.querySelectorAll("[data-play-trailer]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      film.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      setTimeout(play, reduced ? 0 : 700);
    }));
  }

  function setupSoundWords() {
    document.querySelectorAll("[data-sound]").forEach((b) => {
      if (!S || !S.available) { b.disabled = true; return; }
      b.addEventListener("click", () => {
        S.Sfx.play(b.dataset.sound, { force: true });
        b.classList.add("is-playing");
        setTimeout(() => b.classList.remove("is-playing"), 1600);
        if (hooks.wave) {
          const r = b.getBoundingClientRect();
          hooks.wave(r.left + r.width / 2, r.top + r.height / 2);
        }
      });
    });
  }

  /** The ear's controls: Listen (the microphone), Play a song, and sounds on or off. Returns the meter's bars. */
  function setupEar() {
    if (!S || !S.available) { html.classList.add("no-audio"); return null; }
    if (!S.Ear.canListen) html.classList.add("no-mic");
    const bar = document.querySelector(".ear");
    if (!bar) return null;
    bar.hidden = false;
    const status = bar.querySelector(".ear__status");
    const listenBtns = Array.from(document.querySelectorAll("[data-listen]"));
    const songBtns = Array.from(document.querySelectorAll("[data-song]"));
    const sfxBtn = bar.querySelector("[data-sfx]");
    let timer = 0;
    const say = (msg, ms) => {
      status.textContent = msg;
      status.classList.add("is-shown");
      clearTimeout(timer);
      timer = setTimeout(() => status.classList.remove("is-shown"), ms || 3200);
    };
    const render = () => {
      const m = S.Ear.mode;
      listenBtns.forEach((b) => b.setAttribute("aria-pressed", String(m === "mic")));
      songBtns.forEach((b) => b.setAttribute("aria-pressed", String(m === "song")));
      const ll = bar.querySelector("[data-listen] .ear__label");
      const sl = bar.querySelector("[data-song] .ear__label");
      if (ll) ll.textContent = m === "mic" ? "Listening" : "Listen";
      if (sl) sl.textContent = m === "song" ? "Stop the song" : "Play a song";
      sfxBtn.setAttribute("aria-pressed", String(S.Sfx.on));
      bar.classList.toggle("is-hearing", m !== "off");
    };
    S.Ear.onChange = render;
    listenBtns.forEach((b) => b.addEventListener("click", () => {
      if (S.Ear.mode === "mic") {
        S.Ear.stop();
        say("Stopped listening. The microphone is off.");
        return;
      }
      say("Your browser will ask to use the microphone.", 6000);
      S.Ear.listen().then(() => say("Listening. Play some music nearby; nothing is recorded.", 4200)).catch((err) => {
        say(err && err.name === "NotAllowedError" ? "The microphone wasn't allowed, so nothing changed."
          : "No microphone could be opened here.", 4500);
        render();
      });
    }));
    songBtns.forEach((b) => b.addEventListener("click", () => {
      if (S.Ear.mode === "song") { S.Ear.stop(); return; }
      S.Ear.playSong();
      S.Sfx.on = true;            // the visitor chose sound: the page's own sounds join the song
      render();
      say("A song made by this page, in your browser. The page hears it the way it would hear yours.", 4200);
    }));
    sfxBtn.addEventListener("click", () => {
      S.Sfx.on = !S.Sfx.on;
      if (S.Sfx.on) S.Sfx.play("bell", { note: 81, gain: 0.35 });
      render();
      say(S.Sfx.on ? "Sounds on: bowls, bells and air as you play." : "Sounds off.", 2200);
    });
    render();
    return Array.from(bar.querySelectorAll(".ear__meter i"));
  }

  // ================================================================================================================
  // The dust layer: WebGL points, additive, each a soft glow with a bright core
  // ================================================================================================================

  function makeGL(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    } catch (e) { gl = null; }
    if (!gl) return null;
    const vs = [
      "attribute vec2 a_pos; attribute float a_size; attribute vec4 a_col;",
      "uniform vec2 u_view; uniform float u_dpr; varying vec4 v_col;",
      "void main() {",
      "  vec2 p = a_pos / u_view * 2.0 - 1.0;",
      "  gl_Position = vec4(p.x, -p.y, 0.0, 1.0);",
      "  gl_PointSize = max(1.0, a_size * 2.0 * u_dpr);",
      "  v_col = a_col;",
      "}",
    ].join("\n");
    const fs = [
      "precision mediump float; varying vec4 v_col;",
      "void main() {",
      "  vec2 c = gl_PointCoord * 2.0 - 1.0;",
      "  float d = dot(c, c);",
      "  if (d > 1.0) discard;",
      "  float a = 0.78 * exp(-d * 9.0) + 0.22 * exp(-d * 2.6) - 0.016;",
      "  gl_FragColor = v_col * max(a, 0.0);",
      "}",
    ].join("\n");
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      const attr = (name, n, off) => {
        const loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 28, off);
      };
      attr("a_pos", 2, 0);
      attr("a_size", 1, 8);
      attr("a_col", 4, 12);
      const uView = gl.getUniformLocation(prog, "u_view");
      const uDpr = gl.getUniformLocation(prog, "u_dpr");
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      let cap = 0;
      return {
        resize(w, h, dpr) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(uView, w, h);
          gl.uniform1f(uDpr, dpr);
        },
        draw(data, count) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          if (!count) return;
          if (cap < data.byteLength) { gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW); cap = data.byteLength; }
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * 7));
          gl.drawArrays(gl.POINTS, 0, count);
        },
      };
    } catch (e) {
      return null;
    }
  }

  // ================================================================================================================
  // The field
  // ================================================================================================================

  function startField() {
    const lightCanvas = document.createElement("canvas");
    const dustCanvas = document.createElement("canvas");
    lightCanvas.className = "light-layer";
    dustCanvas.className = "dust-layer";
    lightCanvas.setAttribute("aria-hidden", "true");
    dustCanvas.setAttribute("aria-hidden", "true");
    document.body.append(lightCanvas, dustCanvas);
    const glr = makeGL(dustCanvas);
    const g = lightCanvas.getContext("2d");
    if (!glr || !g) {
      lightCanvas.remove();
      dustCanvas.remove();
      return false;
    }
    html.classList.add("field");
    const meter = setupEar();
    const earBar = document.querySelector(".ear");

    // ---------- the view ----------
    let vw = 0, vh = 0, dpr = 1, diag = 1;
    function resize() {
      vw = document.documentElement.clientWidth || window.innerWidth;     // the fixed layers' size: no scrollbar
      vh = document.documentElement.clientHeight || window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      diag = Math.hypot(vw, vh);
      lightCanvas.width = Math.round(vw * dpr);
      lightCanvas.height = Math.round(vh * dpr);
      glr.resize(vw, vh, dpr);
      fitDust();
    }

    // ---------- the dust ----------
    const MAXD = fine ? 2600 : 1300;
    const dx = new Float32Array(MAXD), dy = new Float32Array(MAXD), dz = new Float32Array(MAXD);
    const dvx = new Float32Array(MAXD), dvy = new Float32Array(MAXD);
    const dl = new Float32Array(MAXD), dc = new Float32Array(MAXD), dh = new Float32Array(MAXD);
    const dr = new Float32Array(MAXD), dg = new Float32Array(MAXD), db = new Float32Array(MAXD);
    const dd = new Uint8Array(MAXD);          // 1 while drawn into the hand's energy
    let nD = 0;
    function fitDust() {
      const want = clamp(Math.round(vw * vh / 560), 400, MAXD);
      for (let i = nD; i < want; i++) {
        dx[i] = rand(0, vw); dy[i] = rand(0, vh); dz[i] = Math.pow(Math.random(), 0.8);
        dvx[i] = dvy[i] = dl[i] = dc[i] = 0; dd[i] = 0;
        dr[i] = dg[i] = db[i] = 1; dh[i] = Math.random();
      }
      nD = Math.max(nD, want);
    }

    // ---------- the forming motes: the title, and a reveal's patch of the room ----------
    const MAXF = fine ? 3400 : 1600;
    const fx = new Float32Array(MAXF), fy = new Float32Array(MAXF), fvx = new Float32Array(MAXF), fvy = new Float32Array(MAXF);
    const ftx = new Float32Array(MAXF), fty = new Float32Array(MAXF), fl = new Float32Array(MAXF);
    const fr = new Float32Array(MAXF), fg = new Float32Array(MAXF), fb = new Float32Array(MAXF);
    const flr = new Float32Array(MAXF), flg = new Float32Array(MAXF), flb = new Float32Array(MAXF);
    const form = { mode: "none", phase: "", t: 0, n: 0, glow: 1, k0: 18, k1: 160, rise: 2.4, ax: 0, ay: 0, size: 3.4 };

    function formStart(mode, n, k0, k1, rise, size) {
      const fresh = form.mode === "none";
      for (let i = 0; i < n; i++) {
        if (fresh || i >= form.n) { fx[i] = rand(-0.1, 1.1) * vw; fy[i] = rand(-0.1, 1.1) * vh; fvx[i] = fvy[i] = 0; }
        fl[i] = 0;
      }
      Object.assign(form, { mode, phase: "forming", t: 0, n, glow: 1, k0, k1, rise, size });
    }
    function formLetGo(cx, cy, speed) {
      if (form.mode === "none" || form.phase === "letgo") return;
      for (let i = 0; i < form.n; i++) {
        const ddx = fx[i] - cx, ddy = fy[i] - cy, d = Math.hypot(ddx, ddy) + 1e-3;
        const s = speed * rand(0.25, 1);
        fvx[i] += ddx / d * s + rand(-30, 30);
        fvy[i] += ddy / d * s + rand(-30, 30);
      }
      form.phase = "letgo";
      form.t = 0;
    }

    // ---------- the title ----------
    const titleImg = document.querySelector(".title__img");
    const prelude = document.querySelector(".prelude");
    const beginBtn = document.querySelector(".begin");
    let titleSet = null, titleReady = false, heroBack = 0;
    const P = { gone: false, pressing: false };

    /** The in-game title's bright pixels at the size it's shown: each becomes a mote's place, with its colour. */
    function sampleTitle(w) {
      const h = w * titleImg.naturalHeight / titleImg.naturalWidth;
      const cw = Math.max(1, Math.round(w)), ch = Math.max(1, Math.round(h));
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(titleImg, 0, 0, cw, ch);
      const data = x.getImageData(0, 0, cw, ch).data;
      const step = clamp(w / 330, 2, 3.8);
      const cand = [];
      for (let y = step / 2; y < ch; y += step) {
        for (let xx = step / 2; xx < cw; xx += step) {
          const px = clamp(Math.round(xx + rand(-0.35, 0.35) * step), 0, cw - 1);
          const py = clamp(Math.round(y + rand(-0.35, 0.35) * step), 0, ch - 1);
          const o = (py * cw + px) * 4;
          const lum = (data[o] + data[o + 1] + data[o + 2]) / 765 * (data[o + 3] / 255);
          if (lum > 0.42) cand.push(px, py, data[o], data[o + 1], data[o + 2]);
        }
      }
      const count = cand.length / 5, n = Math.min(count, MAXF);
      const idx = Array.from({ length: count }, (_, i) => i);
      for (let i = 0; i < n; i++) { const j = i + ((Math.random() * (count - i)) | 0); const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      const pts = new Float32Array(n * 5);
      for (let i = 0; i < n; i++) {
        const o = idx[i] * 5, m = Math.max(cand[o + 2], cand[o + 3], cand[o + 4], 1);
        pts.set([cand[o], cand[o + 1], cand[o + 2] / m, cand[o + 3] / m, cand[o + 4] / m], i * 5);
      }
      return { w: cw, n, pts };
    }

    function formTitle() {
      if (!titleReady || form.mode === "patch") return;
      const r = titleImg.getBoundingClientRect();
      if (!titleSet || Math.abs(titleSet.w - r.width) > r.width * 0.04) titleSet = sampleTitle(r.width);
      formStart("title", titleSet.n, 16, 170, 2.4, fine ? 3.3 : 2.8);
      for (let i = 0; i < titleSet.n; i++) {
        const o = i * 5;
        ftx[i] = titleSet.pts[o]; fty[i] = titleSet.pts[o + 1];
        fr[i] = titleSet.pts[o + 2]; fg[i] = titleSet.pts[o + 3]; fb[i] = titleSet.pts[o + 4];
      }
      P.gone = false;
      beginBtn.classList.remove("is-gone");
    }

    function orbCentre() {
      const r = beginBtn.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function doBegin() {
      if (P.gone) return;
      const c = orbCentre();
      P.gone = true;
      P.pressing = false;
      beginBtn.classList.add("is-gone");
      sparks(c.x, c.y, 170, 160, 620, [WARM, music], 1.1);
      emitWave(1.2, music.slice(), c);
      if (form.mode === "title") formLetGo(c.x, c.y, 300);
      if (S) S.Sfx.play("bowl");
      setTimeout(() => document.getElementById("overture").scrollIntoView({ behavior: "smooth" }), 950);
    }
    beginBtn.addEventListener("pointerdown", () => { P.pressing = true; });
    beginBtn.addEventListener("pointerleave", () => { P.pressing = false; });
    beginBtn.addEventListener("click", (e) => { e.preventDefault(); doBegin(); });

    // ---------- waves ----------
    const waves = [];
    const WMAX = 8;
    let waveV = 1, waveW = 60;
    const wx = new Float32Array(WMAX), wy = new Float32Array(WMAX), wr = new Float32Array(WMAX), ws = new Float32Array(WMAX);
    let nW = 0;
    let handBeat = 0, beatPulse = 0;

    function emitWave(strength, col, at) {
      const p = at || focusPoint();
      if (waves.length >= WMAX) waves.shift();
      waves.push({ x: p.x, py: p.y + window.scrollY, age: 0, s: strength, c: col });
      handBeat = Math.max(handBeat, 0.35 + 0.65 * strength);
      beatPulse = Math.max(beatPulse, Math.min(1, 0.35 + strength));
    }
    hooks.wave = (x, y) => emitWave(0.8, music.slice(), { x, y });

    // ---------- the hands ----------
    const hand = { x: -9999, y: -9999, vx: 0, vy: 0, sp: 0, ts: 0, seen: -99, moved: -99, down: false, touchEnd: -99, active: false };
    const ghost = { x: 0, y: 0, vx: 0, vy: 0, sp: 0, active: false, owner: null, ghost: true };
    let clock = 0;

    function moveHand(x, y, ts) {
      const dt = (ts - hand.ts) / 1000;
      if (hand.ts && dt > 0.002 && dt < 0.25) {
        const k = ease(dt, 0.035);
        hand.vx += ((x - hand.x) / dt - hand.vx) * k;
        hand.vy += ((y - hand.y) / dt - hand.vy) * k;
      } else if (!(dt > 0 && dt <= 0.002)) {
        hand.vx = hand.vy = 0;
      }
      hand.x = x; hand.y = y; hand.ts = ts;
      hand.seen = hand.moved = clock;
    }
    window.addEventListener("pointermove", (e) => { if (e.pointerType !== "touch") moveHand(e.clientX, e.clientY, e.timeStamp); }, { passive: true });
    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return;
      moveHand(e.clientX, e.clientY, e.timeStamp);
      hand.down = true;
      pressAt(e.clientX, e.clientY);
    }, { passive: true });
    window.addEventListener("pointerup", () => { hand.down = false; }, { passive: true });
    document.documentElement.addEventListener("mouseleave", () => { hand.seen = -99; });
    window.addEventListener("blur", () => { hand.seen = -99; });
    window.addEventListener("touchstart", (e) => {
      const t0 = e.touches[0];
      hand.ts = 0;
      moveHand(t0.clientX, t0.clientY, e.timeStamp);
      hand.down = true;
      pressAt(t0.clientX, t0.clientY);
    }, { passive: true });
    window.addEventListener("touchmove", (e) => { const t0 = e.touches[0]; moveHand(t0.clientX, t0.clientY, e.timeStamp); }, { passive: true });
    window.addEventListener("touchend", (e) => { if (!e.touches.length) { hand.down = false; hand.touchEnd = clock; } }, { passive: true });

    function ghostMove(x, y, dt) {
      if (dt > 0) { ghost.vx = (x - ghost.x) / dt; ghost.vy = (y - ghost.y) / dt; }
      ghost.x = x; ghost.y = y;
      ghost.sp = Math.hypot(ghost.vx, ghost.vy);
    }
    /** Move the ghost toward (x, y) at `speed` px/s; true once it's there. */
    function ghostSeek(x, y, speed, dt) {
      const ex = x - ghost.x, ey = y - ghost.y, d = Math.hypot(ex, ey);
      if (d <= speed * dt + 0.5) { ghostMove(x, y, dt); return true; }
      ghostMove(ghost.x + ex / d * speed * dt, ghost.y + ey / d * speed * dt, dt);
      return false;
    }

    // ---------- the hand's energy (gathered while tracing a line) ----------
    const energy = { amount: 0, hand: null, drawn: 0 };
    function releaseEnergy(explode) {
      const H = energy.hand;
      for (let i = 0; i < nD; i++) {
        if (!dd[i]) continue;
        dd[i] = 0;
        let ex = H ? dx[i] - H.x : rand(-1, 1), ey = H ? dy[i] - H.y : rand(-1, 1);
        const d = Math.hypot(ex, ey) || 1;
        ex /= d; ey /= d;
        const s = explode ? 560 * rand(0.75, 1.25) : rand(60, 170);
        dvx[i] = ex * s + (H ? H.vx * 0.25 : 0);
        dvy[i] = ey * s + (H ? H.vy * 0.25 : 0);
        dc[i] = explode ? 1.2 : 0.6;
      }
      energy.amount = 0;
      energy.drawn = 0;
      energy.hand = null;
    }

    // ---------- sparks (shards), drawn as streaks ----------
    const MAXS = 1200;
    const sx = new Float32Array(MAXS), sy = new Float32Array(MAXS), svx = new Float32Array(MAXS), svy = new Float32Array(MAXS);
    const sl = new Float32Array(MAXS).fill(9), sm = new Float32Array(MAXS).fill(1), sw = new Float32Array(MAXS);
    const scol = new Array(MAXS).fill(WARM);
    let sNext = 0;
    /** Throw `n` shards from (x, y) at speeds from vmin to vmax, coloured from `cols`. opts: dir and spread (radians). */
    function sparks(x, y, n, vmin, vmax, cols, glow, opts) {
      opts = opts || {};
      for (let k = 0; k < n; k++) {
        const i = sNext++ % MAXS;
        const a = opts.dir != null ? opts.dir + rand(-opts.spread, opts.spread) : rand(0, TAU);
        const s = rand(vmin, vmax);
        sx[i] = x + (opts.jx ? rand(-opts.jx, opts.jx) : 0);
        sy[i] = y + (opts.jy ? rand(-opts.jy, opts.jy) : 0);
        svx[i] = Math.cos(a) * s; svy[i] = Math.sin(a) * s;
        sl[i] = 0; sm[i] = rand(0.9, 1.8); sw[i] = glow || 1;
        const c = cols[(Math.random() * cols.length) | 0];
        scol[i] = mix(c, WHITE, rand(0, 0.35));
      }
    }

    // ---------- stages ----------
    const stages = Array.from(document.querySelectorAll("[data-stage]")).map((el) => ({
      el, kind: el.dataset.stage, vis: 0, rect: null, idle: 0, captured: false, toy: null,
    }));
    const byEl = new Map(stages.map((s) => [s.el, s]));
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const s = byEl.get(en.target);
        s.vis = en.isIntersecting ? en.intersectionRatio : 0;
        if (s.vis > 0 && s.toy.onSeen) s.toy.onSeen();
      }
    }, { threshold: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1] });
    stages.forEach((s) => {
      s.toy = ({ line: makeLine, arcs: makeArcs, orbs: makeOrbs, cosmos: makeCosmos })[s.kind](s);
      io.observe(s.el);
      // A finger that starts on something to trace keeps the page still while it traces; elsewhere it scrolls.
      s.el.addEventListener("touchstart", (e) => {
        const t0 = e.touches[0];
        s.captured = !!(s.rect && s.toy.wantsTouch && s.toy.wantsTouch(t0.clientX, t0.clientY));
      }, { passive: true });
      s.el.addEventListener("touchmove", (e) => { if (s.captured && e.cancelable) e.preventDefault(); }, { passive: false });
      s.el.addEventListener("touchend", () => { s.captured = false; }, { passive: true });
    });
    let activeStage = null;

    const inRect = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

    /** The hands this stage feels: the visitor's (when over it) and the ghost (when it's playing this stage). */
    function handsFor(st) {
      const list = [];
      if (hand.active && inRect(st.rect, hand.x, hand.y, 50)) list.push(hand);
      if (ghost.active && ghost.owner === st) list.push(ghost);
      return list;
    }

    function pressAt(x, y) {
      for (const s of stages) {
        if (s.vis > 0 && s.rect && s.toy.press && inRect(s.rect, x, y, 30)) s.toy.press(x, y);
      }
    }

    /** Where the next wave starts: the action in view, else the title's orb, else a slowly wandering point. */
    let heroVisible = true;
    function focusPoint() {
      if (activeStage && activeStage.toy.focus) {
        const f = activeStage.toy.focus();
        if (f) return f;
      }
      if (heroVisible && !P.gone) return orbCentre();
      return { x: vw * (0.5 + 0.32 * Math.sin(clock * 0.13)), y: vh * (0.55 + 0.25 * Math.sin(clock * 0.09 + 1)) };
    }

    // ---------- the headings and staff lines the waves wash over ----------
    const lits = Array.from(document.querySelectorAll(".lit")).map((el) => ({ el, on: false, glow: 0, shown: -1, col: "" }));
    const litIO = new IntersectionObserver((entries) => {
      for (const en of entries) { const l = lits.find((x) => x.el === en.target); if (l) l.on = en.isIntersecting; }
    });
    lits.forEach((l) => litIO.observe(l.el));

    // ---------- the music ----------
    const music = [1, 0.95, 0.88];
    // Without music, the pulse's colours are the chords' (the app's rule), softened toward white: the full colours
    // are for when the page really hears music.
    const chordCols = S ? S.CHORDS.map((c) => mix(S.chordColour(c.pad), WHITE, 0.4)) : [[1, 0.9, 0.8]];
    let pulseT = 0.6, pulseN = 0, quietT = 0, loud = 0.45;

    // ---------- the frame ----------
    const pdata = new Float32Array((MAXD + MAXF) * 7);
    let last = performance.now(), lastScroll = window.scrollY;
    resize();
    window.addEventListener("resize", resize);
    const titleLoaded = () => {
      titleReady = titleImg.naturalWidth > 0;
      if (titleReady && window.scrollY < vh * 0.4) formTitle();
    };
    if (titleImg.complete) titleLoaded(); else titleImg.addEventListener("load", titleLoaded, { once: true });

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      clock += dt;
      const sY = window.scrollY, sdy = sY - lastScroll;
      lastScroll = sY;

      // The music: the ear when it's listening, else a calm pulse a second through Am, F, C, G.
      const earOn = S && S.Ear.mode !== "off";
      let onset = 0, target = music;
      if (earOn) {
        onset = S.Ear.frame(dt);
        target = S.Ear.colour;
        loud = S.Ear.loud;
        quietT = S.Ear.silent ? quietT + dt : 0;
        if (quietT > 2.5 && (pulseT += dt) >= 2) { pulseT = 0; onset = 0.28; }
      } else {
        loud = 0.45;
        if ((pulseT += dt) >= 1) {
          pulseT -= 1;
          pulseN++;
          onset = pulseN % 4 === 1 ? 0.72 : 0.48;
        }
        target = chordCols[Math.floor(pulseN / 4) % chordCols.length];
      }
      for (let k = 0; k < 3; k++) music[k] += (target[k] - music[k]) * ease(dt, 0.4);
      if (meter) {
        const lvl = S.Ear.level;
        meter.forEach((m, i) => { m.style.opacity = lvl * 5 > i + 0.3 ? 1 : 0.15; });
      }

      // The hand.
      if (clock - hand.moved > 0.05) { const k = Math.exp(-dt / 0.06); hand.vx *= k; hand.vy *= k; }
      hand.sp = Math.hypot(hand.vx, hand.vy);
      hand.active = fine ? clock - hand.seen < 3 : (hand.down || clock - hand.touchEnd < 0.3);
      if (ghost.active) ghost.y -= sdy;  // the ghost belongs to its stage, so it rides the scroll
      // Energy held by a hand that's gone (the pointer left, the ghost stopped) scatters.
      if (energy.hand && !energy.hand.active) releaseEnergy(false);

      // The stages.
      const heroBottom = prelude.getBoundingClientRect().bottom;
      heroVisible = heroBottom > 0;
      // The ear's bar waits below while the prelude's own invitation is on screen (unless it's already listening).
      if (earBar) earBar.classList.toggle("is-tucked", heroBottom > vh * 0.55 && !earOn);
      activeStage = null;
      let best = 0.3;
      for (const s of stages) {
        if (s.vis <= 0) continue;
        s.rect = s.el.getBoundingClientRect();
        if (hand.active && inRect(s.rect, hand.x, hand.y, 10) && (hand.sp > 20 || hand.down)) s.idle = 0;
        else s.idle += dt;
        if (s.vis > best) { best = s.vis; activeStage = s; }
      }
      // The ghost plays the stage in view once it's been left alone for a while.
      const wantGhost = activeStage && activeStage.toy.ghost && activeStage.idle > 3.5;
      if (wantGhost) {
        if (!ghost.active || ghost.owner !== activeStage) {
          const r = activeStage.rect;
          ghost.x = r.left + r.width * 0.5; ghost.y = r.top + r.height * 0.9;
          ghost.vx = ghost.vy = ghost.sp = 0;
          ghost.active = true;
          ghost.owner = activeStage;
          activeStage.toy.ghostReset && activeStage.toy.ghostReset();
        }
        activeStage.toy.ghost(dt);
      } else if (ghost.active) {
        ghost.active = false;
        ghost.owner = null;
      }
      for (const s of stages) if (s.vis > 0) s.toy.update(dt, handsFor(s));

      if (onset) emitWave(onset, music.slice());

      // The title: forms when the prelude is in view, lets go when it's scrolled away.
      if (titleReady) {
        const tr = titleImg.getBoundingClientRect();
        if (form.mode === "title") { form.ax = tr.left; form.ay = tr.top; }
        if (form.mode === "title" && form.phase !== "letgo" && tr.bottom < vh * 0.2) formLetGo(tr.left + tr.width / 2, tr.top + tr.height / 2, 90);
        if (form.mode === "none" && tr.top > -tr.height * 0.2 && tr.bottom < vh) {
          heroBack += dt;
          if (heroBack > 0.7) formTitle();
        } else heroBack = 0;
      }

      // Waves: their fronts in this frame, in view coordinates.
      waveV = 0.6 * diag;
      waveW = 44 + 0.014 * diag;
      for (let k = waves.length - 1; k >= 0; k--) {
        waves[k].age += dt;
        if (waves[k].age * waveV > diag * 1.3) waves.splice(k, 1);
      }
      nW = waves.length;
      for (let k = 0; k < nW; k++) {
        const w = waves[k], r = w.age * waveV;
        wx[k] = w.x; wy[k] = w.py - sY; wr[k] = r;
        ws[k] = w.s / (1 + r / (1.6 * diag)) * (1 - smooth((r - diag) / (0.3 * diag)));
      }
      handBeat *= Math.exp(-dt / 0.22);
      beatPulse *= Math.exp(-dt / 0.2);

      updateDust(dt, sdy, earOn);
      updateForm(dt, sdy);
      updateSparks(dt, sdy);
      updateLits(dt);

      // Draw.
      let pc = writeDust(earOn);
      pc = writeForm(pc);
      glr.draw(pdata, pc);
      drawLight();
      requestAnimationFrame(frame);
    }

    // The light a wave front gives a point, and which wave gave it.
    let lastWave = -1;
    function waveLight(x, y) {
      let best = 0;
      lastWave = -1;
      for (let k = 0; k < nW; k++) {
        const ex = x - wx[k], ey = y - wy[k];
        const u = Math.abs(Math.sqrt(ex * ex + ey * ey) - wr[k]) / waveW;
        if (u < 1) {
          const l = ws[k] * (1 - u) * (1 - u);
          if (l > best) { best = l; lastWave = k; }
        }
      }
      return best;
    }

    function updateDust(dt, sdy, earOn) {
      const hands = [];
      if (hand.active) hands.push(hand);
      if (ghost.active) hands.push(ghost);
      const R = fine ? 120 : 140, R2 = R * R;
      const decay = Math.exp(-dt / 0.42), cdecay = Math.exp(-dt / 1.2);
      const t = clock;
      // Draw dust into the energy round the tracing hand (up to half the dust near it at full energy).
      const E = energy.hand ? energy.amount : 0;
      const cap = fine ? 420 : 220;
      for (let i = 0; i < nD; i++) {
        let x = dx[i], y = dy[i] - sdy * (0.35 + 0.8 * dz[i]);
        let vx = dvx[i], vy = dvy[i];
        if (dd[i]) {
          const H = energy.hand;
          const h = dh[i];
          const ang = h * TAU * 7 + t * (1.4 + 2.4 * frac(h * 31)) * (h > 0.5 ? 1 : -1);
          const rad = (8 + 26 * frac(h * 57)) * (1 + 0.35 * handBeat);
          const tx = H.x + Math.cos(ang) * rad, ty = H.y + Math.sin(ang) * rad * 0.8;
          const k = 70, c = 2 * Math.sqrt(k);
          vx += (k * (tx - x) - c * (vx - H.vx)) * dt;
          vy += (k * (ty - y) - c * (vy - H.vy)) * dt;
          dc[i] = Math.max(dc[i], 0.4 + 0.3 * handBeat);
        } else {
          // A slow drift, different at every depth.
          const fxw = Math.sin(y * 0.0042 + t * 0.11 + dz[i] * 4) + 0.6 * Math.sin(x * 0.0021 - t * 0.07);
          const fyw = Math.cos(x * 0.0037 - t * 0.09 + dz[i] * 2.7) + 0.5 * Math.sin(y * 0.0026 + t * 0.05);
          const sp = 4 + 7 * dz[i];
          const k = ease(dt, 1.2);
          vx += (fxw * sp - vx) * k;
          vy += (fyw * sp - vy) * k;
          for (let m = 0; m < hands.length; m++) {
            const H = hands[m];
            const ex = x - H.x, ey = y - H.y, d2 = ex * ex + ey * ey;
            if (d2 > R2) continue;
            const d = Math.sqrt(d2), f = 1 - d / R, f2 = f * f;
            if (H.sp > 25) {
              const gk = ease(dt, 1 / (14 * f2 + 1e-3));
              vx += (H.vx * 0.85 - vx) * gk;
              vy += (H.vy * 0.85 - vy) * gk;
              dc[i] = Math.max(dc[i], f2 * clamp((H.sp - 40) / 700, 0, 1) * 1.3);
            }
            if (d < 34 && d > 0.01) { vx += ex / d * 140 * (1 - d / 34) * dt; vy += ey / d * 140 * (1 - d / 34) * dt; }
            if (E > 0 && H === energy.hand && energy.drawn < cap && dh[i] < E * 0.5 && d < 200) { dd[i] = 1; energy.drawn++; }
          }
        }
        x += vx * dt;
        y += vy * dt;
        if (!dd[i]) {
          if (x < -30) x += vw + 60; else if (x > vw + 30) x -= vw + 60;
          if (y < -30) y += vh + 60; else if (y > vh + 30) y -= vh + 60;
        }
        dx[i] = x; dy[i] = y; dvx[i] = vx; dvy[i] = vy;
        // Light: where a wave's front is now; it fades after (a 0.4 s afterglow).
        let l = dl[i] * decay;
        if (nW) {
          const wl = waveLight(x, y);
          if (wl > l) {
            l = wl;
            const c = waves[lastWave].c;
            dr[i] = c[0]; dg[i] = c[1]; db[i] = c[2];
          }
        }
        dl[i] = l;
        dc[i] *= cdecay;
      }
    }

    function writeDust(earOn) {
      let p = 0;
      const lk = earOn ? lerp(0.7, 1.45, loud) : 1;
      const sk = earOn ? 1 + 0.25 * loud : 1;
      for (let i = 0; i < nD; i++) {
        const z = dz[i];
        const base = 0.05 + 0.12 * z * z;
        const lit = dl[i] * (0.5 + 0.65 * z);
        const ch = dc[i] * 0.9;
        const b = (base + lit + ch) * lk;
        if (b < 0.015) continue;
        const sum = base + lit + ch;
        const r = (WARM[0] * base + dr[i] * lit + HAND[0] * ch) / sum;
        const gg = (WARM[1] * base + dg[i] * lit + HAND[1] * ch) / sum;
        const bb = (WARM[2] * base + db[i] * lit + HAND[2] * ch) / sum;
        const size = (1.7 + 2.8 * z) * (1 + 0.55 * Math.min(1, lit + ch)) * sk;
        const o = p * 7;
        const bc = Math.min(b, 1.6);
        pdata[o] = dx[i]; pdata[o + 1] = dy[i]; pdata[o + 2] = size;
        pdata[o + 3] = r * bc; pdata[o + 4] = gg * bc; pdata[o + 5] = bb * bc;
        pdata[o + 6] = Math.min(1, Math.max(r, gg, bb) * bc * 0.85);
        p++;
      }
      return p;
    }

    function updateForm(dt, sdy) {
      if (form.mode === "none") return;
      form.t += dt;
      const n = form.n;
      const decay = Math.exp(-dt / 0.4);
      for (let i = 0; i < n; i++) {
        fy[i] -= sdy;
        let l = fl[i] * decay;
        if (nW) {
          const wl = waveLight(fx[i], fy[i]);
          if (wl > l) { l = wl; const c = waves[lastWave].c; flr[i] = c[0]; flg[i] = c[1]; flb[i] = c[2]; }
        }
        fl[i] = l;
      }
      if (form.phase === "letgo") {
        const k = Math.exp(-dt * 1.6);
        for (let i = 0; i < n; i++) { fvx[i] *= k; fvy[i] *= k; fx[i] += fvx[i] * dt; fy[i] += fvy[i] * dt; }
        form.glow = Math.max(0, 1 - form.t / 2.4);
        if (form.t > 2.6) { form.mode = "none"; form.n = 0; }
        return;
      }
      const k = form.phase === "forming" ? lerp(form.k0, form.k1, smooth((form.t - form.rise * 0.5) / (form.rise * 0.6))) : form.k1;
      const c = 2 * Math.sqrt(k);
      const ax = form.ax, ay = form.ay;
      for (let i = 0; i < n; i++) {
        fvx[i] += (k * (ax + ftx[i] - fx[i]) - c * fvx[i]) * dt;
        fvy[i] += (k * (ay + fty[i] - fy[i]) - c * fvy[i]) * dt;
        fx[i] += fvx[i] * dt;
        fy[i] += fvy[i] * dt;
      }
      if (form.phase === "forming" && form.t > form.rise + 0.5) form.phase = "held";
    }

    function writeForm(p) {
      if (form.mode === "none") return p;
      const n = form.n, t = clock;
      const title = form.mode === "title";
      for (let i = 0; i < n; i++) {
        const ex = form.ax + ftx[i] - fx[i], ey = form.ay + fty[i] - fy[i];
        const arrive = form.phase === "letgo" ? 1 : 0.25 + 0.75 * Math.exp(-Math.sqrt(ex * ex + ey * ey) / 36);
        const shimmer = title ? 0.9 + 0.1 * Math.sin(t * 1.9 + i * 0.37) : 1;
        const own = form.glow * arrive * shimmer * (title ? 0.95 : 0.85);
        const l = fl[i] * 0.9;
        const b = own + l;
        if (b < 0.015) continue;
        const r = (fr[i] * own + flr[i] * l) / b, gg = (fg[i] * own + flg[i] * l) / b, bb = (fb[i] * own + flb[i] * l) / b;
        const o = p * 7, bc = Math.min(b, 1.5);
        pdata[o] = fx[i]; pdata[o + 1] = fy[i]; pdata[o + 2] = form.size * (1 + 0.3 * Math.min(1, l));
        pdata[o + 3] = r * bc; pdata[o + 4] = gg * bc; pdata[o + 5] = bb * bc;
        pdata[o + 6] = Math.min(1, Math.max(r, gg, bb) * bc * 0.85);
        p++;
      }
      return p;
    }

    function updateSparks(dt, sdy) {
      const k = Math.exp(-dt * 1.5);
      for (let i = 0; i < MAXS; i++) {
        if (sl[i] >= sm[i]) continue;
        sl[i] += dt;
        svx[i] *= k; svy[i] *= k;
        sx[i] += svx[i] * dt;
        sy[i] += svy[i] * dt - sdy;
      }
    }

    function updateLits(dt) {
      const decay = Math.exp(-dt / 0.45);
      for (const L of lits) {
        if (!L.on) { if (L.glow > 0) { L.glow = 0; L.el.style.setProperty("--glow", "0"); L.shown = 0; } continue; }
        let gl = L.glow * decay;
        if (nW) {
          const r = L.el.getBoundingClientRect();
          for (let k = 0; k < nW; k++) {
            const cx = clamp(wx[k], r.left, r.right), cy = clamp(wy[k], r.top, r.bottom);
            const near = Math.hypot(wx[k] - cx, wy[k] - cy);
            const far = Math.max(Math.hypot(wx[k] - r.left, wy[k] - r.top), Math.hypot(wx[k] - r.right, wy[k] - r.top),
              Math.hypot(wx[k] - r.left, wy[k] - r.bottom), Math.hypot(wx[k] - r.right, wy[k] - r.bottom));
            if (wr[k] > near - waveW * 0.5 && wr[k] < far + waveW * 0.5) {
              const l = ws[k] * 0.95;
              if (l > gl) {
                gl = l;
                const c = waves[k].c;
                L.col = `${(c[0] * 255) | 0} ${(c[1] * 255) | 0} ${(c[2] * 255) | 0}`;
              }
            }
          }
        }
        L.glow = gl;
        if (Math.abs(gl - L.shown) > 0.015) {
          L.el.style.setProperty("--glow", gl.toFixed(3));
          if (L.col) L.el.style.setProperty("--glow-c", L.col);
          L.shown = gl;
        }
      }
    }

    // ---------- the light layer: lines, arcs, orbs, the cosmos, shards and hands ----------
    function drawLight() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalCompositeOperation = "source-over";
      g.clearRect(0, 0, vw, vh);
      for (const s of stages) if (s.vis > 0 && s.kind === "cosmos") s.toy.draw(g);
      g.globalCompositeOperation = "lighter";
      g.lineCap = "round";
      g.lineJoin = "round";
      if (heroVisible) drawTitleOrb();
      for (const s of stages) if (s.vis > 0 && s.kind !== "cosmos") s.toy.draw(g);
      // Shards.
      g.lineWidth = 1.5;
      for (let i = 0; i < MAXS; i++) {
        if (sl[i] >= sm[i]) continue;
        const k = 1 - sl[i] / sm[i];
        const a = sw[i] * k * k;
        if (a < 0.01) continue;
        g.strokeStyle = rgba(scol[i], a);
        g.beginPath();
        g.moveTo(sx[i], sy[i]);
        g.lineTo(sx[i] - svx[i] * 0.035, sy[i] - svy[i] * 0.035);
        g.stroke();
      }
      if (hand.active && (fine || hand.down)) drawHand(hand, 1);
      if (ghost.active) drawHand(ghost, 0.85);
      g.globalCompositeOperation = "source-over";
    }

    /** A hand: a soft glow of its light and a ring of specks that swell on the beat. */
    function drawHand(H, a) {
      const b = handBeat;
      const r = 26 * (1 + 0.5 * b);
      const grad = g.createRadialGradient(H.x, H.y, 0, H.x, H.y, r);
      grad.addColorStop(0, rgba(HAND, 0.3 * a * (0.55 + 0.9 * b)));
      grad.addColorStop(1, rgba(HAND, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(H.x, H.y, r, 0, TAU); g.fill();
      g.fillStyle = rgba(mix(HAND, WHITE, 0.4), 0.7 * a);
      const rr = 12 + 7 * b;
      for (let k = 0; k < 9; k++) {
        const ang = k / 9 * TAU + clock * 0.9;
        g.beginPath(); g.arc(H.x + Math.cos(ang) * rr, H.y + Math.sin(ang) * rr, 1.1 + b, 0, TAU); g.fill();
      }
    }

    /** A ring of light: three strokes from wide and faint to a bright core. */
    function ring(x, y, r, w, a, col) {
      for (const [lw, la] of [[w * 7, 0.05], [w * 2.6, 0.16], [w, 0.9]]) {
        g.lineWidth = lw;
        g.strokeStyle = rgba(col || WHITE, a * la);
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
      }
    }
    function glow(x, y, r, col, a, core) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgba(mix(col, WHITE, core == null ? 0.55 : core), a));
      grad.addColorStop(0.22, rgba(col, a * 0.75));
      grad.addColorStop(0.55, rgba(col, a * 0.2));
      grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }

    function drawTitleOrb() {
      if (P.gone) return;
      const c = orbCentre();
      const press = P.pressing ? 0.72 : 1;
      const r = 9 * (1 + 0.08 * Math.sin(clock * 2) + 0.22 * beatPulse) * press;
      glow(c.x, c.y, r * 3.2, music, 0.85);
      ring(c.x, c.y, r * 2.4 * press, 1.5 * (1 + 0.45 * beatPulse), 0.85 * (1 + beatPulse));
    }

    // ================================================================================================================
    // I. A long line to trace
    // ================================================================================================================
    function makeLine(st) {
      const M = 420;
      const L = {
        phase: "gap", t: 0, gap: 0.4, pts: new Float32Array(M * 2), px: new Float32Array(M * 2), cum: new Float32Array(M),
        total: 1, cw: 0, ch: 0, prog: 0, tracer: null, lastIn: 0, waitT: 0, gs: 0, gTracing: false,
      };

      function generate() {
        const r = st.rect, W = r.width, H = r.height;
        const horiz = W >= H * 0.95;
        const A = horiz ? W : H, B = horiz ? H : W;
        const m = 0.1 * Math.min(W, H);
        const turns = rand(1.2, 2.3), rho = rand(0.55, 1.35);      // rho over 1: the coil loops
        const run = (A - 2 * m) / (1 + rho / (Math.PI * turns));
        const amp = rho * run / (TAU * turns);
        const across = rand(0.24, 0.32) * B;
        const phi = rand(0, TAU), psi = rand(0, TAU);
        const flipA = Math.random() < 0.5, flipB = Math.random() < 0.5;
        for (let j = 0; j < M; j++) {
          const s = j / (M - 1), th = TAU * turns * s + phi;
          let a = m + amp + s * run - amp * Math.cos(th);
          let b = B / 2 + across * Math.sin(th) + 0.1 * B * Math.sin(Math.PI * s + psi);
          if (flipA) a = A - a;
          if (flipB) b = B - b;
          L.pts[j * 2] = (horiz ? a : b) / W;
          L.pts[j * 2 + 1] = (horiz ? b : a) / H;
        }
        L.cw = 0;
        L.prog = 0;
        L.tracer = null;
        L.phase = "appear";
        L.t = 0;
        L.waitT = 0;
        L.gTracing = false;
        if (S) S.Sfx.play("breath");
      }

      function layout() {
        const r = st.rect;
        if (r.width === L.cw && r.height === L.ch) return;
        L.cw = r.width; L.ch = r.height;
        let acc = 0;
        for (let j = 0; j < M; j++) {
          L.px[j * 2] = L.pts[j * 2] * r.width;
          L.px[j * 2 + 1] = L.pts[j * 2 + 1] * r.height;
          if (j) acc += Math.hypot(L.px[j * 2] - L.px[j * 2 - 2], L.px[j * 2 + 1] - L.px[j * 2 - 1]);
          L.cum[j] = acc;
        }
        L.total = acc;
      }

      function idxAt(len) {
        let lo = 0, hi = M - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (L.cum[mid] < len) lo = mid + 1; else hi = mid; }
        return lo;
      }
      function pointAt(len) {
        const j = idxAt(clamp(len, 0, L.total));
        return { x: st.rect.left + L.px[j * 2], y: st.rect.top + L.px[j * 2 + 1] };
      }

      const tube = fine ? 28 : 42;

      function explode() {
        const e = pointAt(L.total);
        sparks(e.x, e.y, fine ? 240 : 150, 240, 720, [WARM, LINE, music.slice()], 1.2);
        emitWave(1.15, mix(music, WHITE, 0.3), e);
        if (energy.amount > 0) releaseEnergy(true);
        if (S) S.Sfx.play("burst");
        L.phase = "done";
        L.t = 0;
      }

      return {
        onSeen() { if (L.phase === "gap" && st.rect) L.gap = Math.min(L.gap, 0.3); },
        update(dt, hands) {
          L.t += dt;
          if (L.phase === "gap") { if (L.t > L.gap && st.rect) generate(); return; }
          layout();
          if (L.phase === "appear" && L.t > 0.7) { L.phase = "wait"; L.t = 0; }
          if (L.phase === "done") { if (L.t > 0.5) { L.phase = "gap"; L.t = 0; L.gap = rand(1.5, 3); } return; }
          if (L.phase !== "wait" && L.phase !== "trace") return;
          // The hand moves the progress to its nearest point a little behind to a little ahead, never back.
          const lo = Math.max(0, L.prog - 30), hi = Math.min(L.total, L.prog + (L.prog === 0 ? 50 : 130));
          const j0 = idxAt(lo), j1 = idxAt(hi);
          const ox = st.rect.left, oy = st.rect.top;
          let moved = false;
          for (const H of hands) {
            let bestD = tube, bestJ = -1;
            for (let j = j0; j <= j1; j++) {
              const d = Math.hypot(ox + L.px[j * 2] - H.x, oy + L.px[j * 2 + 1] - H.y);
              if (d < bestD) { bestD = d; bestJ = j; }
            }
            if (bestJ < 0) continue;
            L.lastIn = 0;
            if (L.cum[bestJ] > L.prog) {
              const step = L.cum[bestJ] - L.prog;
              L.prog = L.cum[bestJ];
              L.tracer = H;
              moved = true;
              if (energy.hand && energy.hand !== H) releaseEnergy(false);
              energy.hand = H;
              energy.amount = Math.min(1, energy.amount + step / (0.55 * L.total));
            }
          }
          if (L.prog > 0) L.phase = "trace";
          if (!moved) L.lastIn += dt;
          if (L.phase === "trace" && L.lastIn > 1.2 && energy.amount > 0) releaseEnergy(false);   // let go: it scatters
          if (L.prog >= L.total - 14) explode();
          if ((L.waitT += dt) > 70 && L.phase === "wait") { L.phase = "done"; L.t = 0; }
        },
        draw() {
          if (L.phase === "gap" || !L.cw) return;
          const r = st.rect, ox = r.left, oy = r.top;
          const A = L.phase === "appear" ? smooth(L.t / 0.7) : L.phase === "done" ? 1 - L.t / 0.5 : 1;
          if (A <= 0) return;
          const wsc = clamp(Math.min(r.width, r.height) / 520, 0.75, 1.25);
          const wk = 1 + 0.45 * beatPulse, gk = 1 + beatPulse;
          const waiting = L.phase === "wait" || L.phase === "appear";
          const j0 = L.phase === "done" ? idxAt(L.prog) : idxAt(Math.max(0, L.prog - 4));
          const CH = 6;
          for (let j = j0; j < M - 1; j += CH) {
            const je = Math.min(M - 1, j + CH);
            const mid = (L.cum[j] + L.cum[je]) / 2, ahead = mid - L.prog;
            let b = waiting ? 0.6 : ahead < 160 ? 1 : ahead < 300 ? lerp(1, 0.42, (ahead - 160) / 140) : 0.42;
            const ph = frac((mid - clock * 120) / 280);
            b *= (1 + 0.6 * Math.pow(Math.max(0, Math.cos(ph * TAU)), 10)) * A * gk;
            if (b < 0.01) continue;
            g.beginPath();
            g.moveTo(ox + L.px[j * 2], oy + L.px[j * 2 + 1]);
            for (let q = j + 1; q <= je; q++) g.lineTo(ox + L.px[q * 2], oy + L.px[q * 2 + 1]);
            for (const [lw, la] of [[15, 0.045], [5.5, 0.15], [2, 0.88]]) {
              g.lineWidth = lw * wsc * wk;
              g.strokeStyle = rgba(LINE, b * la);
              g.stroke();
            }
          }
          // The start: a ring until it's being traced.
          if (waiting) {
            const s = pointAt(0);
            const rr = 15 * wsc * (1 + 0.12 * Math.sin(clock * TAU) + 0.25 * beatPulse);
            ring(s.x, s.y, rr, 1.5 * wk, 0.85 * A * gk, LINE);
          }
          // The end: the sphere, a spark in a breathing shell of specks.
          if (L.phase !== "done") {
            const e = pointAt(L.total);
            glow(e.x, e.y, 20 * wsc * (1 + 0.4 * beatPulse), mix(music, WHITE, 0.5), 0.8 * A);
            g.fillStyle = rgba(LINE, 0.8 * A);
            const sr = 13 * wsc * (1 + 0.5 * beatPulse);
            for (let k = 0; k < 22; k++) {
              const ang = k / 22 * TAU + clock * 0.6 + Math.sin(k * 1.7 + clock) * 0.2;
              const rad = sr * (0.85 + 0.3 * frac(k * 0.618));
              g.beginPath(); g.arc(e.x + Math.cos(ang) * rad, e.y + Math.sin(ang) * rad * 0.9, 1.2, 0, TAU); g.fill();
            }
          }
        },
        focus() {
          if (L.phase === "gap" || !L.cw) return null;
          return pointAt(L.phase === "trace" ? L.prog : 0);
        },
        wantsTouch(x, y) {
          if ((L.phase !== "wait" && L.phase !== "trace") || !L.cw) return false;
          const p = pointAt(L.prog);
          return Math.hypot(p.x - x, p.y - y) < 56;
        },
        ghostReset() { L.gTracing = false; },
        ghost(dt) {
          if ((L.phase !== "wait" && L.phase !== "trace") || !L.cw) {
            const r = st.rect;
            ghostSeek(r.left + r.width * 0.5, r.top + r.height * 0.75, 160, dt);
            return;
          }
          if (!L.gTracing) {
            // Let the whole line be seen first, drifting in toward its start; then take it.
            const p = pointAt(L.prog);
            if (L.phase === "wait" && L.t < 1.6) { ghostSeek(p.x + 70, p.y + 50, 90, dt); return; }
            if (ghostSeek(p.x, p.y, 420, dt)) { L.gTracing = true; L.gs = L.prog; }
            return;
          }
          L.gs = Math.min(L.total, Math.max(L.gs, L.prog) + clamp(st.rect.width * 0.3, 150, 240) * dt);
          const p = pointAt(L.gs);
          ghostMove(p.x, p.y, dt);
        },
      };
    }

    // ================================================================================================================
    // II. Arcs to swipe
    // ================================================================================================================
    const KEY_NOTES = [69, 72, 74, 76, 79, 81];   // A minor pentatonic, the bells' notes

    function makeArcs(st) {
      const A = { phase: "gap", t: 0, gap: 0.4, arcs: [], scale: 1, gi: -1, gt: 0, fin: 0 };

      function place(arc) {
        const r = st.rect, mn = Math.min(r.width, r.height);
        return { ox: r.left + arc.ou * r.width, oy: r.top + arc.ov * r.height, R: arc.rn * mn };
      }
      function pt(arc, q, t) {
        const a = arc.a0 + arc.sw * t;
        return { x: q.ox + Math.cos(a) * q.R, y: q.oy + Math.sin(a) * q.R, a };
      }

      function generate() {
        const r = st.rect, W = r.width, H = r.height, mn = Math.min(W, H);
        const s = rand(1, 2);
        let k = [1, 2, 2, 3, 3][(Math.random() * 5) | 0];
        if (s > 1.6) k = Math.min(k, 2);
        const horiz = W >= H;
        const span = (horiz ? W : H) / (k + 1);
        const R = Math.min(0.16 * mn * Math.sqrt(s), 0.55 * span);
        const sweep = (110 * Math.sqrt(s)) * Math.PI / 180;
        A.arcs = [];
        for (let i = 0; i < k; i++) {
          const mx = horiz ? W * (i + 1) / (k + 1) : W * (0.5 + rand(-0.08, 0.08));
          const my = horiz ? H * (0.5 + rand(-0.08, 0.08)) : H * (i + 1) / (k + 1);
          let arc = null;
          for (let tries = 0; tries < 24 && !arc; tries++) {
            const phi = ((Math.random() * 8) | 0) * Math.PI / 4, bend = Math.random() < 0.5 ? 1 : -1;
            const nx = -Math.sin(phi) * bend, ny = Math.cos(phi) * bend;
            const ox = mx + R * nx, oy = my + R * ny;
            const am = Math.atan2(my - oy, mx - ox);
            const dir = (-Math.sin(am) * Math.cos(phi) + Math.cos(am) * Math.sin(phi)) > 0 ? 1 : -1;
            const sw = dir * sweep, a0 = am - sw / 2;
            let ok = true;
            for (let q = 0; q <= 8 && ok; q++) {
              const a = a0 + sw * q / 8, x = ox + Math.cos(a) * R, y = oy + Math.sin(a) * R;
              ok = x > W * 0.06 && x < W * 0.94 && y > H * 0.06 && y < H * 0.94;
            }
            if (ok) arc = { ou: ox / W, ov: oy / H, rn: R / mn, a0, sw };
          }
          if (!arc) {
            const ox = mx, oy = my + R * 0.5;
            arc = { ou: ox / W, ov: oy / H, rn: R / mn, a0: -Math.PI / 2 - sweep / 2, sw: sweep };
          }
          Object.assign(arc, { pr: 0, started: false, st: 0, lastIn: 0, done: false, doneT: 0, note: KEY_NOTES[(Math.random() * KEY_NOTES.length) | 0] });
          A.arcs.push(arc);
        }
        A.scale = s;
        A.phase = "appear";
        A.t = 0;
        A.gi = -1;
        if (S) S.Sfx.play("breath");
      }

      const tube = fine ? 26 : 40;
      const hw = (t, wsc) => wsc * lerp(0.45, 3.2, t);        // the core's half-width: narrow start, wide end

      function swiped(arc) {
        const q = place(arc);
        arc.done = true;
        arc.doneT = A.t;
        for (let k = 0; k < (fine ? 90 : 60); k++) {
          const t = Math.random(), p = pt(arc, q, t);
          const tang = p.a + (arc.sw > 0 ? Math.PI / 2 : -Math.PI / 2);
          sparks(p.x, p.y, 1, 90, 360, [WARM, LINE, music.slice()], 1, { dir: tang, spread: 0.7 });
        }
        const e = pt(arc, q, 0.95);
        emitWave(0.75, music.slice(), e);
        if (S) S.Sfx.play("bell", { note: arc.note });
      }

      return {
        update(dt, hands) {
          A.t += dt;
          if (A.phase === "gap") { if (A.t > A.gap && st.rect) generate(); return; }
          if (A.phase === "appear" && A.t > 0.5) A.phase = "live";
          if (A.phase === "finish" || A.phase === "fade") {
            if (A.t - A.fin > 0.8) { A.phase = "gap"; A.t = 0; A.gap = rand(1.5, 3); }
            return;
          }
          const wsc = clamp(Math.min(st.rect.width, st.rect.height) / 520, 0.75, 1.25);
          for (const arc of A.arcs) {
            if (arc.done) continue;
            const q = place(arc);
            let hit = -1;
            for (const H of hands) {
              const lo = arc.started ? Math.max(0, arc.pr - 0.06) : 0, hi = arc.started ? Math.min(1, arc.pr + 0.3) : 0.3;
              let bestD = 1e9, bestT = -1;
              for (let t = lo; t <= hi + 1e-6; t += 0.01) {
                const p = pt(arc, q, t), d = Math.hypot(p.x - H.x, p.y - H.y);
                if (d < tube + hw(t, wsc) && d < bestD) { bestD = d; bestT = t; }
              }
              if (bestT >= 0) hit = Math.max(hit, bestT);
            }
            if (hit >= 0) {
              if (!arc.started) { arc.started = true; arc.st = A.t; }
              arc.pr = Math.max(arc.pr, hit);
              arc.lastIn = A.t;
            }
            if (arc.started && (A.t - arc.lastIn > 0.25 || A.t - arc.st > 1.1 * A.scale)) { arc.started = false; arc.pr = 0; }
            if (arc.pr >= 0.88) swiped(arc);
          }
          if (A.arcs.every((a) => a.done)) { A.phase = "finish"; A.fin = A.t; }
          else if (A.phase === "live" && A.t > 25) { A.phase = "fade"; A.fin = A.t; }
        },
        draw() {
          if (A.phase === "gap") return;
          const r = st.rect;
          const wsc = clamp(Math.min(r.width, r.height) / 520, 0.75, 1.25) * (1 + 0.45 * beatPulse);
          const base = A.phase === "appear" ? smooth(A.t / 0.5) : A.phase === "fade" ? 1 - (A.t - A.fin) / 0.8 : 1;
          for (const arc of A.arcs) {
            let a = base;
            let flash = 0;
            if (arc.done) {
              const k = (A.t - arc.doneT) / 0.5;
              a *= Math.max(0, 1 - k);
              flash = Math.max(0, 1 - k * 1.7);
            }
            if (a <= 0.01) continue;
            const q = place(arc);
            const b = a * (0.8 + flash) * (1 + beatPulse);
            strip(arc, q, 0, 1, wsc, b);
            if (arc.pr > 0 && !arc.done) strip(arc, q, 0, arc.pr, wsc, 0.45 * a);
          }
        },
        focus() {
          const arc = A.arcs.find((x) => !x.done);
          if (!arc || A.phase === "gap") return null;
          return pt(arc, place(arc), 0.5);
        },
        wantsTouch(x, y) {
          if (A.phase !== "live" && A.phase !== "appear") return false;
          return A.arcs.some((arc) => {
            if (arc.done) return false;
            const q = place(arc);
            for (let t = 0; t <= 0.4; t += 0.05) { const p = pt(arc, q, t); if (Math.hypot(p.x - x, p.y - y) < 56) return true; }
            return false;
          });
        },
        ghostReset() { A.gi = -1; },
        ghost(dt) {
          const arc = A.arcs.find((x) => !x.done);
          if (A.phase !== "live" || !arc) {
            const r = st.rect;
            ghostSeek(r.left + r.width * 0.5, r.top + r.height * 0.8, 160, dt);
            return;
          }
          const q = place(arc), idx = A.arcs.indexOf(arc);
          if (A.gi !== idx) {
            // Let the set be seen, and pause between arcs, before taking the next one.
            const p = pt(arc, q, 0.02);
            if (A.t < 1.4 || A.t - (A.gDone || 0) < 0.6) { ghostSeek(p.x - 50, p.y + 60, 110, dt); return; }
            if (ghostSeek(p.x, p.y, 420, dt)) { A.gi = idx; A.gt = 0.02; }
            return;
          }
          A.gt = Math.min(1, A.gt + dt / (0.5 * Math.sqrt(A.scale)));
          const p = pt(arc, q, A.gt);
          ghostMove(p.x, p.y, dt);
          if (A.gt >= 1) { A.gi = -1; A.gDone = A.t; }
        },
      };

      /** An arc as a filled strip, widening from its start to its end, in three passes (glow, mid, core). */
      function strip(arc, q, t0, t1, wsc, b) {
        const steps = 40;
        for (const [wm, la] of [[5, 0.06], [2.2, 0.17], [1, 0.92]]) {
          g.fillStyle = rgba(LINE, b * la);
          g.beginPath();
          for (let s = 0; s <= steps; s++) {
            const t = lerp(t0, t1, s / steps), p = pt(arc, q, t), w = hw(t, wsc) * wm;
            const nx = Math.cos(p.a), ny = Math.sin(p.a);
            if (s === 0) g.moveTo(p.x + nx * w, p.y + ny * w); else g.lineTo(p.x + nx * w, p.y + ny * w);
          }
          for (let s = steps; s >= 0; s--) {
            const t = lerp(t0, t1, s / steps), p = pt(arc, q, t), w = hw(t, wsc) * wm;
            g.lineTo(p.x - Math.cos(p.a) * w, p.y - Math.sin(p.a) * w);
          }
          g.closePath();
          g.fill();
          // Round caps.
          for (const t of [t0, t1]) {
            const p = pt(arc, q, t);
            g.beginPath(); g.arc(p.x, p.y, hw(t, wsc) * wm, 0, TAU); g.fill();
          }
        }
      }
    }

    // ================================================================================================================
    // III. Ringed orbs to push
    // ================================================================================================================
    function makeOrbs(st) {
      const O = { phase: "gap", t: 0, gap: 0.4, total: 0, spawned: 0, orbs: [], next: 0, gTarget: null, gFlick: 0, gWait: 0 };

      function radius() { return clamp(0.065 * Math.min(st.rect.width, st.rect.height), 18, 40); }
      function centre(o) {
        const r = st.rect;
        return { x: r.left + o.u * r.width, y: r.top + o.v * r.height + 3 * Math.sin(clock * 1.4 + o.seed * 3) };
      }
      const whole = (o) => o.pop < 0 && O.t - o.born < o.life;

      function spawn() {
        const r = st.rect, rad = radius();
        let u = 0.5, v = 0.5;
        for (let tries = 0; tries < 40; tries++) {
          u = rand(0.15, 0.85); v = rand(0.17, 0.83);
          const ok = O.orbs.every((o) => !whole(o) || Math.hypot((o.u - u) * r.width, (o.v - v) * r.height) > rad * 4.4);
          if (ok) break;
        }
        const pc = (Math.random() * 12) | 0;
        const note = S ? S.NOTE_COLOURS[pc] : [1, 0.4, 0.9];
        O.orbs.push({ u, v, born: O.t, life: 12, pop: -1, col: mix(note, music, 0.3), seed: Math.random() * 10 });
        O.spawned++;
      }

      function pop(o) {
        const c = centre(o);
        o.pop = O.t;
        sparks(c.x, c.y, fine ? 100 : 70, 150, 520, [o.col, mix(o.col, WHITE, 0.5)], 1.15);
        emitWave(0.95, o.col, c);
        if (S) S.Sfx.play("whoosh");
      }

      return {
        update(dt, hands) {
          O.t += dt;
          if (O.phase === "gap") {
            if (O.t > O.gap && st.rect) {
              O.phase = "live"; O.t = 0; O.total = 3 + ((Math.random() * 4) | 0); O.spawned = 0; O.orbs = []; O.next = 0.3;
              if (S) S.Sfx.play("breath");
            }
            return;
          }
          const live = O.orbs.filter(whole);
          const maxWhole = O.total - O.spawned >= 2 && frac(O.spawned * 0.618 + O.total * 0.31) > 0.45 ? 2 : 1;
          if (O.spawned < O.total && live.length < maxWhole && O.t >= O.next) { spawn(); O.next = O.t + 0.6; }
          const rad = radius();
          for (const o of live) {
            const c = centre(o);
            for (const H of hands) {
              if (H.sp < 650) continue;
              const ex = c.x - H.x, ey = c.y - H.y, d = Math.hypot(ex, ey);
              if (d < 1.9 * rad && (d < rad || (H.vx * ex + H.vy * ey) / (H.sp * d) > 0.2)) { pop(o); break; }
            }
          }
          const busy = O.orbs.some((o) => whole(o) || (o.pop >= 0 && O.t - o.pop < 0.6));
          if (O.spawned >= O.total && !busy) { O.phase = "gap"; O.t = 0; O.gap = rand(1.5, 3); O.orbs = []; }
        },
        press(x, y) {
          if (O.phase !== "live") return;
          const rad = radius();
          for (const o of O.orbs) {
            if (!whole(o)) continue;
            const c = centre(o);
            if (Math.hypot(c.x - x, c.y - y) < 1.9 * rad) { pop(o); return; }
          }
        },
        draw() {
          if (O.phase === "gap") return;
          const rad = radius();
          for (const o of O.orbs) {
            const c = centre(o), age = O.t - o.born;
            if (o.pop >= 0) {
              const k = (O.t - o.pop) / 0.5;
              if (k >= 1) continue;
              glow(c.x, c.y, rad * (1.6 + 4 * k), o.col, (1 - k) * (1 - k) * 1.2);
              ring(c.x, c.y, 1.7 * rad * (1 + 2.6 * (1 - (1 - k) * (1 - k))), 1.8, Math.min(1, 2 * (1 - k)));
              continue;
            }
            if (age > o.life) continue;
            const grow = smooth(age / 0.5), fade = clamp((o.life - age) / 1.5, 0, 1);
            const a = grow * fade;
            const breath = 1 + 0.07 * Math.sin(clock * 2.3 + o.seed) + 0.18 * beatPulse;
            glow(c.x, c.y, rad * 1.6 * breath * grow, o.col, 0.95 * a);
            ring(c.x, c.y, 1.7 * rad * grow, 1.8 * (1 + 0.45 * beatPulse), 0.8 * a * (1 + beatPulse));
          }
        },
        focus() {
          const o = O.orbs.find(whole);
          return o ? centre(o) : null;
        },
        wantsTouch(x, y) {
          const rad = radius();
          return O.orbs.some((o) => whole(o) && Math.hypot(centre(o).x - x, centre(o).y - y) < 2.2 * rad);
        },
        ghostReset() { O.gTarget = null; O.gFlick = 0; O.gWait = 1; },
        ghost(dt) {
          const r = st.rect, rad = radius();
          if (O.gFlick > 0) {
            O.gFlick -= dt;
            ghostMove(ghost.x + O.gDir.x * 1150 * dt, ghost.y + O.gDir.y * 1150 * dt, dt);
            return;
          }
          if ((O.gWait -= dt) > 0) { ghostMove(ghost.x, ghost.y, dt); return; }
          const o = O.phase === "live" ? O.orbs.find((x) => whole(x) && O.t - x.born > 1.4) : null;
          if (!o) { ghostSeek(r.left + r.width * 0.5, r.top + r.height * 0.85, 160, dt); return; }
          const c = centre(o);
          const ex = c.x - (r.left + r.width * 0.5), ey = c.y - (r.top + r.height * 1.1);
          const d = Math.hypot(ex, ey) || 1;
          O.gDir = { x: ex / d, y: ey / d };
          if (ghostSeek(c.x - O.gDir.x * 3.2 * rad, c.y - O.gDir.y * 3.2 * rad, 380, dt)) { O.gFlick = 0.28; O.gWait = 1; }
        },
      };
    }

    // ================================================================================================================
    // IV. The room, revealed: the motes map a patch of the wall, then the cosmos opens through it
    // ================================================================================================================
    function makeCosmos(st) {
      // Where the stand-in room's walls are (fractions of the picture), and bright places in the app's sky
      // (cosmos.webp's pixels: galaxies, the core of the band, the nebulae).
      const WALLS = [[0.06, 0.1, 0.32, 0.6], [0.71, 0.08, 0.92, 0.5]];
      const SPOTS = [[1153, 453], [1848, 240], [2365, 558], [2355, 841], [1684, 712], [1510, 508], [1371, 389], [248, 200], [278, 647]];
      const C = { flow: 0, next: 2.5, rev: null, img: null, pc: document.createElement("canvas") };
      const pctx = C.pc.getContext("2d");

      function makeMask(pw, ph) {
        const m = document.createElement("canvas");
        m.width = Math.max(2, Math.round(pw)); m.height = Math.max(2, Math.round(ph));
        const x = m.getContext("2d", { willReadFrequently: true });
        const blob = (cx, cy, rad, a) => {
          const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
          gr.addColorStop(0, `rgba(255,255,255,${a})`);
          gr.addColorStop(0.55, `rgba(255,255,255,${a * 0.85})`);
          gr.addColorStop(1, "rgba(255,255,255,0)");
          x.fillStyle = gr;
          x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
        };
        const mn = Math.min(m.width, m.height);
        blob(m.width / 2, m.height / 2, mn * 0.48, 1);
        for (let k = 0; k < 22; k++) {
          const ang = rand(0, TAU), rr = rand(0.14, 0.34);
          blob(m.width / 2 + Math.cos(ang) * rr * m.width, m.height / 2 + Math.sin(ang) * rr * m.height, mn * rand(0.1, 0.26), rand(0.45, 1));
        }
        return m;
      }

      function open(at) {
        const r = st.rect, W = r.width, H = r.height;
        const wn = lerp(0.27, 0.42, C.flow);
        const pw = wn * W, ph = pw * 0.8;
        let u, v;
        if (at) { u = (at.x - r.left) / W; v = (at.y - r.top) / H; }
        else {
          const w = WALLS[(Math.random() * WALLS.length) | 0];
          u = rand(w[0], w[2]); v = rand(w[1], w[3]);
        }
        u = clamp(u, pw / W * 0.45, 1 - pw / W * 0.45);
        v = clamp(v, ph / H * 0.45, 1 - ph / H * 0.45);
        const spot = SPOTS[(Math.random() * SPOTS.length) | 0];
        const mask = makeMask(pw, ph);
        const rev = { u, v, wn, ratio: 0.8, phase: "map", t: 0, hold: lerp(5, 10, C.flow), sx: spot[0] + rand(-80, 80), sy: spot[1] + rand(-60, 60), mask, a: 0 };
        C.rev = rev;
        // The motes come from all over and map the patch first (unless the title is using them).
        if (form.mode !== "title") {
          const data = mask.getContext("2d").getImageData(0, 0, mask.width, mask.height).data;
          const want = clamp(Math.round(pw * ph / 120), 150, Math.floor(MAXF * 0.5));
          const pal = [[0.62, 0.78, 1], [0.76, 0.66, 1], [0.86, 0.82, 1], [0.6, 0.95, 0.95], [1, 0.84, 0.6]];
          let n = 0;
          for (let tries = 0; tries < want * 6 && n < want; tries++) {
            const qx = Math.random() * mask.width, qy = Math.random() * mask.height;
            if (data[((qy | 0) * mask.width + (qx | 0)) * 4 + 3] < 140) continue;
            ftx[n] = (u * W - pw / 2) + qx / mask.width * pw;
            fty[n] = (v * H - ph / 2) + qy / mask.height * ph;
            const c = pal[Math.random() < 0.1 ? 4 : (Math.random() * 4) | 0];
            fr[n] = c[0]; fg[n] = c[1]; fb[n] = c[2];
            n++;
          }
          formStart("patch", n, 40, 110, 1.6, fine ? 2.6 : 2.2);
          rev.mapped = true;
        }
        if (S) S.Sfx.play("air");
      }

      return {
        onSeen() {
          if (!C.img) { C.img = new Image(); C.img.decoding = "async"; C.img.src = "assets/img/cosmos.webp"; }
        },
        update(dt, hands) {
          // The flow: rises while a hand moves over the room (faster with music), falls slowly when it doesn't.
          const engaged = hands.some((H) => H.sp > 60);
          const withMusic = S && S.Ear.mode !== "off" && !S.Ear.silent && S.Ear.loud > 0.1;
          C.flow = clamp(C.flow + (engaged ? dt / (withMusic ? 4 : 6) : -dt / 14), 0, 1);
          const rev = C.rev;
          if (form.mode === "patch") { form.ax = st.rect.left; form.ay = st.rect.top; }
          if (!rev) {
            C.next -= dt;
            if (C.next <= 0) open(hands.length && hands[0] !== ghost ? hands[0] : null);
            return;
          }
          rev.t += dt;
          if (rev.phase === "map" && rev.t > (rev.mapped ? 2 : 0.6)) { rev.phase = "open"; rev.t = 0; }
          if (rev.phase === "open") {
            rev.a = smooth(rev.t / 1.8);
            if (rev.mapped && form.mode === "patch") form.glow = lerp(1, 0.2, rev.a);
            if (rev.t > 1.8 + rev.hold) {
              rev.phase = "close"; rev.t = 0;
              if (rev.mapped && form.mode === "patch") {
                const r = st.rect;
                formLetGo(r.left + rev.u * r.width, r.top + rev.v * r.height, 40);
              }
            }
          }
          if (rev.phase === "close") {
            rev.a = Math.max(0, 1 - rev.t / 2.2);
            if (rev.t > 2.2) { C.rev = null; C.next = lerp(7, 2.5, C.flow); }
          }
        },
        press(x, y) {
          if (!C.rev) { C.flow = Math.min(1, C.flow + 0.15); open({ x, y }); }
        },
        draw() {
          const rev = C.rev;
          if (!rev || rev.a <= 0.002 || !C.img || !C.img.complete || !C.img.naturalWidth) return;
          const r = st.rect;
          const pw = rev.wn * r.width, ph = pw * rev.ratio;
          const x0 = r.left + rev.u * r.width - pw / 2, y0 = r.top + rev.v * r.height - ph / 2;
          const cw = Math.max(2, Math.round(pw * dpr)), ch = Math.max(2, Math.round(ph * dpr));
          if (C.pc.width !== cw || C.pc.height !== ch) { C.pc.width = cw; C.pc.height = ch; }
          // A window onto space far away: the sky inside moves less than the window as the page scrolls.
          const sw = pw * 1.05, sh = ph * 1.05;
          const sxp = rev.sx - sw / 2 + (x0 + pw / 2 - vw / 2) * 0.25;
          const syp = clamp(rev.sy - sh / 2 + (y0 + ph / 2 - vh / 2) * 0.25, 0, C.img.naturalHeight - sh);
          pctx.globalCompositeOperation = "copy";
          pctx.drawImage(rev.mask, 0, 0, cw, ch);
          pctx.globalCompositeOperation = "source-in";
          pctx.drawImage(C.img, clamp(sxp, 0, C.img.naturalWidth - sw), syp, sw, sh, 0, 0, cw, ch);
          g.save();
          g.beginPath(); g.rect(r.left, r.top, r.width, r.height); g.clip();
          g.globalAlpha = 0.95 * rev.a;
          g.drawImage(C.pc, 0, 0, cw, ch, x0, y0, pw, ph);
          g.restore();
        },
        focus() {
          const r = st.rect;
          if (C.rev) return { x: r.left + C.rev.u * r.width, y: r.top + C.rev.v * r.height };
          return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.4 };
        },
      };
    }

    requestAnimationFrame(frame);
    return true;
  }
})();
