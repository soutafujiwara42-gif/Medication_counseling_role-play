'use strict';
/**
 * VoiceManager
 *
 * TTS: uses server-generated audio (edge-tts, returned as base64 MP3) played
 *      via an <audio> element. This bypasses iOS Safari's speechSynthesis
 *      restrictions entirely.
 *
 * STT: Web Speech API (webkitSpeechRecognition) with iOS workarounds:
 *  - Recreate recognition instance each session
 *  - Ignore 'aborted' error (fires before onend on stop())
 *
 * iOS <audio> unlock: call unlockAudio() synchronously inside a tap handler
 * to "prime" the audio element. After that, async play() calls work.
 */
class VoiceManager {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._SR  = SR || null;

    this.voiceInput  = true;
    this.voiceOutput = true;
    this.isRecording = false;
    this._recognition = null;

    // Single reusable <audio> element for TTS
    this._audio = new Audio();
    this._audio.preload = 'none';

    this._onResult   = null;
    this._onStart    = null;
    this._onEnd      = null;
    this._onTTSStart = null;
    this._onTTSEnd   = null;
  }

  get available() { return !!this._SR; }

  // ── iOS <audio> unlock ───────────────────────────────────────────────────────
  // MUST be called synchronously inside a tap/click handler.
  // Plays a 1-sample silent WAV to activate the audio element under iOS's
  // user-gesture policy. Subsequent async play() calls on the same element work.
  unlockAudio() {
    if (!this.voiceOutput) return;
    const SILENT_WAV = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
    this._audio.src = SILENT_WAV;
    this._audio.play().catch(() => {});
  }

  // ── STT ─────────────────────────────────────────────────────────────────────

  _buildRecognition() {
    const r = new this._SR();
    r.lang = 'ja-JP';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      if (this._onResult) this._onResult(e.results[0][0].transcript);
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
      console.warn('[Voice] STT error:', e.error);
      this.isRecording = false;
      this._recognition = null;
      if (this._onEnd) this._onEnd();
    };
    return r;
  }

  startRecording() {
    if (!this._SR || this.isRecording) return;
    this._audio.pause();
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

  // ── TTS (server-side audio) ──────────────────────────────────────────────────
  // base64Data: base64-encoded MP3 returned by /api/chat
  speakAudio(base64Data) {
    if (!base64Data || !this.voiceOutput) return Promise.resolve();

    return new Promise((resolve) => {
      const binary = atob(base64Data);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      const url  = URL.createObjectURL(blob);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };

      this._audio.onended  = cleanup;
      this._audio.onerror  = () => { console.warn('[Voice] audio error'); cleanup(); };
      this._audio.src = url;

      if (this._onTTSStart) this._onTTSStart();
      this._audio.play().catch((err) => {
        console.warn('[Voice] play() rejected:', err);
        cleanup();
      });
    });
  }

  // ── Misc ────────────────────────────────────────────────────────────────────

  stop() {
    this._audio.pause();
    this._audio.src = '';
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
