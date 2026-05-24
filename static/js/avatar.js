/**
 * PatientAvatar – White Shiba Inu patient face, canvas-animated.
 * States: idle | listening | speaking | thinking
 */
class PatientAvatar {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.w  = this.canvas.width;
    this.h  = this.canvas.height;
    this.cx = this.w / 2;

    this.state  = 'idle';
    this.frame  = 0;

    this.eyeOpen    = 1.0;
    this.blinkTimer = 0;
    this.nextBlink  = 150 + Math.random() * 120;

    this.mouthOpen  = 0;
    this.mouthPhase = 0;

    this.breathPhase = 0;
    this.headTilt    = 0;
    this.earWiggle   = 0;

    this._run();
  }

  setState(s) { this.state = s; }

  _run() {
    const tick = () => { this._update(); this._draw(); this.frame++; requestAnimationFrame(tick); };
    tick();
  }

  _update() {
    this.breathPhase += 0.016;

    this.blinkTimer++;
    if (this.blinkTimer >= this.nextBlink) {
      const rel = this.blinkTimer - this.nextBlink;
      if      (rel < 4) this.eyeOpen = Math.max(0, 1 - rel / 2);
      else if (rel < 7) this.eyeOpen = Math.min(1, (rel - 4) / 3);
      else { this.eyeOpen = 1; this.blinkTimer = 0; this.nextBlink = 110 + Math.random() * 140; }
    }

    if (this.state === 'speaking') {
      this.mouthPhase += 0.22;
      this.mouthOpen = Math.max(0.05, Math.min(1,
        0.3 + Math.sin(this.mouthPhase) * 0.3 + Math.cos(this.mouthPhase * 1.7) * 0.15));
    } else {
      this.mouthOpen = Math.max(0, this.mouthOpen - 0.05);
    }

    if (this.state === 'listening') {
      this.headTilt = Math.sin(this.frame * 0.025) * 0.08;
    } else {
      this.headTilt *= 0.9;
    }

    this.earWiggle = this.state === 'thinking'
      ? Math.sin(this.frame * 0.15) * 3
      : this.earWiggle * 0.85;
  }

  _draw() {
    const { ctx, w, h, cx } = this;
    const by = Math.sin(this.breathPhase) * 1.0;

    ctx.clearRect(0, 0, w, h);

    // Background – soft sky
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#e8f0f8');
    bg.addColorStop(1, '#c8ddf0');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    this._drawGlow(ctx, cx, h, by);

    ctx.save();
    ctx.translate(cx, h * 0.46 + by);
    ctx.rotate(this.headTilt);
    ctx.translate(-cx, -(h * 0.46 + by));

    // Neck fluff (white)
    ctx.fillStyle = '#eae6e0';
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.78 + by, 34, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    this._drawEars(ctx, cx, h, by);
    this._drawHead(ctx, cx, h, by);
    this._drawEyes(ctx, cx, h, by);
    this._drawSnout(ctx, cx, h, by);

    // Cheek fluff (white Shiba has fluffy cheeks)
    ctx.fillStyle = 'rgba(255, 252, 248, 0.6)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * 44, h * 0.46 + by, 18, 13, s * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawEars(ctx, cx, h, by) {
    const ew = this.earWiggle;
    for (const s of [-1, 1]) {
      // Outer ear – off-white with slight shadow
      const earGrad = ctx.createLinearGradient(
        cx + s * 20, h * 0.10 + by,
        cx + s * 60, h * 0.28 + by
      );
      earGrad.addColorStop(0, '#ddd8d0');
      earGrad.addColorStop(1, '#f0ece4');
      ctx.fillStyle = earGrad;
      ctx.beginPath();
      ctx.moveTo(cx + s * 20, h * 0.23 + by);
      ctx.lineTo(cx + s * (56 + ew * s), h * 0.04 + by);
      ctx.lineTo(cx + s * 62, h * 0.31 + by);
      ctx.closePath();
      ctx.fill();

      // Ear outline
      ctx.strokeStyle = '#c8c0b8';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Inner ear – pink (like in photo)
      ctx.fillStyle = '#f0a8b8';
      ctx.beginPath();
      ctx.moveTo(cx + s * 26, h * 0.25 + by);
      ctx.lineTo(cx + s * (52 + ew * s), h * 0.11 + by);
      ctx.lineTo(cx + s * 56, h * 0.29 + by);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawHead(ctx, cx, h, by) {
    // White/cream fur with subtle shading
    const headGrad = ctx.createRadialGradient(cx - 8, h * 0.32 + by, 0, cx, h * 0.42 + by, 68);
    headGrad.addColorStop(0,   '#ffffff');
    headGrad.addColorStop(0.45, '#f4f0ea');
    headGrad.addColorStop(0.75, '#e8e2d8');
    headGrad.addColorStop(1,   '#d0c8be');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.42 + by, 60, 66, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle fur texture (soft shadow lines)
    ctx.strokeStyle = 'rgba(200,192,180,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * 12;
      ctx.beginPath();
      ctx.moveTo(cx + ox, h * 0.18 + by);
      ctx.quadraticCurveTo(cx + ox - 4, h * 0.28 + by, cx + ox, h * 0.38 + by);
      ctx.stroke();
    }
  }

  _drawEyes(ctx, cx, h, by) {
    const ey  = h * 0.39 + by;
    const eo  = this.eyeOpen;

    for (const s of [-1, 1]) {
      const ex = cx + s * 22;

      // White of eye (small – Shiba eyes are mostly dark)
      ctx.fillStyle = '#f8f6f2';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 8.5 * eo, -s * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Very dark iris (characteristic of white Shiba)
      const iris = ctx.createRadialGradient(ex - 1.5, ey - 1.5, 0, ex, ey, 7.5);
      iris.addColorStop(0,   '#241008');
      iris.addColorStop(0.5, '#120400');
      iris.addColorStop(1,   '#000000');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 7.5, 7.5 * eo, -s * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Main highlight
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(ex - 2.5, ey - 2.5, 2.2, 2.2 * eo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Secondary highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(ex + 2, ey + 2, 1.2, 1.2 * eo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyelid during blink
      ctx.fillStyle = '#ede8e0';
      ctx.beginPath();
      ctx.ellipse(ex, ey - 8.5 * eo, 11, 8.5 * (1 - eo) + 0.5, -s * 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Lid line
      ctx.strokeStyle = '#2a1008';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 8.5 * eo, -s * 0.15, Math.PI, 0, true);
      ctx.stroke();

      // Subtle brow shadow (no bold marking on white Shiba)
      ctx.strokeStyle = 'rgba(160,148,136,0.5)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 10, ey - 8);
      ctx.quadraticCurveTo(ex, ey - 14, ex + 10, ey - 8);
      ctx.stroke();
    }
  }

  _drawSnout(ctx, cx, h, by) {
    const sy = h * 0.535 + by;

    // Snout – slightly warmer white
    const snoutGrad = ctx.createRadialGradient(cx, sy - 4, 0, cx, sy, 26);
    snoutGrad.addColorStop(0, '#ffffff');
    snoutGrad.addColorStop(0.6, '#f5f0e8');
    snoutGrad.addColorStop(1, '#e0d8cc');
    ctx.fillStyle = snoutGrad;
    ctx.beginPath();
    ctx.ellipse(cx, sy, 28, 21, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose – pink-brown (characteristic of white/cream Shibas, like photo)
    const ny = sy - 8;
    const noseGrad = ctx.createRadialGradient(cx - 3, ny - 2, 0, cx, ny, 9);
    noseGrad.addColorStop(0, '#c08878');
    noseGrad.addColorStop(0.5, '#a06858');
    noseGrad.addColorStop(1, '#805040');
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.ellipse(cx, ny, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 3, ny - 2, 4, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    this._drawMouth(ctx, cx, sy, by);
  }

  _drawMouth(ctx, cx, sy, by) {
    const my = sy + 8;
    const mo = this.mouthOpen;

    if (mo > 0.06) {
      ctx.fillStyle = '#8a1838';
      ctx.beginPath();
      ctx.ellipse(cx, my + 4 * mo, 16, 10 * mo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tongue
      const tongue = ctx.createRadialGradient(cx, my + 8 * mo, 0, cx, my + 8 * mo, 10);
      tongue.addColorStop(0, '#ffa0b8');
      tongue.addColorStop(1, '#e06888');
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(cx, my + 9 * mo, 10, 8 * mo, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#d05070';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, my + 5 * mo);
      ctx.lineTo(cx, my + 14 * mo);
      ctx.stroke();

      // Upper lip
      ctx.fillStyle = '#e8e2d8';
      ctx.beginPath();
      ctx.moveTo(cx - 16, my);
      ctx.quadraticCurveTo(cx - 8, my - 5, cx, my - 3);
      ctx.quadraticCurveTo(cx + 8, my - 5, cx + 16, my);
      ctx.quadraticCurveTo(cx + 8, my + 2, cx, my + 1);
      ctx.quadraticCurveTo(cx - 8, my + 2, cx - 16, my);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = '#a07868';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(cx, my - 3);
      ctx.lineTo(cx, my + 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 1, my + 1);
      ctx.quadraticCurveTo(cx - 9, my + 3, cx - 15, my - 1);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + 1, my + 1);
      ctx.quadraticCurveTo(cx + 9, my + 3, cx + 15, my - 1);
      ctx.stroke();
    }
  }

  _drawGlow(ctx, cx, h, by) {
    if (this.state === 'idle') return;
    const colors = {
      listening: 'rgba(59,130,246,.3)',
      speaking:  'rgba(16,185,129,.3)',
      thinking:  'rgba(245,158,11,.3)',
    };
    const col = colors[this.state]; if (!col) return;
    let r;
    if (this.state === 'speaking')  r = 72 + Math.abs(Math.sin(this.mouthPhase)) * 12;
    else r = 72 + Math.sin(this.frame * 0.06) * 8;
    const g = ctx.createRadialGradient(cx, h * .46 + by, r * .4, cx, h * .46 + by, r + 22);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(cx, h * .46 + by, r + 22, r + 22, 0, 0, Math.PI * 2); ctx.fill();
  }
}
