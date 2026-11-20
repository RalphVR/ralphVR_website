// The skater at the table's edge: a small side-on toy in the game's pop look. Space, a click or a tap pops an ollie
// (hold for a bigger one); again in the air is a kickflip; landing on a rail or a ledge grinds it. Rolling into
// anything is a bail. Left alone for a few seconds, it skates by itself, as the ghost of a run does in the game.
(() => {
  "use strict";
  const TS = window.TS || { sound: null, slapRandom() {}, reduce: false };
  const snd = TS.sound;
  const rink = document.querySelector(".rink");
  const canvas = rink && rink.querySelector("canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const runEl = rink.querySelector("[data-run]"), bestEl = rink.querySelector("[data-best]");

  const INK = "#121212", CREAM = "#FBF6EA", YELLOW = "#F7C21C", RED = "#E3302A", TEAL = "#2E9CB3";
  const G = 2300, JUMP = 640, HOLD_G = 1250, FLIP_T = 0.4;   // pixels and seconds
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let W = 0, H = 0, dpr = 1, unit = 1, ground = 0, sx = 0, speed = 0;
  let obstacles = [], parts = [], calls = [], trail = [];
  let travelled = 0, run = 0, best = 0, ghost = true, lastInput = -1e9, holding = false, flipAt = -1;
  const s = { y: 0, vy: 0, air: false, fell: false, flip: 0, flipping: false, flips: 0, peak: 0, grind: null, grindLen: 0, squash: 0, bail: 0, spin: 0 };

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    unit = r.width >= 900 ? 1.35 : 1;             // everything is drawn a third bigger on a wide screen
    W = r.width / unit; H = r.height / unit;
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ground = H - 26 / unit;                       // the top of the table's edge (the .rink::after band)
    sx = clamp(W * 0.26, 70, 300);
    speed = clamp(W * 0.3, 210, 330);
  }

  // ---------------------------------------------------------------- the course
  function spawn() {
    const last = obstacles[obstacles.length - 1];
    const small = W < 600;
    const from = last ? last.x + last.w : W * 0.9;
    if (last && from > W + 40) return;
    const x = Math.max(W + 30, from + rand(small ? 330 : 430, small ? 560 : 820));
    const pick = Math.random();
    if (pick < 0.42) obstacles.push({ type: "rail", x, w: rand(small ? 150 : 210, small ? 210 : 340), h: 34 });
    else if (pick < 0.68) obstacles.push({ type: "ledge", x, w: rand(small ? 150 : 170, small ? 200 : 270), h: 26 });
    else obstacles.push({ type: "cone", x, w: 22, h: 26 });
  }

  // ---------------------------------------------------------------- input
  function press() {
    lastInput = performance.now();
    holding = true;
    if (ghost) { ghost = false; run = 0; score(0); }
    if (s.bail > 0) return;
    if (!s.air) jump();
    else if (!s.flipping) { s.flipping = true; s.flip = 0; }
  }
  function release() { holding = false; }
  function jump() {
    s.air = true; s.fell = false; s.vy = JUMP; s.flips = 0; s.flipping = false; s.flip = 0; s.peak = s.y;
    if (s.grind) endGrind();
    if (snd) snd.pop();
  }
  rink.addEventListener("pointerdown", e => {
    if (e.target.closest(".sound")) return;       // the Sound switch sits on the edge too
    if (e.button === 0 || e.pointerType !== "mouse") press();
  });
  addEventListener("pointerup", release);
  addEventListener("pointercancel", release);
  let inView = false;
  addEventListener("keydown", e => {
    if (!inView || e.repeat || (e.code !== "Space" && e.code !== "ArrowUp")) return;
    if (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement.tagName) && e.code === "Space") return;
    e.preventDefault();                           // Space would scroll the page
    press();
  });
  addEventListener("keyup", e => { if (e.code === "Space" || e.code === "ArrowUp") release(); });

  // ---------------------------------------------------------------- scoring and words
  function score(add) {
    run += add;
    if (run > best) best = run;
    if (runEl) runEl.textContent = run.toLocaleString("en-US");
    if (bestEl) bestEl.textContent = best.toLocaleString("en-US");
  }
  function call(text, points, colour) {
    const above = calls.filter(c => c.t < 1).length;          // a second call goes over the first, not on it
    calls.push({ text: points ? `${text} +${points}` : text, t: 0, y: s.y + 78 + above * 30, colour: colour || YELLOW });
    if (!ghost && points) {
      score(points);
      if (points >= 250) TS.slapRandom();        // a sticker for a good one, as the game's sessions give
    }
  }
  function endGrind() {
    const points = 150 + Math.round(s.grindLen / 20) * 10;
    s.grind = null;
    if (snd) snd.grind(0);
    call("50-50 grind", points);
  }
  function bail(o) {
    s.bail = 1.25; s.spin = 0; s.grind = null; s.flipping = false; s.vy = 260; s.air = true;
    if (o) o.hit = true;
    if (snd) { snd.bail(); snd.grind(0); snd.roll(0); }
    call("Bail", 0, RED);
    for (let i = 0; i < 10; i++) parts.push({ x: travelled + sx, y: s.y + 20, vx: rand(-160, 220), vy: rand(80, 320), life: rand(0.4, 0.8), colour: i % 2 ? RED : YELLOW, r: rand(2, 4) });
    run = 0;
  }

  // ---------------------------------------------------------------- one step
  function step(dt, now) {
    if (s.bail > 0) {                             // tumbling: the world slows to a stop, then a fresh start
      s.bail -= dt; s.spin += dt * 9;
      s.vy -= G * dt; s.y = Math.max(0, s.y + s.vy * dt);
      const drift = speed * clamp(s.bail - 0.5, 0, 1);
      travelled += drift * dt;
      for (const o of obstacles) o.x -= drift * dt;
      if (s.bail <= 0) {
        obstacles = obstacles.filter(o => o.x > sx + 260 || o.x + o.w < sx - 40);
        Object.assign(s, { y: 0, vy: 0, air: false, flipping: false, flip: 0, grind: null, squash: 0 });
        trail = []; score(0);
      }
      return;
    }
    if (!ghost && now - lastInput > 5000 && !s.air && !s.grind) ghost = true;

    travelled += speed * dt;
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter(o => o.x + o.w > -60);
    spawn();

    const prevY = s.y;
    if (s.air) {
      s.vy -= (s.vy > 0 && holding && !ghost ? HOLD_G : G) * dt;
      s.y += s.vy * dt;
      s.peak = Math.max(s.peak, s.y);
      if (s.flipping) {
        s.flip += dt / FLIP_T;
        if (s.flip >= 1) { s.flipping = false; s.flip = 0; s.flips++; if (snd) snd.caught(); }
      }
      if (ghost && flipAt >= 0 && now > flipAt) { flipAt = -1; s.flipping = true; s.flip = 0; }
    }

    for (const o of obstacles) {
      const over = sx > o.x - 6 && sx < o.x + o.w + 6;
      if (o.type !== "cone" && s.air && s.vy <= 0 && over && prevY >= o.h && s.y <= o.h) {
        // Down onto a rail or a ledge: a grind, unless the board is still mid-flip.
        s.y = o.h; s.vy = 0; s.air = false;
        if (s.flipping && s.flip < 0.8) return bail(o);
        if (s.flips) call(s.flips > 1 ? "Double kickflip" : "Kickflip", 400 * s.flips);
        s.flipping = false; s.grind = o; s.grindLen = 0; s.squash = 1;
        if (snd) { snd.land(); snd.grind(1); }
      } else if (!o.hit && s.grind !== o && sx + 14 > o.x && sx - 12 < o.x + o.w && s.y < o.h - 6) {
        if (ghost) { o.hit = true; continue; }    // the ghost never falls
        return bail(o);
      }
    }

    if (s.grind) {
      const o = s.grind;
      s.grindLen += speed * dt;
      for (let i = 0; i < 2; i++) parts.push({ x: travelled + sx - 8, y: o.h + 4, vx: rand(-260, -60), vy: rand(40, 230), life: rand(0.2, 0.42), colour: Math.random() < 0.7 ? YELLOW : CREAM, r: rand(1.4, 2.6) });
      if (sx > o.x + o.w + 4) { endGrind(); s.air = true; s.fell = true; s.vy = 0; }
      else if (ghost && o.x + o.w - sx < 26 && Math.random() < 0.5) { jump(); flipAt = Math.random() < 0.6 ? now + 60 : -1; }
    } else if (s.air && s.y <= 0) {
      s.y = 0; s.vy = 0; s.air = false; s.squash = 1;
      if (s.flipping && s.flip < 0.8) return bail(null);
      s.flipping = false;
      if (snd) snd.land();
      for (let i = 0; i < 6; i++) parts.push({ x: travelled + sx + rand(-12, 12), y: 3, vx: rand(-90, 90), vy: rand(20, 90), life: rand(0.25, 0.45), colour: CREAM, r: rand(1.5, 3) });
      if (s.flips) call(s.flips > 1 ? "Double kickflip" : "Kickflip", 400 * s.flips);
      else if (!s.fell) call(s.peak > 105 ? "Big ollie" : "Ollie", s.peak > 105 ? 150 : 100);
    }

    // The ghost reads the course: pop in time to clear a cone or to come down on a rail.
    if (ghost && !s.air && !s.grind) {
      const next = obstacles.find(o => o.x + o.w > sx + 8 && !o.hit);
      if (next && next.x - sx < speed * (next.type === "cone" ? 0.16 : 0.2)) {
        jump();
        flipAt = Math.random() < (next.type === "cone" ? 0.55 : 0.3) ? now + 50 : -1;
      }
    }

    s.squash = Math.max(0, s.squash - dt * 5);
    if (snd) snd.roll(!s.air && !s.grind ? 1 : 0);
    if (s.air) { trail.push({ x: travelled + sx, y: s.y }); if (trail.length > 16) trail.shift(); }
    else if (trail.length) trail.shift();
    for (const p of parts) { p.life -= dt; p.vy -= 900 * dt; p.x += p.vx * dt; p.y = Math.max(0, p.y + p.vy * dt); }
    parts = parts.filter(p => p.life > 0);
    for (const c of calls) c.t += dt;
    calls = calls.filter(c => c.t < 1.3);
  }

  // ---------------------------------------------------------------- drawing
  const Y = y => ground - y;                       // heights are measured up from the table
  function line(pts, width, colour) {
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.lineWidth = width; ctx.strokeStyle = colour; ctx.stroke();
  }
  function drawObstacle(o) {
    const top = Y(o.h);
    if (o.type === "rail") {
      for (let x = o.x + 14; x < o.x + o.w - 6; x += Math.max(60, (o.w - 28) / Math.round((o.w - 28) / 80))) line([x, top, x, ground], 6, INK);
      line([o.x, top, o.x + o.w, top], 10, INK);
      line([o.x + 1, top, o.x + o.w - 1, top], 5, o.hit ? RED : YELLOW);
    } else if (o.type === "ledge") {
      ctx.fillStyle = INK; ctx.fillRect(o.x + 5, top + 4, o.w, o.h - 4);          // its hard shadow
      ctx.fillStyle = CREAM; ctx.fillRect(o.x, top, o.w, o.h);
      ctx.fillStyle = o.hit ? RED : TEAL; ctx.fillRect(o.x, top, o.w, 7);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(o.x, top, o.w, o.h);
    } else {
      ctx.save();
      ctx.translate(o.x + 11, ground);
      if (o.hit) ctx.rotate(1.2);
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(13, -5); ctx.lineTo(8, -5); ctx.lineTo(3, -26); ctx.lineTo(-3, -26); ctx.lineTo(-8, -5); ctx.lineTo(-13, -5); ctx.closePath();
      ctx.fillStyle = RED; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillStyle = CREAM; ctx.fillRect(-5.5, -17, 11, 5);
      ctx.restore();
    }
  }

  // The skater: a cream figure with an ink outline and a hard ink shadow, as the game's lettering has. Built as
  // thick lines and dots about the board's middle, x forward and y up, then drawn three times (shadow, ink, colour).
  function skater(now) {
    const air = s.air ? 1 : 0, tuck = s.air ? clamp(0.75 - Math.abs(s.vy) / 1400, 0.25, 0.75) + (s.flipping ? 0.2 : 0) : 0;
    const crouch = clamp(Math.max(tuck, s.squash * 0.7, s.grind ? 0.35 : 0.12 + 0.03 * Math.sin(now / 260)), 0, 1);
    const drop = s.flipping ? 9 * Math.sin(s.flip * Math.PI) : 0;            // the board leaves the feet mid-flip
    const roll = s.flipping ? Math.cos(s.flip * Math.PI * 2) : 1;            // 1 flat, -1 upside down
    const deck = 9, foot = deck + 3 + drop * 0.35;
    const shapes = [];
    const seg = (pts, w, colour) => shapes.push({ pts, w, colour });
    const dot = (x, y, r, colour) => shapes.push({ pts: [x, y, x + 0.01, y], w: r * 2, colour });

    // the board: wheels, then the deck with its kicked ends (yellow underneath when it's over)
    const by = deck - drop, kick = 5 * roll;
    dot(-13, by - 5 * roll, 4, RED); dot(13, by - 5 * roll, 4, RED);
    seg([-25, by + kick, -17, by, 17, by, 25, by + kick], 2.5 + 3 * Math.abs(roll), roll < 0 ? YELLOW : CREAM);

    // legs, with the knees forward
    const hip = [-1, foot + 29 * (1 - 0.46 * crouch)];
    for (const fx of [-11, 11]) {
      const dx = fx - hip[0], dy = foot - hip[1], d = Math.min(29.5, Math.hypot(dx, dy));
      const bend = Math.sqrt(Math.max(0, 15 * 15 - d * d / 4));
      let nx = -dy / d, ny = dx / d;              // across the leg; the side that points forward is the knee's
      if (nx < 0) { nx = -nx; ny = -ny; }
      seg([hip[0], hip[1], hip[0] + dx / 2 + nx * bend, hip[1] + dy / 2 + ny * bend, fx, foot], 7, CREAM);
    }
    // body, head, hair and arms (up and out in the air, as on the cover)
    const lean = (s.grind ? 0.14 : 0.22) + 0.25 * crouch;
    const sh = [hip[0] + Math.sin(lean) * 21, hip[1] + Math.cos(lean) * 21];
    seg([hip[0], hip[1], sh[0], sh[1]], 11, CREAM);
    const head = [sh[0] + 3, sh[1] + 10];
    seg([head[0] - 4, head[1] + 4, head[0] - 12, head[1] + 7 + 3 * air], 3, CREAM);
    seg([head[0] - 5, head[1] + 1, head[0] - 12, head[1] + 1 + 3 * air], 3, CREAM);
    dot(head[0], head[1], 7, CREAM);
    const up = s.air ? 1 : s.grind ? 0.55 : 0.12;
    seg([sh[0], sh[1] - 2, sh[0] - 15 - 2 * up, sh[1] - 6 + 20 * up], 6, CREAM);
    seg([sh[0], sh[1] - 2, sh[0] + 14 + 4 * up, sh[1] - 9 + 25 * up], 6, CREAM);

    ctx.save();
    ctx.translate(sx, Y(s.y));
    if (s.bail > 0) { ctx.translate(0, -22); ctx.rotate(s.spin); ctx.translate(0, 22); }
    ctx.scale(1, -1);
    for (const pass of [0, 1, 2]) {
      for (const sp of shapes) {
        if (pass === 0) { ctx.save(); ctx.translate(3.5, -3.5); line(sp.pts, sp.w + 5, INK); ctx.restore(); }
        else line(sp.pts, pass === 1 ? sp.w + 5 : sp.w, pass === 1 ? INK : sp.colour);
      }
    }
    ctx.restore();
  }

  function draw(now) {
    ctx.setTransform(dpr * unit, 0, 0, dpr * unit, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const o of obstacles) drawObstacle(o);

    // the skater's shadow on the table, smaller and fainter the higher he is
    const base = s.grind ? s.grind.h : 0, lift = clamp((s.y - base) / 220, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.38 * (1 - 0.7 * lift)})`;
    ctx.beginPath(); ctx.ellipse(sx + 4, Y(base) + 2, 27 * (1 - 0.45 * lift), 4, 0, 0, Math.PI * 2); ctx.fill();

    if (trail.length > 1) {
      ctx.globalAlpha = 0.55;
      const pts = [];
      for (const p of trail) pts.push(p.x - travelled, Y(p.y + 6));
      line(pts, 2.5, CREAM);
      ctx.globalAlpha = 1;
    }
    skater(now);
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life * 4, 0, 1);
      ctx.fillStyle = p.colour; ctx.beginPath(); ctx.arc(p.x - travelled, Y(p.y), p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // trick calls: slanted capitals in yellow with an ink outline, as over the game's park
    const px = W < 600 ? 19 : 25;
    ctx.font = `italic 700 ${px}px Oswald, "Arial Narrow", sans-serif`;
    ctx.textAlign = "center";
    for (const c of calls) {
      const text = c.text.toUpperCase();
      const half = ctx.measureText(text).width / 2 + 8;
      const x = clamp(sx + 30, half, W - half), y = Math.max(px + 4, Y(c.y) - 34 * Math.min(1, c.t * 1.6));
      ctx.globalAlpha = clamp((1.3 - c.t) * 3, 0, 1);
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(text, x + 2, y + 2); ctx.strokeText(text, x, y);
      ctx.fillStyle = c.colour; ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- the loop: only while the edge is on screen
  let last = 0, raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(1 / 30, (now - last) / 1000 || 0);
    last = now;
    step(dt, now);
    draw(now);
  }
  function wake() { if (!raf && inView && !document.hidden && !TS.reduce) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function sleep() { cancelAnimationFrame(raf); raf = 0; if (snd) { snd.roll(0); snd.grind(0); } }

  size();
  addEventListener("resize", () => { size(); if (TS.reduce) draw(0); });
  if (TS.reduce) {                                // a still picture: the skater on the edge, a rail ahead
    rink.classList.add("rink--still");
    obstacles = [{ type: "rail", x: sx + 150, w: 240, h: 34 }];
    draw(0);
    return;
  }
  new IntersectionObserver(es => { inView = es[0].isIntersecting; inView ? wake() : sleep(); }, { threshold: 0.2 }).observe(rink);
  document.addEventListener("visibilitychange", () => (document.hidden ? sleep() : wake()));
  if (document.fonts && document.fonts.load) document.fonts.load('italic 700 25px Oswald');
})();
