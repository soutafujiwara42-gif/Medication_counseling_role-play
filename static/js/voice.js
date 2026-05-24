'use strict';
/**
 * VoiceManager
 *
 * TTS: AudioContext (Web Audio API) で MP3 を再生。
 *      <audio>.play() は src 変更のたびに iOS のアクティベーションが失効するが、
 *      AudioContext はジェスチャーで一度 resume() すれば非同期から永続的に使える。
 *
 * STT: Web Speech API (webkitSpeechRecognition)
 *      iOS quirks: インスタンス再生成・'aborted' エラー無視
 */
class VoiceManager {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this._SR  = SR || null;

    this.voiceInput  = true;
    this.voiceOutput = true;
    this.isRecording = false;
    this._recognition   = null;
    this._audioCtx      = null;
    this._currentSource = null;

    this._onResult   = null;
    this._onStart    = null;
    this._onEnd      = null;
    this._onTTSStart = null;
    this._onTTSEnd   = null;
  }

  get available() { return !!this._SR; }

  // ── AudioContext unlock (ジェスチャーハンドラ内で呼ぶ) ─────────────────────
  unlockAudio() {
    if (!this.voiceOutput) return;
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // suspended 状態ならジェスチャーコンテキスト内で resume
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }
  }

  // ── STT ────────────────────────────────────────────────────────────────────

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
    this._stopCurrentSource();
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

  // ── TTS (AudioContext で base64 MP3 を再生) ─────────────────────────────────

  _stopCurrentSource() {
    if (this._currentSource) {
      try { this._currentSource.stop(); } catch (_) {}
      this._currentSource = null;
    }
  }

  async speakAudio(base64Data) {
    if (!base64Data || !this.voiceOutput) return;

    // AudioContext が未初期化なら作る（既に resume 済みなら再利用）
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._audioCtx.state === 'suspended') {
      await this._audioCtx.resume();
    }

    // base64 → ArrayBuffer
    const binary = atob(base64Data);
    const buf    = new ArrayBuffer(binary.length);
    const view   = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

    let audioBuffer;
    try {
      audioBuffer = await this._audioCtx.decodeAudioData(buf);
    } catch (err) {
      console.warn('[Voice] decodeAudioData error:', err);
      if (this._onTTSEnd) this._onTTSEnd();
      return;
    }

    this._stopCurrentSource();

    return new Promise((resolve) => {
      const gain = this._audioCtx.createGain();
      gain.gain.value = 2.5;          // amplify edge-tts output for iOS

      const source = this._audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);
      gain.connect(this._audioCtx.destination);
      this._currentSource = source;

      if (this._onTTSStart) this._onTTSStart();

      source.onended = () => {
        this._currentSource = null;
        if (this._onTTSEnd) this._onTTSEnd();
        resolve();
      };
      source.start(0);
    });
  }

  // ── Misc ───────────────────────────────────────────────────────────────────

  stop() {
    this._stopCurrentSource();
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
