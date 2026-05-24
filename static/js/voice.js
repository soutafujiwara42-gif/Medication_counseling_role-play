'use strict';
/**
 * VoiceManager
 * Handles Web Speech API for STT and TTS, with iOS Safari workarounds:
 *  - SpeechRecognition is recreated each session (iOS reuse causes double-end events)
 *  - TTS watchdog resumes paused synthesis every 250ms (iOS silently pauses on bg/lock)
 *  - Hard timeout resolves the speak() Promise if synthesis hangs
 *  - 'aborted' STT error is silently ignored (iOS fires it before onend on stop())
 */
class VoiceManager {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._SR   = SR || null;
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
      // iOS sometimes doesn't fire onvoiceschanged — retry
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
      // iOS fires 'aborted' before onend when stop() is called — ignore it
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
      console.warn('STT start error:', e);
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

      const sentences = text.match(/[^。！？\n]+[。！？\n]?/g) || [text];
      let idx = 0;
      let settled = false;

      const done = () => {
        if (settled) return;
        settled = true;
        this._cancelTTS();
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };

      // Watchdog: iOS can silently pause synthesis; resume every 250ms.
      // Also triggers done() if synthesis finishes without firing onend.
      this._ttsTimer = setInterval(() => {
        if (!this.synth) { done(); return; }
        if (this.synth.paused) this.synth.resume();
        if (!this.synth.speaking && !this.synth.pending) done();
      }, 250);

      // Hard timeout: give at most (chars * 120ms + 6s) before giving up
      const maxMs = Math.max(text.length * 120, 6000);
      setTimeout(done, maxMs);

      const speakNext = () => {
        if (settled || idx >= sentences.length) { done(); return; }

        const utt = new SpeechSynthesisUtterance(sentences[idx]);
        utt.lang   = 'ja-JP';
        utt.rate   = 1.05;
        utt.pitch  = 1.1;
        utt.volume = 1.0;
        if (this._jaVoice) utt.voice = this._jaVoice;

        if (idx === 0 && this._onTTSStart) this._onTTSStart();

        utt.onend   = () => { idx++; speakNext(); };
        utt.onerror = (e) => {
          console.warn('TTS sentence error:', e.error);
          idx++;
          speakNext();
        };
        this.synth.speak(utt);
      };
      speakNext();
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
