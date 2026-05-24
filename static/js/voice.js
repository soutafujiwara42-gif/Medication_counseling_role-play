'use strict';
/**
 * VoiceManager – Web Speech API wrapper with iOS Safari workarounds.
 *
 * iOS audio session rule: speak() called from an async context (after await fetch)
 * is silently blocked UNLESS the audio session is still "active" from a prior
 * user-gesture call. A 0.01-volume utterance of ~30s duration ("あ" × 80, rate=0.1)
 * is queued synchronously in the gesture handler. By the time the reply arrives,
 * the keep-alive is still running → session is active. We then cancel() and speak()
 * the real text (iOS reliably allows speak() when cancelling an active session).
 *
 * Other iOS quirks:
 *  - SpeechRecognition recreated each session (reuse causes double-end events)
 *  - 'aborted' STT error ignored (fires before onend when stop() is called)
 *  - Watchdog: resume() every 250ms in case iOS silently pauses synthesis
 *  - Hard timeout resolves speak() if onend never fires
 */
class VoiceManager {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._SR  = SR || null;
    this.synth = window.speechSynthesis;

    this.voiceInput  = true;
    this.voiceOutput = true;
    this.isRecording = false;
    this._recognition  = null;
    this._jaVoice      = null;
    this._ttsTimer     = null;
    this._keepAliveUtterance = null;

    this._onResult   = null;
    this._onStart    = null;
    this._onEnd      = null;
    this._onTTSStart = null;
    this._onTTSEnd   = null;

    if (this.synth) {
      const pick = () => {
        const vs = this.synth.getVoices();
        if (!vs.length) return;
        this._jaVoice =
          vs.find(v => v.lang === 'ja-JP' && /female|kyoko|haruka/i.test(v.name)) ||
          vs.find(v => v.lang === 'ja-JP') ||
          vs.find(v => v.lang.startsWith('ja')) ||
          null;
        console.log('[Voice] selected voice:', this._jaVoice ? this._jaVoice.name : 'none');
      };
      pick();
      this.synth.onvoiceschanged = pick;
      setTimeout(pick, 500);
      setTimeout(pick, 2000);
    }
  }

  get available() { return !!this._SR; }

  // ── iOS audio session keep-alive ─────────────────────────────────────────────
  // MUST be called synchronously inside a tap/click handler.
  // Speaks a ~30s near-silent utterance to hold the iOS audio session open
  // while the network request is in flight.
  unlockAudio() {
    if (!this.synth || !this.voiceOutput) return;
    // Do NOT call synth.cancel() before speak() – even in gesture context,
    // cancel() → speak() in the same call stack is rejected by iOS.
    const u = new SpeechSynthesisUtterance('あいうえおかきくけこさしすせそ'.repeat(6));
    u.volume = 0.01;
    u.rate   = 0.1;   // ~30 seconds – well beyond any network round-trip
    u.lang   = 'ja-JP';
    // Don't set a specific voice: a named voice that isn't fully loaded
    // can cause silent rejection on iOS.
    this._keepAliveUtterance = u;
    this.synth.speak(u);
    console.log('[Voice] keep-alive queued, speaking=', this.synth.speaking, 'pending=', this.synth.pending);
    setTimeout(() => console.log('[Voice] keep-alive +500ms: speaking=', this.synth.speaking, 'pending=', this.synth.pending), 500);
    setTimeout(() => console.log('[Voice] keep-alive +1500ms: speaking=', this.synth.speaking, 'pending=', this.synth.pending), 1500);
  }

  // ── STT ─────────────────────────────────────────────────────────────────────

  _buildRecognition() {
    const r = new this._SR();
    r.lang = 'ja-JP';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (this._onResult) this._onResult(text);
    };
    r.onstart = () => {
      this.isRecording = true;
      if (this._onStart) this._onStart();
    };
    r.onend = () => {
      this.isRecording = false;
      this._recognition = null;
      if (this._onEnd) this._onEnd();
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      console.warn('[Voice] STT error:', e.error);
      this.isRecording = false;
      this._recognition = null;
      if (this._onEnd) this._onEnd();
    };
    return r;
  }

  startRecording() {
    if (!this._SR || this.isRecording) return;
    if (this.synth) this.synth.cancel();
    this._keepAliveUtterance = null;
    this._recognition = this._buildRecognition();
    try {
      this._recognition.start();
    } catch (e) {
      console.warn('[Voice] STT start:', e);
      this._recognition = null;
    }
  }

  stopRecording() {
    if (!this._recognition || !this.isRecording) return;
    try { this._recognition.stop(); } catch (e) { console.warn(e); }
  }

  // ── TTS ─────────────────────────────────────────────────────────────────────

  _clearTTSTimer() {
    if (this._ttsTimer) { clearInterval(this._ttsTimer); this._ttsTimer = null; }
  }

  speak(text) {
    if (!this.synth || !this.voiceOutput) return Promise.resolve();

    return new Promise((resolve) => {
      this._clearTTSTimer();
      let settled = false;

      const done = () => {
        if (settled) return;
        settled = true;
        this._clearTTSTimer();
        console.log('[Voice] TTS done');
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };

      const startUtterance = () => {
        if (settled) return;
        console.log('[Voice] speak() starting utterance, speaking=', this.synth.speaking, 'pending=', this.synth.pending);

        this._ttsTimer = setInterval(() => {
          console.log('[Voice] wd: speaking=', this.synth.speaking, 'paused=', this.synth.paused, 'pending=', this.synth.pending);
          if (this.synth && this.synth.paused) {
            console.log('[Voice] watchdog: resuming');
            this.synth.resume();
          }
        }, 1000);

        setTimeout(done, Math.max(text.length * 120, 8000));

        const utt = new SpeechSynthesisUtterance(text);
        utt.lang   = 'ja-JP';
        utt.rate   = 1.05;
        utt.pitch  = 1.1;
        utt.volume = 1.0;
        if (this._jaVoice) utt.voice = this._jaVoice;

        utt.onstart = () => console.log('[Voice] utterance started');
        if (this._onTTSStart) this._onTTSStart();
        utt.onend   = done;
        utt.onerror = (e) => { console.warn('[Voice] utterance error:', e.error); done(); };
        this.synth.speak(utt);
      };

      if (this._keepAliveUtterance) {
        console.log('[Voice] cancel keep-alive: speaking=', this.synth.speaking, 'pending=', this.synth.pending);
        this._keepAliveUtterance = null;
        if (this.synth.speaking || this.synth.pending) {
          // Session is active – safe to cancel then speak
          this.synth.cancel();
          setTimeout(startUtterance, 150);
        } else {
          // Keep-alive never started (iOS rejected it) – try speaking directly
          console.log('[Voice] keep-alive was idle, calling speak() directly');
          startUtterance();
        }
      } else if (this.synth.speaking || this.synth.pending) {
        this.synth.cancel();
        setTimeout(startUtterance, 150);
      } else {
        startUtterance();
      }
    });
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  stop() {
    this._clearTTSTimer();
    if (this.synth) this.synth.cancel();
    this._keepAliveUtterance = null;
    this.stopRecording();
  }

  on(event, fn) {
    switch (event) {
      case 'result':   this._onResult   = fn; break;
      case 'start':    this._onStart    = fn; break;
      case 'end':      this._onEnd      = fn; break;
      case 'ttsStart': this._onTTSStart = fn; break;
      case 'ttsEnd':   this._onTTSEnd   = fn; break;
    }
  }
}
