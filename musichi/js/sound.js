/* Musichi website: the page's ear, its song and its sounds. Plain Web Audio, no libraries, nothing downloaded.

   The ear listens the way the app does, only smaller: either the microphone (only after the visitor presses Listen;
   the browser asks first) or the page's own song, made here in code. Each animation frame it measures the music's
   loudness, its onsets (sudden rises in the spectrum: drum hits, plucked notes) and its notes (chroma), and turns the
   notes into a colour by the app's rule: each note's place on the circle of fifths sets its hue. The sound is analysed
   a fraction of a second at a time and let go; nothing is recorded, stored or sent anywhere.

   The sounds (singing bowl, bells, whoosh, air, chimes) are synthesized like the app's NatureSounds, tuned to A minor,
   and only play once the visitor turns sound on. */
(function () {
  "use strict";

  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;

  /** The page's one AudioContext, made on the first press (browsers only allow sound after a gesture). */
  function context() {
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

  /** HSV (full saturation and value) to RGB, 0..1: the app's Color.HSVToRGB(hue, 1, 1). */
  function hue(h) {
    const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    return [[1, f, 0], [1 - f, 1, 0], [0, 1, f], [0, 1 - f, 1], [f, 0, 1], [1, 0, 1 - f]][i];
  }
  /** Each pitch class's colour (0 = C), as in the app (MusicMapper.Hue: pitchClass * 7 % 12 / 12). */
  const NOTE_COLOURS = Array.from({ length: 12 }, (_, c) => hue((c * 7) % 12 / 12));
  const WHITE_MIX = 0.15;       // the app's WhiteMix: every colour softened with 15% white
  const CHROMA_FLOOR = 0.05;    // the app's ChromaFloor

  /** The colour of a set of notes (MIDI numbers or pitch classes), mixed as the app mixes chroma. */
  function chordColour(notes) {
    const sum = [0, 0, 0];
    for (const n of notes) {
      const c = NOTE_COLOURS[((n % 12) + 12) % 12];
      sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2];
    }
    const peak = Math.max(sum[0], sum[1], sum[2], 1e-6);
    return sum.map((v) => v / peak * (1 - WHITE_MIX) + WHITE_MIX);
  }

  let noiseBuf = null;
  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  /** A gain that rises to `peak` at `t` (over `attack`) and dies away exponentially over `decay`. */
  function envelope(c, t, peak, attack, decay) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function tone(c, out, type, f, t, peak, attack, decay, detune) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    const g = envelope(c, t, peak, attack, decay);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  // ------------------------------------------------------------------------------------------------------------
  // The page's song: a calm 120 BPM groove in A minor (Am, F, C, G), like the store trailer's song. It plays through
  // the speakers and into the ear, so the page hears it the way it would hear the visitor's own music.
  // ------------------------------------------------------------------------------------------------------------
  const CHORDS = [
    { bass: 45, pad: [57, 60, 64] },   // Am
    { bass: 41, pad: [57, 60, 65] },   // F
    { bass: 48, pad: [55, 60, 64] },   // C
    { bass: 43, pad: [55, 59, 62] },   // G
  ];
  const STEP = 0.25;                   // an eighth note at 120 BPM

  const Song = {
    playing: false,

    start(c, tap) {
      if (this.playing) return;
      this.playing = true;
      this.out = c.createGain();
      this.out.gain.setValueAtTime(0.0001, c.currentTime);
      this.out.gain.linearRampToValueAtTime(0.55, c.currentTime + 0.4);
      this.comp = c.createDynamicsCompressor();
      this.out.connect(this.comp);
      this.comp.connect(c.destination);
      if (tap) this.comp.connect(tap);
      this.step = 0;
      this.next = c.currentTime + 0.12;
      this.c = c;
      this.timer = setInterval(() => this.schedule(), 25);
      this.schedule();
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearInterval(this.timer);
      const c = this.c, out = this.out, comp = this.comp;
      out.gain.cancelScheduledValues(c.currentTime);
      out.gain.setValueAtTime(out.gain.value, c.currentTime);
      out.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.3);
      setTimeout(() => { out.disconnect(); comp.disconnect(); }, 600);
    },

    schedule() {
      const c = this.c;
      while (this.next < c.currentTime + 0.15) {
        this.play(this.step, this.next);
        this.step++;
        this.next += STEP;
      }
    },

    /** One eighth note. The song builds: pad and plucks, then the kick, then everything; every 16 bars a breakdown. */
    play(step, t) {
      const c = this.c, out = this.out;
      const bar = Math.floor(step / 8), pos = step % 8;
      const chord = CHORDS[bar % 4];
      const k = (bar - 4) % 16;
      const full = bar >= 4 && k < 14;
      const kick = bar >= 2 && (bar < 4 || full);

      if (pos === 0) {                                             // the pad, one chord a bar
        for (const n of chord.pad) {
          for (const d of [-7, 7]) {
            const o = c.createOscillator();
            o.type = "sawtooth";
            o.frequency.setValueAtTime(hz(n), t);
            o.detune.setValueAtTime(d, t);
            const f = c.createBiquadFilter();
            f.type = "lowpass";
            f.frequency.setValueAtTime(1100, t);
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.03, t + 0.4);
            g.gain.setValueAtTime(0.03, t + 8 * STEP - 0.1);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 8 * STEP + 0.5);
            o.connect(f).connect(g).connect(out);
            o.start(t);
            o.stop(t + 8 * STEP + 0.6);
          }
        }
      }
      // Plucks: the chord's notes an octave up, one each eighth.
      const pluck = chord.pad[[0, 1, 2, 1, 0, 1, 2, 1][pos]] + 12;
      tone(c, out, "triangle", hz(pluck), t, full ? 0.07 : 0.09, 0.005, 0.45);
      tone(c, out, "sine", hz(pluck) * 2, t, 0.02, 0.005, 0.25);

      if (kick && pos % 2 === 0) {                                  // kick, every beat
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const g = envelope(c, t, 0.9, 0.003, 0.38);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.45);
      }
      if (full) {
        if (pos === 2 || pos === 6) {                               // snare on 2 and 4
          const n = noise(c);
          const f = c.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.setValueAtTime(1800, t);
          f.Q.setValueAtTime(0.7, t);
          n.connect(f).connect(envelope(c, t, 0.35, 0.002, 0.18)).connect(out);
          n.start(t);
          n.stop(t + 0.22);
          tone(c, out, "triangle", 185, t, 0.12, 0.002, 0.09);
        }
        const h = noise(c);                                         // hat, every eighth, the off-beats louder
        const hf = c.createBiquadFilter();
        hf.type = "highpass";
        hf.frequency.setValueAtTime(7000, t);
        h.connect(hf).connect(envelope(c, t, pos % 2 ? 0.14 : 0.08, 0.002, 0.05)).connect(out);
        h.start(t);
        h.stop(t + 0.08);
        if (pos === 0 || pos === 3 || pos === 4 || pos === 6) {      // bass
          const o = c.createOscillator();
          o.type = "sawtooth";
          o.frequency.setValueAtTime(hz(chord.bass), t);
          const f = c.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.setValueAtTime(380, t);
          f.Q.setValueAtTime(3, t);
          o.connect(f).connect(envelope(c, t, 0.22, 0.01, 0.3)).connect(out);
          o.start(t);
          o.stop(t + 0.35);
        }
      }
    },
  };

  // ------------------------------------------------------------------------------------------------------------
  // The ear: loudness, onsets and colour from whatever it hears.
  // ------------------------------------------------------------------------------------------------------------
  const Ear = {
    mode: "off",                 // "off", "mic" (the visitor's microphone) or "song" (the page's own song)
    onChange: null,
    loud: 0,                     // 0..1 against the music's own recent range, as the app's loudness is
    level: 0,                    // a quick 0..1 for the little meter
    silent: true,
    colour: [1, 1, 1],

    available: !!AC,
    canListen: !!(AC && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext),

    _setup() {
      const c = context();
      if (!c) return null;
      if (!this.input) {
        this.input = c.createGain();
        // Onsets and loudness: a short window (21 ms at 48 kHz). Notes: a long one (170 ms), so neighbouring notes
        // fall in different bins even in the bass.
        this.fast = c.createAnalyser();
        this.fast.fftSize = 1024;
        this.fast.smoothingTimeConstant = 0;
        this.slow = c.createAnalyser();
        this.slow.fftSize = 8192;
        this.slow.smoothingTimeConstant = 0;
        this.input.connect(this.fast);
        this.input.connect(this.slow);
        this.td = new Float32Array(this.fast.fftSize);
        this.fd = new Float32Array(this.fast.frequencyBinCount);
        this.prev = new Float32Array(this.fast.frequencyBinCount);
        this.sd = new Float32Array(this.slow.frequencyBinCount);
        this.fluxBins = Math.min(this.fd.length, Math.round(8000 / (c.sampleRate / this.fast.fftSize)));
        // Each long-window bin's pitch class and weight (full at a note's centre, nothing halfway between notes).
        this.pcOf = new Int8Array(this.sd.length).fill(-1);
        this.pcW = new Float32Array(this.sd.length);
        const binHz = c.sampleRate / this.slow.fftSize;
        for (let i = 1; i < this.sd.length; i++) {
          const f = i * binHz;
          if (f < 100 || f > 2100) continue;
          const midi = 69 + 12 * Math.log2(f / 440);
          const r = Math.round(midi);
          this.pcOf[i] = ((r % 12) + 12) % 12;
          this.pcW[i] = Math.max(0, 1 - 2 * Math.abs(midi - r));
        }
        this.chroma = new Float32Array(12);
        this.chromaSmooth = new Float32Array(12);
        this.floor = -60;
        this.ceil = -30;
        this.fluxMean = 0;
        this.prevFlux = 0;
        this.lastOnset = 0;
        this.guardUntil = 0;
        this.frameNo = 0;
      }
      return c;
    },

    _changed() { if (this.onChange) this.onChange(this.mode); },

    /** Start listening to the microphone. Throws if the visitor (or the browser) says no. */
    async listen() {
      const c = this._setup();
      if (!c || !this.canListen) throw new Error("No microphone here");
      this.stop(true);
      // Voice processing (echo cancelling, noise suppression, automatic gain) treats distant music as noise to
      // remove; the app found the same with the Quest's recorder. Ask for the plain signal.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.src = c.createMediaStreamSource(this.stream);
      this.src.connect(this.input);
      this.floor = -70;
      this.ceil = -40;
      this.mode = "mic";
      this._changed();
    },

    /** Play the page's own song and listen to it. */
    playSong() {
      const c = this._setup();
      if (!c) return;
      this.stop(true);
      Song.start(c, this.input);
      this.floor = -45;
      this.ceil = -15;
      this.mode = "song";
      this._changed();
    },

    /** Stop listening: the microphone is released (its indicator goes out), or the song fades. */
    stop(quiet) {
      if (this.stream) {
        this.stream.getTracks().forEach((tr) => tr.stop());
        this.stream = null;
      }
      if (this.src) { this.src.disconnect(); this.src = null; }
      Song.stop();
      const was = this.mode;
      this.mode = "off";
      this.loud = this.level = 0;
      this.silent = true;
      if (!quiet && was !== "off") this._changed();
    },

    /** Ignore onsets for a moment: the page's own sounds would otherwise be heard as music (the app's Guarding). */
    guard(seconds) {
      if (ctx) this.guardUntil = Math.max(this.guardUntil, ctx.currentTime + seconds);
    },

    /** One animation frame of listening. Returns the onset's strength (0 when there wasn't one). */
    frame(dt) {
      if (this.mode === "off" || !this.input) return 0;
      const now = ctx.currentTime;

      // Loudness: the level in dBFS, placed in the music's own recent range (quick to follow a new floor or peak,
      // slow to forget them), as the app's RangeTracker does.
      this.fast.getFloatTimeDomainData(this.td);
      let ss = 0;
      for (let i = 0; i < this.td.length; i++) ss += this.td[i] * this.td[i];
      const db = 10 * Math.log10(ss / this.td.length + 1e-12);
      this.floor += (db - this.floor) * ease(dt, db < this.floor ? 0.3 : 30);
      this.ceil += (db - this.ceil) * ease(dt, db > this.ceil ? 0.15 : 20);
      const span = Math.max(this.ceil - this.floor, 15);
      this.silent = db < (this.mode === "mic" ? -78 : -60);
      const loud = this.silent ? 0 : clamp((db - this.floor) / span, 0, 1);
      this.loud += (loud - this.loud) * ease(dt, 0.08);
      this.level += (clamp((db + 70) / 55, 0, 1) - this.level) * ease(dt, 0.05);

      // Onsets: spectral flux, the sum of how much each frequency band rose since the last frame (log-compressed,
      // so quiet bands count), against its own recent average.
      this.fast.getFloatFrequencyData(this.fd);
      let flux = 0;
      for (let i = 1; i < this.fluxBins; i++) {
        const v = this.fd[i];
        const lm = Math.log1p(100 * (v > -160 ? Math.pow(10, v / 20) : 0));
        const rise = lm - this.prev[i];
        if (rise > 0) flux += rise;
        this.prev[i] = lm;
      }
      flux /= this.fluxBins;
      const threshold = this.fluxMean * 1.6 + 0.008;
      // The strongest recent onset, forgotten over a few seconds: a kick drum against it makes a big wave, a plucked
      // note between beats a small one (the app sends smaller pulses for onsets than for beats).
      this.fluxPeak = Math.max(flux, (this.fluxPeak || 0) * Math.exp(-dt / 4));
      let onset = 0;
      if (!this.silent && flux > threshold && flux > this.prevFlux && now - this.lastOnset > 0.12 && now > this.guardUntil) {
        const share = flux / (this.fluxPeak + 1e-6);
        onset = (0.22 + 0.78 * clamp((share - 0.25) / 0.7, 0, 1)) * (0.5 + 0.5 * this.loud);
        this.lastOnset = now;
      }
      this.fluxMean += (flux - this.fluxMean) * ease(dt, 0.5);
      this.prevFlux = flux;

      // Notes, a few times a second: each bin's power added to its pitch class, the strongest scaled to 1.
      if (++this.frameNo % 3 === 0) {
        this.slow.getFloatFrequencyData(this.sd);
        this.chroma.fill(0);
        for (let i = 1; i < this.sd.length; i++) {
          const pc = this.pcOf[i];
          if (pc < 0) continue;
          const v = this.sd[i];
          if (v < -140) continue;
          this.chroma[pc] += this.pcW[i] * Math.pow(10, v / 10);
        }
        let peak = 1e-20;
        for (let c = 0; c < 12; c++) peak = Math.max(peak, this.chroma[c]);
        for (let c = 0; c < 12; c++) this.chroma[c] /= peak;
      }
      const target = [0, 0, 0];
      let peakC = 0;
      for (let c = 0; c < 12; c++) {
        this.chromaSmooth[c] += (this.chroma[c] - this.chromaSmooth[c]) * ease(dt, 0.3);
        const w = Math.max(0, this.chromaSmooth[c] - CHROMA_FLOOR);
        const col = NOTE_COLOURS[c];
        target[0] += col[0] * w * w; target[1] += col[1] * w * w; target[2] += col[2] * w * w;
      }
      peakC = Math.max(target[0], target[1], target[2]);
      for (let k = 0; k < 3; k++) {
        const v = this.silent || peakC < 1e-6 ? 1 : target[k] / peakC;
        const soft = v * (1 - WHITE_MIX) + WHITE_MIX;
        this.colour[k] += (soft - this.colour[k]) * ease(dt, 0.3);
      }
      return onset;
    },
  };

  // ------------------------------------------------------------------------------------------------------------
  // The sounds: calm, natural, tuned to A minor; played only with sound on (or when the visitor asks for one).
  // ------------------------------------------------------------------------------------------------------------
  const KEY = [57, 60, 62, 64, 67];             // A C D E G: the minor pentatonic

  const Sfx = {
    on: false,

    bus(c) {
      if (!this.out) {
        this.out = c.createGain();
        this.out.gain.value = 0.35;
        this.out.connect(c.destination);
      }
      return this.out;
    },

    /** Play one sound by name. `force` plays it even with sound off (the visitor pressed that sound's name). */
    play(name, opts) {
      opts = opts || {};
      if (!this.on && !opts.force) return;
      const c = context();
      if (!c) return;
      const out = this.bus(c);
      const t = c.currentTime + 0.01;
      Ear.guard(0.3);
      switch (name) {
        case "bowl": return this.bowl(c, out, t, opts.note || 45);
        case "bell": return this.bell(c, out, t, opts.note || KEY[(Math.random() * KEY.length) | 0] + 12, opts.gain || 0.5);
        case "whoosh": return this.whoosh(c, out, t);
        case "burst": return this.burst(c, out, t);
        case "air": return this.air(c, out, t, 2.6, 0.32);
        case "breath": return this.air(c, out, t, 1.2, 0.12);
        case "chimes": return this.chimes(c, out, t);
      }
    },

    /** A singing bowl: a few inharmonic partials, each a slowly beating pair, ringing for seconds. */
    bowl(c, out, t, note) {
      const f = hz(note + 12);
      [[1, 0.5, 6], [2.71, 0.26, 3.6], [5.15, 0.12, 2.1], [8.4, 0.05, 1.2]].forEach(([r, a, d]) => {
        tone(c, out, "sine", f * r, t, a * 0.5, 0.015, d);
        tone(c, out, "sine", f * r + 0.45, t, a * 0.5, 0.015, d);
      });
    },

    bell(c, out, t, note, gain) {
      const f = hz(note);
      [[1, 0.35, 2.2], [2, 0.14, 1.2], [2.76, 0.11, 1.0], [5.4, 0.05, 0.45]].forEach(([r, a, d]) => {
        tone(c, out, "sine", f * r, t, a * gain, 0.003, d);
      });
    },

    /** A whoosh: noise through a band-pass sweeping up and back down, swelling in (the app's NatureSound.Whoosh). */
    whoosh(c, out, t) {
      const n = noise(c);
      const f = c.createBiquadFilter();
      f.type = "bandpass";
      f.Q.setValueAtTime(1.4, t);
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
      f.frequency.exponentialRampToValueAtTime(320, t + 0.6);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.55, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
      n.connect(f).connect(g).connect(out);
      n.start(t);
      n.stop(t + 0.7);
    },

    /** A line's end: a soft crack, then three bells of the chord. */
    burst(c, out, t) {
      const n = noise(c);
      const f = c.createBiquadFilter();
      f.type = "highpass";
      f.frequency.setValueAtTime(1200, t);
      n.connect(f).connect(envelope(c, t, 0.5, 0.001, 0.09)).connect(out);
      n.start(t);
      n.stop(t + 0.12);
      [69, 72, 76].forEach((m, i) => this.bell(c, out, t + 0.05 + i * 0.08, m + 12, 0.4));
    },

    /** Air: filtered noise swelling and falling, its colour drifting. */
    air(c, out, t, len, peak) {
      const n = noise(c);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(900, t);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.setValueAtTime(0.6, t);
      bp.frequency.setValueAtTime(400, t);
      bp.frequency.linearRampToValueAtTime(900, t + len * 0.45);
      bp.frequency.linearRampToValueAtTime(480, t + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + len * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      n.connect(lp).connect(bp).connect(g).connect(out);
      n.start(t);
      n.stop(t + len + 0.05);
    },

    chimes(c, out, t) {
      const notes = KEY.map((m) => m + 24).concat([81 + 12]).sort(() => Math.random() - 0.5);
      let at = t;
      notes.forEach((m) => {
        this.bell(c, out, at, m, 0.22);
        at += 0.12 + Math.random() * 0.2;
      });
    },
  };

  window.MusichiSound = { context, Ear, Song, Sfx, NOTE_COLOURS, chordColour, CHORDS, available: !!AC };
})();
