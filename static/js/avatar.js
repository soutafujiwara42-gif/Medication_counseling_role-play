/**
 * PatientAvatar – Canvas animated realistic patient face.
 * Draw order: background → glow → neck/shoulders → back-hair → face → front-fringe → features
 */
class PatientAvatar {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.w  = this.canvas.width;   // 150
    this.h  = this.canvas.height;  // 180
    this.cx = this.w / 2;          // 75

    this.state  = 'idle';
    this.frame  = 0;

    this.eyeOpen   = 1.0;
    this.blinkTimer = 0;
    this.nextBlink  = 150 + Math.random() * 100;

    this.mouthOpen  = 0;
    this.mouthPhase = 0;

    this.breathPhase = 0;
    this.headTilt    = 0;

    this._run();
  }

  setState(s) { this.state = s; }

  _run() {
    const tick = () => { this._update(); this._draw(); this.frame++; requestAnimationFrame(tick); };
    tick();
  }

  _update() {
    this.breathPhase += 0.018;

    // Blink
    this.blinkTimer++;
    if (this.blinkTimer >= this.nextBlink) {
      const rel = this.blinkTimer - this.nextBlink;
      if      (rel < 4) this.eyeOpen = Math.max(0, 1 - rel / 2);
      else if (rel < 7) this.eyeOpen = Math.min(1, (rel - 4) / 3);
      else { this.eyeOpen = 1; this.blinkTimer = 0; this.nextBlink = 120 + Math.random() * 160; }
    }

    // Mouth
    if (this.state === 'speaking') {
      this.mouthPhase += 0.25;
      this.mouthOpen = Math.max(0.05, Math.min(0.95,
        0.25 + Math.sin(this.mouthPhase) * 0.28 + Math.cos(this.mouthPhase * 1.6) * 0.12));
    } else {
      this.mouthOpen = Math.max(0, this.mouthOpen - 0.06);
    }

    // Head tilt
    if (this.state === 'listening') this.headTilt = Math.sin(this.frame * 0.022) * 0.035;
    else this.headTilt *= 0.93;
  }

  _draw() {
    const { ctx, w, h, cx } = this;
    const by = Math.sin(this.breathPhase) * 1.2;

    ctx.clearRect(0, 0, w, h);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#dbeafe'); bg.addColorStop(1, '#bfdbfe');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // State glow (behind everything)
    this._drawGlow(ctx, cx, h, by);

    // Head tilt pivot
    ctx.save();
    ctx.translate(cx, h * 0.44 + by);
    ctx.rotate(this.headTilt);
    ctx.translate(-cx, -(h * 0.44 + by));

    // Neck
    ctx.fillStyle = '#e8a870';
    ctx.beginPath();
    ctx.roundRect(cx - 16, h * 0.70 + by, 32, h * 0.22, [0, 0, 4, 4]);
    ctx.fill();

    // White coat shoulders
    const coat = ctx.createLinearGradient(0, h * 0.80 + by, 0, h);
    coat.addColorStop(0, '#e8f0ff'); coat.addColorStop(1, '#c0d0f0');
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(0, h); ctx.lineTo(0, h * 0.88 + by);
    ctx.bezierCurveTo(w * 0.1, h * 0.77 + by, cx - 38, h * 0.77 + by, cx - 16, h * 0.74 + by);
    ctx.lineTo(cx + 16, h * 0.74 + by);
    ctx.bezierCurveTo(cx + 38, h * 0.77 + by, w * 0.9, h * 0.77 + by, w, h * 0.88 + by);
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

    // Collar white shirt
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx - 10, h * 0.74 + by);
    ctx.lineTo(cx - 3, h * 0.90 + by);
    ctx.lineTo(cx + 3, h * 0.90 + by);
    ctx.lineTo(cx + 10, h * 0.74 + by);
    ctx.closePath(); ctx.fill();

    // ── BACK HAIR (before face) ─────────────────────────────────────────────
    this._drawHairBack(ctx, cx, h, by);

    // Face
    this._drawFace(ctx, cx, h, by);

    // Ears
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#e8a870';
      ctx.beginPath(); ctx.ellipse(cx + s * 56, h * 0.41 + by, 7, 11, s * 0.12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c87840';
      ctx.beginPath(); ctx.ellipse(cx + s * 57, h * 0.41 + by, 3, 6, s * 0.12, 0, Math.PI * 2); ctx.fill();
    }

    // ── FRONT FRINGE (after face) ───────────────────────────────────────────
    this._drawHairFront(ctx, cx, h, by);

    // Eyebrows
    this._drawEyebrows(ctx, cx, h, by);

    // Eyes
    this._drawEyes(ctx, cx, h, by);

    // Nose
    this._drawNose(ctx, cx, h, by);

    // Mouth
    this._drawMouth(ctx, cx, h, by);

    // Cheeks
    ctx.fillStyle = 'rgba(230,110,90,.13)';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + s * 37, h * 0.50 + by, 14, 8, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  _drawHairBack(ctx, cx, h, by) {
    // Dark brown back hair – drawn BEFORE face so face sits on top
    ctx.fillStyle = '#3a1f0d';

    // Top cap (larger than face oval)
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.31 + by, 60, 54, 0, Math.PI, 0, true);
    ctx.fill();

    // Side hair bands
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 55, h * 0.34 + by);
      ctx.bezierCurveTo(cx + s * 72, h * 0.48 + by, cx + s * 70, h * 0.60 + by, cx + s * 52, h * 0.68 + by);
      ctx.lineTo(cx + s * 42, h * 0.68 + by);
      ctx.bezierCurveTo(cx + s * 58, h * 0.58 + by, cx + s * 60, h * 0.46 + by, cx + s * 50, h * 0.34 + by);
      ctx.closePath(); ctx.fill();
    }
  }

  _drawHairFront(ctx, cx, h, by) {
    // Front fringe / hairline – sits OVER the very top of the face only
    ctx.fillStyle = '#3a1f0d';

    // Top forehead band
    ctx.beginPath();
    ctx.moveTo(cx - 52, h * 0.295 + by);
    ctx.bezierCurveTo(cx - 38, h * 0.245 + by, cx - 15, h * 0.225 + by, cx, h * 0.225 + by);
    ctx.bezierCurveTo(cx + 15, h * 0.225 + by, cx + 38, h * 0.245 + by, cx + 52, h * 0.295 + by);
    ctx.bezierCurveTo(cx + 42, h * 0.305 + by, cx + 22, h * 0.285 + by, cx, h * 0.285 + by);
    ctx.bezierCurveTo(cx - 22, h * 0.285 + by, cx - 42, h * 0.305 + by, cx - 52, h * 0.295 + by);
    ctx.closePath(); ctx.fill();

    // Hair highlight
    ctx.fillStyle = 'rgba(90,50,20,.2)';
    ctx.beginPath();
    ctx.ellipse(cx - 14, h * 0.255 + by, 22, 11, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawFace(ctx, cx, h, by) {
    // Depth shadow
    const sh = ctx.createRadialGradient(cx, h * 0.43 + by, 28, cx, h * 0.43 + by, 62);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.07)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.ellipse(cx, h * 0.43 + by, 54, 66, 0, 0, Math.PI * 2); ctx.fill();

    // Skin
    const skin = ctx.createRadialGradient(cx - 6, h * 0.37 + by, 0, cx, h * 0.43 + by, 60);
    skin.addColorStop(0, '#fde8c8'); skin.addColorStop(0.6, '#f5c994'); skin.addColorStop(1, '#dda060');
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(cx, h * 0.43 + by, 54, 66, 0, 0, Math.PI * 2); ctx.fill();
  }

  _drawEyebrows(ctx, cx, h, by) {
    const y0 = h * 0.335 + by;
    const lift = (this.state === 'thinking' || this.state === 'listening') ? -2 : 0;
    ctx.strokeStyle = '#3a1f0d'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 36, y0 + 2 + lift);
      ctx.quadraticCurveTo(cx + s * 23, y0 - 5 + lift, cx + s * 14, y0 + 1 + lift);
      ctx.stroke();
    }
  }

  _drawEyes(ctx, cx, h, by) {
    const ey = h * 0.395 + by;
    const rx = 12, ry = 8;
    for (const s of [-1, 1]) {
      const ex = cx + s * 22;
      const eo = this.eyeOpen;

      ctx.fillStyle = '#fefefe';
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * eo, 0, 0, Math.PI * 2); ctx.fill();

      const iris = ctx.createRadialGradient(ex - 1.5, ey - 1.5, 0, ex, ey, 6.5);
      iris.addColorStop(0, '#8c5e3a'); iris.addColorStop(.45, '#5a3015'); iris.addColorStop(1, '#28100a');
      ctx.fillStyle = iris;
      ctx.beginPath(); ctx.ellipse(ex, ey, 6.5, 6.5 * eo, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#0d0500';
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.5, 3.5 * eo, 0, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.beginPath(); ctx.ellipse(ex - 2.5, ey - 2, 2, 2 * eo, 0, 0, Math.PI * 2); ctx.fill();

      // Eyelid cover during blink
      ctx.fillStyle = '#f0bb88';
      ctx.beginPath(); ctx.ellipse(ex, ey - ry * eo, rx, ry * (1 - eo) + .5, 0, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = '#1a0800'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry * eo, 0, Math.PI, 0, true); ctx.stroke();
    }
  }

  _drawNose(ctx, cx, h, by) {
    const ny = h * 0.475 + by;
    ctx.strokeStyle = '#b87a48'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 1.5, h * 0.415 + by);
      ctx.quadraticCurveTo(cx + s * 7, ny - 3, cx + s * 5, ny + 6);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - 5, ny + 6);
    ctx.quadraticCurveTo(cx, ny + 9, cx + 5, ny + 6);
    ctx.stroke();
  }

  _drawMouth(ctx, cx, h, by) {
    const my = h * 0.572 + by;
    const mw = 17;
    const mo = this.mouthOpen;

    if (mo > 0.06) {
      // Interior
      ctx.fillStyle = '#6a1828';
      ctx.beginPath(); ctx.ellipse(cx, my + 4 * mo, mw * .85, 8 * mo, 0, 0, Math.PI * 2); ctx.fill();

      // Upper teeth
      ctx.fillStyle = '#fffdf5';
      ctx.beginPath(); ctx.roundRect(cx - mw * .6, my - .5, mw * 1.2, 5 * mo, 2); ctx.fill();

      // Upper lip
      const ul = ctx.createLinearGradient(0, my - 8, 0, my);
      ul.addColorStop(0, '#d87070'); ul.addColorStop(1, '#bf5050');
      ctx.fillStyle = ul;
      ctx.beginPath();
      ctx.moveTo(cx - mw, my);
      ctx.bezierCurveTo(cx - mw*.6, my - 8, cx - mw*.1, my - 5, cx, my - 4);
      ctx.bezierCurveTo(cx + mw*.1, my - 5, cx + mw*.6, my - 8, cx + mw, my);
      ctx.bezierCurveTo(cx + mw*.35, my - 2, cx - mw*.35, my - 2, cx - mw, my);
      ctx.closePath(); ctx.fill();

      // Lower lip
      const ll = ctx.createLinearGradient(0, my, 0, my + 10 * mo);
      ll.addColorStop(0, '#cc6060'); ll.addColorStop(1, '#f0a0a0');
      ctx.fillStyle = ll;
      ctx.beginPath();
      ctx.moveTo(cx - mw, my);
      ctx.bezierCurveTo(cx - mw*.5, my + 10 * mo, cx + mw*.5, my + 10 * mo, cx + mw, my);
      ctx.bezierCurveTo(cx + mw*.5, my + 7 * mo, cx - mw*.5, my + 7 * mo, cx - mw, my);
      ctx.closePath(); ctx.fill();
    } else {
      // Closed – subtle smile
      ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.strokeStyle = '#b85858';
      ctx.beginPath();
      ctx.moveTo(cx - mw, my);
      ctx.bezierCurveTo(cx - mw*.5, my - 6, cx + mw*.5, my - 6, cx + mw, my);
      ctx.stroke();
      ctx.strokeStyle = '#e09090'; ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx - mw, my);
      ctx.bezierCurveTo(cx - mw*.5, my + 4, cx + mw*.5, my + 4, cx + mw, my);
      ctx.stroke();
    }
  }

  _drawGlow(ctx, cx, h, by) {
    if (this.state === 'idle') return;
    const colors = { listening:'rgba(59,130,246,.3)', speaking:'rgba(16,185,129,.3)', thinking:'rgba(245,158,11,.3)' };
    const col = colors[this.state]; if (!col) return;
    let r;
    if (this.state === 'speaking') r = 68 + Math.abs(Math.sin(this.mouthPhase)) * 10;
    else r = 68 + Math.sin(this.frame * 0.06) * 7;
    const g = ctx.createRadialGradient(cx, h * .44 + by, r * .5, cx, h * .44 + by, r + 18);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, h * .44 + by, r + 18, r + 18, 0, 0, Math.PI * 2); ctx.fill();
  }
}
