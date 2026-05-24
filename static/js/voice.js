'use strict';
/**
 * VoiceManager – Web Speech API wrapper with iOS Safari fixes.
 *
 * iOS quirks addressed:
 *  - SpeechRecognition recreated each session (reuse causes double-end events)
 *  - 'aborted' STT error ignored (iOS fires it before onend on stop())
 *  - TTS watchdog calls synth.resume() every 250ms (iOS silently pauses on bg/lock)
 *  - Hard timeout resolves speak() if onend never fires
 *  - No sentence splitting: single utterance avoids inter-chunk gaps that
 *    triggered false watchdog "done" between chunks
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
      // iOS sometimes doesn't fire onvoiceschanged – retry
      setTimeout(pick, 500);
      setTimeout(pick, 2000);
    }
  }

  get available() { return !!this._SR; }

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
      // iOS fires 'aborted' before onend when stop() is called – ignore
      if (e.error === 'aborted') return;
      console.warn('STT error:', e.error);
      this.isRecording = false;
      this._recognition = null;
      if (this._onEnd) this._onEnd();
    };
    return r;
  }

  startRecording() {
    if (!this._SR || this.isRecording) return;
    this._cancelTTS();
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

  _cancelTTS() {
    if (this._ttsTimer) { clearInterval(this._ttsTimer); this._ttsTimer = null; }
    if (this.synth)     this.synth.cancel();
  }

  speak(text) {
    if (!this.synth || !this.voiceOutput) return Promise.resolve();

    return new Promise((resolve) => {
      this._cancelTTS();
      let settled = false;

      const done = () => {
        if (settled) return;
        settled = true;
        this._cancelTTS();
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };

      // Watchdog: iOS can silently pause synthesis – resume every 250ms.
      // Does NOT call done() to avoid false-positive between chunks.
      this._ttsTimer = setInterval(() => {
        if (this.synth && this.synth.paused) this.synth.resume();
      }, 250);

      // Hard timeout: chars × 120ms + 8s buffer
      setTimeout(done, Math.max(text.length * 120, 8000));

      // Speak the full text as a single utterance to avoid inter-chunk gaps
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
    });
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  stop() {
    this._cancelTTS();
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
