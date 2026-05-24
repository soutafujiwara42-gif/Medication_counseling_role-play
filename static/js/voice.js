'use strict';
/**
 * VoiceManager – Web Speech API wrapper with iOS Safari workarounds.
 *
 * iOS TTS restriction: speak() must be called from a synchronous user-gesture
 * context. After `await fetch()` we are no longer in that context.
 *
 * Fix: in the gesture handler call unlockAudio(), which queues a near-silent
 * primer utterance. That call IS in the gesture context, so iOS opens the
 * audio session. When the real speak() is called later (async), we simply
 * add to the queue WITHOUT cancelling – iOS allows queuing once the session
 * is open. The primer (rate=10, "あ") finishes in milliseconds.
 *
 * Other iOS quirks:
 *  - SpeechRecognition recreated each session (reuse causes double-end events)
 *  - 'aborted' STT error ignored (fires before onend when stop() is called)
 *  - Watchdog resumes paused synthesis every 250ms (iOS pauses on lock/bg)
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
    this._recognition = null;
    this._jaVoice    = null;
    this._ttsTimer   = null;
    this._primerPending = false; // true after unlockAudio(), cleared on speak()

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
      };
      pick();
      this.synth.onvoiceschanged = pick;
      setTimeout(pick, 500);
      setTimeout(pick, 2000);
    }
  }

  get available() { return !!this._SR; }

  // ── iOS audio session unlock ─────────────────────────────────────────────────
  // MUST be called synchronously inside a tap/click handler.
  // Queues a near-silent utterance to open the iOS audio session.
  unlockAudio() {
    if (!this.synth || !this.voiceOutput) return;
    const u = new SpeechSynthesisUtterance('あ');
    u.volume = 0.01;
    u.rate   = 10;
    u.lang   = 'ja-JP';
    this.synth.speak(u);
    this._primerPending = true;
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
      if (e.error === 'aborted') return; // iOS fires before onend on stop()
      console.warn('STT error:', e.error);
      this.isRecording = false;
      this._recognition = null;
      if (this._onEnd) this._onEnd();
    };
    return r;
  }

  startRecording() {
    if (!this._SR || this.isRecording) return;
    if (this.synth) this.synth.cancel();
    this._primerPending = false;
    this._recognition = this._buildRecognition();
    try {
      this._recognition.start();
    } catch (e) {
      console.warn('STT start:', e);
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
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };

      const queueUtterance = () => {
        if (settled) return;

        // Watchdog: iOS can silently pause synthesis
        this._ttsTimer = setInterval(() => {
          if (this.synth && this.synth.paused) this.synth.resume();
        }, 250);

        // Hard timeout failsafe
        setTimeout(done, Math.max(text.length * 120, 8000));

        const utt = new SpeechSynthesisUtterance(text);
        utt.lang   = 'ja-JP';
        utt.rate   = 1.05;
        utt.pitch  = 1.1;
        utt.volume = 1.0;
        if (this._jaVoice) utt.voice = this._jaVoice;

        if (this._onTTSStart) this._onTTSStart();
        utt.onend   = done;
        utt.onerror = (e) => { console.warn('TTS error:', e.error); done(); };
        this.synth.speak(utt);
      };

      if (this._primerPending) {
        // Audio session is open from unlockAudio() – queue directly without cancel.
        // The primer ("あ" at rate=10) is already done or finishing; our utterance
        // plays right after it in the queue.
        this._primerPending = false;
        queueUtterance();
      } else if (this.synth.speaking || this.synth.pending) {
        // Something else is playing – cancel it, then wait for iOS to settle
        this.synth.cancel();
        setTimeout(queueUtterance, 150);
      } else {
        queueUtterance();
      }
    });
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  stop() {
    this._clearTTSTimer();
    if (this.synth) this.synth.cancel();
    this._primerPending = false;
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
