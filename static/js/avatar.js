/**
 * PatientAvatar – Shiba Inu patient face, canvas-animated.
 * States: idle | listening | speaking | thinking
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

    // Blink
    this.eyeOpen    = 1.0;
    this.blinkTimer = 0;
    this.nextBlink  = 150 + Math.random() * 120;

    // Mouth
    this.mouthOpen  = 0;
    this.mouthPhase = 0;

    // Micro-movement
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

    // Blink
    this.blinkTimer++;
    if (this.blinkTimer >= this.nextBlink) {
      const rel = this.blinkTimer - this.nextBlink;
      if      (rel < 4) this.eyeOpen = Math.max(0, 1 - rel / 2);
      else if (rel < 7) this.eyeOpen = Math.min(1, (rel - 4) / 3);
      else { this.eyeOpen = 1; this.blinkTimer = 0; this.nextBlink = 110 + Math.random() * 140; }
    }

    // Mouth (speaking animation)
    if (this.state === 'speaking') {
      this.mouthPhase += 0.22;
      this.mouthOpen = Math.max(0.05, Math.min(1,
        0.3 + Math.sin(this.mouthPhase) * 0.3 + Math.cos(this.mouthPhase * 1.7) * 0.15));
    } else {
      this.mouthOpen = Math.max(0, this.mouthOpen - 0.05);
    }

    // Head tilt when listening
    if (this.state === 'listening') {
      this.headTilt = Math.sin(this.frame * 0.025) * 0.08; // Shiba inquisitive head tilt!
    } else {
      this.headTilt *= 0.9;
    }

    // Ear wiggle when thinking
    this.earWiggle = this.state === 'thinking'
      ? Math.sin(this.frame * 0.15) * 3
      : this.earWiggle * 0.85;
  }

  _draw() {
    const { ctx, w, h, cx } = this;
    const by = Math.sin(this.breathPhase) * 1.0;

    ctx.clearRect(0, 0, w, h);

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#fff7ed');
    bg.addColorStop(1, '#fed7aa');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // State glow (behind face)
    this._drawGlow(ctx, cx, h, by);

    // Head tilt
    ctx.save();
    ctx.translate(cx, h * 0.46 + by);
    ctx.rotate(this.headTilt);
    ctx.translate(-cx, -(h * 0.46 + by));

    // Neck fluff
    ctx.fillStyle = '#e8c090';
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.78 + by, 32, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears (behind head)
    this._drawEars(ctx, cx, h, by);

    // Main head (orange-tan Shiba)
    this._drawHead(ctx, cx, h, by);

    // Forehead cream marking
    this._drawForeheadMark(ctx, cx, h, by);

    // Eyes
    this._drawEyes(ctx, cx, h, by);

    // Snout + nose + mouth
    this._drawSnout(ctx, cx, h, by);

    // Cheek puffs
    ctx.fillStyle = 'rgba(255, 220, 180, 0.5)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * 40, h * 0.52 + by, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawEars(ctx, cx, h, by) {
    const ew = this.earWiggle;

    for (const s of [-1, 1]) {
      // Outer ear (orange)
      ctx.fillStyle = '#cc5500';
      ctx.beginPath();
      ctx.moveTo(cx + s * 20, h * 0.22 + by);
      ctx.lineTo(cx + s * (58 + ew * s), h * 0.04 + by);
      ctx.lineTo(cx + s * 62, h * 0.30 + by);
      ctx.closePath();
      ctx.fill();

      // Inner ear (pink)
      ctx.fillStyle = '#f4a0b0';
      ctx.beginPath();
      ctx.moveTo(cx + s * 24, h * 0.24 + by);
      ctx.lineTo(cx + s * (54 + ew * s), h * 0.10 + by);
      ctx.lineTo(cx + s * 56, h * 0.28 + by);
      ctx.closePath();
      ctx.fill();
    }
  }

  _drawHead(ctx, cx, h, by) {
    // Main orange head
    const headGrad = ctx.createRadialGradient(cx - 10, h * 0.34 + by, 0, cx, h * 0.42 + by, 70);
    headGrad.addColorStop(0,   '#f08030');
    headGrad.addColorStop(0.5, '#e06820');
    headGrad.addColorStop(1,   '#c04810');
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.42 + by, 60, 66, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawForeheadMark(ctx, cx, h, by) {
    // Cream/white Shiba forehead marking (inverted V shape)
    ctx.fillStyle = 'rgba(255, 245, 220, 0.7)';
    ctx.beginPath();
    ctx.moveTo(cx - 22, h * 0.28 + by);
    ctx.quadraticCurveTo(cx, h * 0.21 + by, cx + 22, h * 0.28 + by);
    ctx.quadraticCurveTo(cx + 14, h * 0.34 + by, cx, h * 0.32 + by);
    ctx.quadraticCurveTo(cx - 14, h * 0.34 + by, cx - 22, h * 0.28 + by);
    ctx.closePath();
    ctx.fill();
  }

  _drawEyes(ctx, cx, h, by) {
    const ey  = h * 0.39 + by;
    const eo  = this.eyeOpen;

    for (const s of [-1, 1]) {
      const ex = cx + s * 22;

      // Eye white (tiny, Shiba eyes are mostly dark)
      ctx.fillStyle = '#fff8ee';
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 8.5 * eo, -s * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Dark iris (large – gives Shiba the characteristic dark eye look)
      const iris = ctx.createRadialGradient(ex - 1, ey - 1, 0, ex, ey, 7);
      iris.addColorStop(0,   '#3a1a00');
      iris.addColorStop(0.6, '#1a0800');
      iris.addColorStop(1,   '#000000');
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 7, 7 * eo, -s * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.beginPath();
      ctx.ellipse(ex - 2.5, ey - 2.5, 2, 2 * eo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Secondary small highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.ellipse(ex + 2, ey + 2, 1, 1 * eo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Eyelid cover during blink
      ctx.fillStyle = '#e06820';
      ctx.beginPath();
      ctx.ellipse(ex, ey - 8.5 * eo, 11, 8.5 * (1 - eo) + 0.5, -s * 0.18, 0, Math.PI * 2);
      ctx.fill();

      // Upper lid line
      ctx.strokeStyle = '#2a0c00';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, 8.5 * eo, -s * 0.18, Math.PI, 0, true);
      ctx.stroke();

      // Shiba "eyebrow" marking (cream arc above eye)
      ctx.strokeStyle = 'rgba(255, 235, 190, 0.9)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - 11, ey - 7);
      ctx.quadraticCurveTo(ex, ey - 14, ex + 11, ey - 7);
      ctx.stroke();
    }
  }

  _drawSnout(ctx, cx, h, by) {
    const sy = h * 0.53 + by; // snout center y

    // Cream/white snout oval
    const snoutGrad = ctx.createRadialGradient(cx, sy - 4, 0, cx, sy, 26);
    snoutGrad.addColorStop(0, '#fff8ee');
    snoutGrad.addColorStop(0.7, '#f5e8d0');
    snoutGrad.addColorStop(1, '#e8c090');
    ctx.fillStyle = snoutGrad;
    ctx.beginPath();
    ctx.ellipse(cx, sy, 28, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose (large black with highlight)
    const ny = sy - 8;
    const noseGrad = ctx.createRadialGradient(cx - 3, ny - 3, 0, cx, ny, 9);
    noseGrad.addColorStop(0, '#2a2a2a');
    noseGrad.addColorStop(1, '#000');
    ctx.fillStyle = noseGrad;
    ctx.beginPath();
    ctx.ellipse(cx, ny, 11, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Nose highlight
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - 3, ny - 2, 4, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    this._drawMouth(ctx, cx, sy, by);
  }

  _drawMouth(ctx, cx, sy, by) {
    const my = sy + 8;
    const mo = this.mouthOpen;

    if (mo > 0.06) {
      // Open mouth – tongue visible
      ctx.fillStyle = '#9b1a40';
      ctx.beginPath();
      ctx.ellipse(cx, my + 4 * mo, 16, 10 * mo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tongue (pink)
      const tongue = ctx.createRadialGradient(cx, my + 8 * mo, 0, cx, my + 8 * mo, 10);
      tongue.addColorStop(0, '#ff9ab0');
      tongue.addColorStop(1, '#e06080');
      ctx.fillStyle = tongue;
      ctx.beginPath();
      ctx.ellipse(cx, my + 9 * mo, 10, 8 * mo, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tongue crease
      ctx.strokeStyle = '#d04060';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, my + 5 * mo);
      ctx.lineTo(cx, my + 14 * mo);
      ctx.stroke();

      // Upper lip
      ctx.fillStyle = '#e8c090';
      ctx.beginPath();
      ctx.moveTo(cx - 16, my);
      ctx.quadraticCurveTo(cx - 8, my - 5, cx, my - 3);
      ctx.quadraticCurveTo(cx + 8, my - 5, cx + 16, my);
      ctx.quadraticCurveTo(cx + 8, my + 2, cx, my + 1);
      ctx.quadraticCurveTo(cx - 8, my + 2, cx - 16, my);
      ctx.closePath();
      ctx.fill();
    } else {
      // Shiba smile (closed mouth with characteristic curve)
      ctx.strokeStyle = '#c05030';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      // Center vertical line
      ctx.beginPath();
      ctx.moveTo(cx, my - 3);
      ctx.lineTo(cx, my + 2);
      ctx.stroke();

      // Left curve (smile)
      ctx.beginPath();
      ctx.moveTo(cx - 1, my + 1);
      ctx.quadraticCurveTo(cx - 9, my + 2, cx - 15, my - 2);
      ctx.stroke();

      // Right curve (smile)
      ctx.beginPath();
      ctx.moveTo(cx + 1, my + 1);
      ctx.quadraticCurveTo(cx + 9, my + 2, cx + 15, my - 2);
      ctx.stroke();
    }
  }

  _drawGlow(ctx, cx, h, by) {
    if (this.state === 'idle') return;
    const colors = {
      listening: 'rgba(59,130,246,.35)',
      speaking:  'rgba(16,185,129,.35)',
      thinking:  'rgba(245,158,11,.35)',
    };
    const col = colors[this.state];
    if (!col) return;

    let r;
    if (this.state === 'speaking')  r = 72 + Math.abs(Math.sin(this.mouthPhase)) * 12;
    else if (this.state === 'thinking') r = 72 + Math.sin(this.frame * 0.08) * 8;
    else r = 72 + Math.sin(this.frame * 0.05) * 8;

    const g = ctx.createRadialGradient(cx, h * .46 + by, r * .4, cx, h * .46 + by, r + 22);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, col);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, h * .46 + by, r + 22, r + 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
