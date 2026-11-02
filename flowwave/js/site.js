// Flow Wave site. One beat clock (120 BPM, the run music's tempo) drives the hero floor, the pickups and the portal
// rift, the way the game's shader globals drive its world. Everything here is decoration: the page reads and the
// store button works without it.
(() => {
  "use strict";

  const BEAT = 0.5;                                   // seconds per beat at 120 BPM
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const now = () => performance.now() / 1000;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const beatPulse = (t) => Math.exp(-((t / BEAT) % 1) * 5);   // 1 on the beat, falling away before the next

  // ---------------------------------------------------------------- stars
  const stars = document.querySelector(".stars");
  if (stars) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 46; i++) {
      const s = document.createElement("i");
      s.className = "star";
      const size = 5 + Math.random() ** 2 * 13;
      s.style.cssText = `left:${(Math.random() * 100).toFixed(2)}%;top:${(Math.random() * 92).toFixed(2)}%;` +
        `--s:${size.toFixed(1)}px;--t:${(2 + Math.random() * 3).toFixed(2)}s;--d:${(-Math.random() * 5).toFixed(2)}s`;
      frag.appendChild(s);
    }
    stars.appendChild(frag);
  }

  // ---------------------------------------------------------------- hero: floor, pickups, plane
  const hero = document.querySelector(".hero");
  const canvas = hero && hero.querySelector(".floor");
  const plane = hero && hero.querySelector(".plane");
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    const sprite = (name) => { const img = new Image(); img.src = `assets/img/${name}.webp`; return img; };
    const art = {
      gold: sprite("coin-gold"), ruby: sprite("coin-ruby"), silver: sprite("coin-silver"),
      ring: sprite("boost-ring"), x3: sprite("gem-x3"), x5: sprite("gem-x5"), x10: sprite("gem-x10"),
    };
    const burstColor = { gold: "#F2D15C", ruby: "#FF5EA8", silver: "#9FD6FF", ring: "#4FE3FF", x3: "#FFB26B", x5: "#FF5EA8", x10: "#4FE3FF" };

    // World units: the camera is 1 above the floor; z is distance ahead. Floor point (X, Y, z) lands at
    // x = W/2 + fx·X/z, y = H·(1 − Y)/z below the horizon (canvas top), so z = 1 is the canvas's bottom edge.
    const CELL_X = 0.22, CELL_Z = 0.25, FAR = 40;
    const SPEED = 2 * CELL_Z / BEAT;                  // two floor lines per beat
    const SPAWN_Z = 9;
    const PLANE_Z = 1.15, PLANE_Y = 0.42, LANE = 0.62;
    let W = 0, H = 0, fx = 0, dpr = 1, lineGrad = null;
    let things = [], bursts = [];
    let lastBeat = -1, running = false, visible = true;
    const pilot = { x: 0, v: 0, y: PLANE_Y, target: 0, targetY: PLANE_Y, lastInput: -10, roll: 0 };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      fx = Math.max(W * 0.5, H * 0.9);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lineGrad = ctx.createLinearGradient(0, 0, 0, H);
      lineGrad.addColorStop(0, "rgba(255, 94, 168, 0)");
      lineGrad.addColorStop(0.18, "rgba(255, 94, 168, 0.35)");
      lineGrad.addColorStop(1, "rgba(255, 120, 190, 1)");
    };

    const spawn = (beat) => {
      // A row of coins every other beat (like the game's coin trails), a ring or a gem now and then.
      if (beat % 2 === 0) {
        const X = (Math.random() * 2 - 1) * LANE * 0.9;
        const Y = PLANE_Y + (Math.random() * 2 - 1) * 0.08;
        const kind = Math.random() < 0.7 ? "gold" : Math.random() < 0.5 ? "silver" : "ruby";
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) things.push({ kind, X, Y, z: SPAWN_Z + i * 0.32, size: 0.11, spin: Math.random() * 6 });
      }
      if (beat % 8 === 5) {
        const kind = ["ring", "ring", "x3", "x5", "x10"][Math.floor(Math.random() * 5)];
        things.push({ kind, X: (Math.random() * 2 - 1) * LANE * 0.8, Y: PLANE_Y + 0.02, z: SPAWN_Z + 0.5, size: kind === "ring" ? 0.24 : 0.2, spin: 0 });
      }
    };

    const drawFloor = (t, pulse) => {
      const phase = (t * SPEED) % CELL_Z;             // whole lines per beat, so the floor stays on the beat
      ctx.lineCap = "round";
      // Depth lines (across the floor).
      for (let k = 0; ; k++) {
        const z = 0.8 + k * CELL_Z - phase;
        if (z > FAR) break;
        if (z <= 0.8) continue;
        const y = H / z;
        const a = clamp(1.25 / z, 0, 1) * (0.55 + 0.45 * pulse);
        if (a < 0.02) continue;
        ctx.strokeStyle = `rgba(255, 94, 168, ${(a * 0.28).toFixed(3)})`;
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        ctx.strokeStyle = `rgba(255, 150, 205, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // Lane lines (into the distance), all meeting under the sun.
      const n = Math.ceil(W / (fx * CELL_X * 2 * 0.8)) + 4;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = pass === 0 ? 6 : 1.6;
        ctx.globalAlpha = (pass === 0 ? 0.28 : 1) * (0.6 + 0.4 * pulse);
        ctx.beginPath();
        for (let i = -n; i <= n; i++) {
          const X = i * CELL_X;
          ctx.moveTo(W / 2 + fx * X / FAR, H / FAR);
          ctx.lineTo(W / 2 + fx * X / 0.8, H / 0.8);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Haze where the floor meets the sunset.
      const haze = ctx.createLinearGradient(0, 0, 0, H * 0.22);
      haze.addColorStop(0, "rgba(255, 128, 153, 0.55)");
      haze.addColorStop(1, "rgba(255, 128, 153, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H * 0.22);
    };

    const project = (X, Y, z) => [W / 2 + fx * X / z, H * (1 - Y) / z];

    const drawThings = (t, dt, pulse, speed) => {
      // Farthest first.
      things.sort((a, b) => b.z - a.z);
      for (const o of things) {
        const prevZ = o.z;
        o.z -= speed * dt;
        // Collected when it passes the plane's depth inside the plane's reach.
        if (prevZ > PLANE_Z && o.z <= PLANE_Z && Math.abs(o.X - pilot.x) < 0.17 && Math.abs(o.Y - pilot.y) < 0.2) {
          const [bx, by] = project(o.X, o.Y, PLANE_Z);
          bursts.push({ x: bx, y: by, t0: t, color: burstColor[o.kind], big: o.kind === "ring" || o.kind.startsWith("x") });
          o.dead = true;
          continue;
        }
        if (o.z < 0.75) { o.dead = true; continue; }
        const img = art[o.kind];
        if (!img.complete || !img.naturalWidth) continue;
        const [sx, sy] = project(o.X, o.Y, o.z);
        const s = fx * o.size / o.z * (o.kind === "ring" ? 1 : 1.9) * (1 + 0.08 * pulse);
        const fadeIn = clamp((SPAWN_Z + 1.2 - o.z) / 2.5, 0, 1);
        const fadeOut = clamp((o.z - 0.75) / 0.4, 0, 1);    // gone soon after passing the plane (drawn under it)
        ctx.globalAlpha = fadeIn * fadeOut;
        const squash = o.kind === "gold" || o.kind === "silver" || o.kind === "ruby" ? 0.45 + 0.55 * Math.abs(Math.cos(t * 2.4 + o.spin)) : 1;
        ctx.drawImage(img, sx - (s * squash) / 2, sy - s / 2, s * squash, s);
      }
      ctx.globalAlpha = 1;
      things = things.filter((o) => !o.dead);
    };

    const drawBursts = (t) => {
      for (const b of bursts) {
        const k = (t - b.t0) / (b.big ? 0.7 : 0.45);
        if (k >= 1) { b.dead = true; continue; }
        const r = (b.big ? 70 : 34) * (0.3 + k) * Math.max(0.6, fx / 700);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 3 * (1 - k) + 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = b.color;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + b.t0;
          ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r * 1.25, b.y + Math.sin(a) * r * 1.25, 2.4 * (1 - k) + 0.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      bursts = bursts.filter((b) => !b.dead);
    };

    // Steering: the pointer is your hand. Like the game, the plane's bank answers at once and its movement
    // through the lane eases on a spring; with no input it flies itself.
    const steer = (t, dt) => {
      if (t - pilot.lastInput > 2.5) {
        pilot.target = Math.sin(t * 0.55) * LANE * 0.62 + Math.sin(t * 1.45 + 1) * LANE * 0.18;
        pilot.targetY = PLANE_Y + Math.sin(t * 0.8) * 0.04;
      }
      const k = 14, c = 2 * Math.sqrt(k) * 0.9;
      pilot.v += (k * (pilot.target - pilot.x) - c * pilot.v) * dt;
      pilot.x += pilot.v * dt;
      pilot.y += (pilot.targetY - pilot.y) * Math.min(1, dt * 4);
      const wantRoll = clamp((pilot.target - pilot.x) * 75 + pilot.v * 16, -32, 32);
      pilot.roll += (wantRoll - pilot.roll) * Math.min(1, dt * 12);
    };

    const placePlane = (pulse) => {
      if (!plane) return;
      const [sx, sy] = project(pilot.x, pilot.y, PLANE_Z);
      const top = canvas.offsetTop;
      const w = plane.offsetWidth, h = plane.offsetHeight;
      const bob = -4 * pulse;
      plane.style.transform = `translate3d(${(sx - w / 2).toFixed(1)}px, ${(top + sy - h / 2 + bob).toFixed(1)}px, 0) rotate(${pilot.roll.toFixed(2)}deg)`;
      hero.style.setProperty("--px", (pilot.x / LANE).toFixed(3));
    };

    let last = now();
    const frame = () => {
      if (!running) return;
      const t = now();
      const dt = Math.min(0.05, t - last);
      last = t;
      const beat = Math.floor(t / BEAT);
      if (beat !== lastBeat) { if (lastBeat >= 0) spawn(beat); lastBeat = beat; }
      const pulse = beatPulse(t);
      ctx.clearRect(0, 0, W, H);
      drawFloor(t, pulse);
      steer(t, dt);
      drawThings(t, dt, pulse, SPEED);
      drawBursts(t);
      placePlane(pulse);
      requestAnimationFrame(frame);
    };
    const start = () => { if (!running && visible && !document.hidden && !reduce) { running = true; last = now(); requestAnimationFrame(frame); } };
    const stop = () => { running = false; };

    resize();
    plane && plane.classList.add("is-flying");
    if (reduce) {
      drawFloor(0, 0.4);
      placePlane(0);
    } else {
      // Fill the lane so the first seconds aren't empty: spawn the last few beats' rows where they'd be by now.
      for (let b = 2; b <= 14; b += 2) {
        const before = things.length;
        spawn(b);
        for (const o of things.slice(before)) o.z -= (14 - b) * BEAT * SPEED;
      }
      things = things.filter((o) => o.z > 1.4);
      start();
    }

    addEventListener("resize", () => { resize(); if (!running) { drawFloor(0, 0.4); placePlane(0); } });
    addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      pilot.target = ((e.clientX / innerWidth) * 2 - 1) * LANE;
      pilot.targetY = PLANE_Y + (0.5 - e.clientY / innerHeight) * 0.16;
      pilot.lastInput = now();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }).observe(hero);
  }

  // ---------------------------------------------------------------- trailer: torn neon portal + play
  const portal = document.querySelector(".portal");
  const video = document.getElementById("trailer-video");
  if (portal && video) {
    const win = portal.querySelector(".portal__window");
    const svg = portal.querySelector(".portal__rift");
    const NS = "http://www.w3.org/2000/svg";
    const PAD = 18;
    svg.innerHTML = `
      <defs>
        <linearGradient id="riftGrad" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFB26B"/><stop offset="0.25" stop-color="#FF8066"/>
          <stop offset="0.5" stop-color="#E86BD6"/><stop offset="0.75" stop-color="#7D8CFF"/>
          <stop offset="1" stop-color="#4FE3FF"/>
        </linearGradient>
      </defs>
      <path class="r0" fill="none" stroke="url(#riftGrad)" stroke-width="16" stroke-opacity="0.12" stroke-linejoin="round"/>
      <path class="r1" fill="none" stroke="url(#riftGrad)" stroke-width="7" stroke-opacity="0.35" stroke-linejoin="round"/>
      <path class="r2" fill="none" stroke="url(#riftGrad)" stroke-width="3" stroke-linejoin="round"/>
      <path class="r3" fill="none" stroke="#FFF5E6" stroke-width="1" stroke-opacity="0.85" stroke-linejoin="round"/>`;
    const paths = [...svg.querySelectorAll("path")];
    const grad = svg.querySelector("linearGradient");
    let pts = [], w = 0, h = 0, riftOn = false, inView = false;

    const layout = () => {
      w = win.clientWidth; h = win.clientHeight;
      svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`);
      // Points around the rectangle, each with a tear depth and an outward normal.
      pts = [];
      const step = 11;
      const edge = (x0, y0, x1, y1, nx, ny) => {
        const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.round(len / step));
        for (let i = 0; i < n; i++) {
          const k = i / n;
          pts.push({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, nx, ny, d: (Math.random() * 2 - 1) * 5 + 1, ph: Math.random() * 6.28 });
        }
      };
      edge(0, 0, w, 0, 0, -1); edge(w, 0, w, h, 1, 0); edge(w, h, 0, h, 0, 1); edge(0, h, 0, 0, -1, 0);
    };
    const draw = (t) => {
      const pulse = beatPulse(t);
      let d = "";
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const off = p.d * (0.7 + 0.3 * Math.sin(t * 7 + p.ph)) + 2 + 3 * pulse * Math.abs(Math.sin(p.ph * 3));
        d += (i ? "L" : "M") + (p.x + p.nx * off).toFixed(1) + " " + (p.y + p.ny * off).toFixed(1);
      }
      d += "Z";
      for (const p of paths) p.setAttribute("d", d);
      paths[0].setAttribute("stroke-width", (14 + 10 * pulse).toFixed(1));
      paths[1].setAttribute("stroke-opacity", (0.3 + 0.3 * pulse).toFixed(2));
      grad.setAttribute("gradientTransform", `rotate(${((t * 24) % 360).toFixed(1)} 0.5 0.5)`);
    };
    const loop = () => { if (!riftOn) return; draw(now()); requestAnimationFrame(loop); };
    const update = () => {
      const want = inView && !document.hidden && !reduce;
      if (want && !riftOn) { riftOn = true; requestAnimationFrame(loop); }
      if (!want) riftOn = false;
    };
    layout(); draw(0);
    new ResizeObserver(() => { layout(); draw(now()); }).observe(win);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }).observe(portal);
    document.addEventListener("visibilitychange", update);

    const play = () => { const p = video.play(); if (p && p.catch) p.catch(() => {}); };
    // Our play button stands in for the native controls until the trailer starts (no-JS keeps the native ones).
    video.controls = false;
    portal.querySelector(".play").addEventListener("click", play);
    video.addEventListener("play", () => { portal.classList.add("is-playing"); video.controls = true; });
    video.addEventListener("ended", () => portal.classList.remove("is-playing"));
    document.querySelectorAll("[data-play-trailer]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      portal.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      play();
    }));
  }

  // ---------------------------------------------------------------- screenshots lightbox
  const box = document.querySelector(".lightbox");
  const shots = [...document.querySelectorAll(".shots__strip button")];
  if (box && shots.length && typeof box.showModal === "function") {
    const img = box.querySelector("img");
    let at = 0;
    const show = (i) => {
      at = (i + shots.length) % shots.length;
      img.src = shots[at].dataset.full;
      img.alt = shots[at].querySelector("img").alt;
    };
    shots.forEach((b, i) => b.addEventListener("click", () => { show(i); box.showModal(); }));
    box.querySelector(".lightbox__prev").addEventListener("click", () => show(at - 1));
    box.querySelector(".lightbox__next").addEventListener("click", () => show(at + 1));
    box.querySelector(".lightbox__close").addEventListener("click", () => box.close());
    box.addEventListener("click", (e) => { if (e.target === box) box.close(); });
    box.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") show(at - 1);
      if (e.key === "ArrowRight") show(at + 1);
    });
  }

  // ---------------------------------------------------------------- reveal on scroll
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  // The wave rule's SMIL animation ignores CSS; honour reduced motion here.
  if (reduce) document.querySelectorAll("svg.wave-rule").forEach((s) => s.pauseAnimations && s.pauseAnimations());
})();
