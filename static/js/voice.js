/**
 * VoiceManager
 * Handles browser Web Speech API for STT (input) and TTS (output).
 */
class VoiceManager {
  constructor() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = SpeechRecognition ? new SpeechRecognition() : null;
    this.synth = window.speechSynthesis;

    this.voiceInput = true;
    this.voiceOutput = true;
    this.isRecording = false;
    this._jaVoice = null;

    this._onResult = null;   // callback(text)
    this._onStart  = null;   // callback()
    this._onEnd    = null;   // callback()
    this._onTTSStart = null; // callback()
    this._onTTSEnd   = null; // callback()

    if (this.recognition) {
      this.recognition.lang = 'ja-JP';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (this._onResult) this._onResult(text);
      };
      this.recognition.onstart = () => {
        this.isRecording = true;
        if (this._onStart) this._onStart();
      };
      this.recognition.onend = () => {
        this.isRecording = false;
        if (this._onEnd) this._onEnd();
      };
      this.recognition.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        this.isRecording = false;
        if (this._onEnd) this._onEnd();
      };
    }

    // Pre-select Japanese voice
    if (this.synth) {
      const selectVoice = () => {
        const voices = this.synth.getVoices();
        // Priority: female Japanese voice → any Japanese voice
        this._jaVoice =
          voices.find(v => v.lang === 'ja-JP' && /female|kyoko|haruka/i.test(v.name)) ||
          voices.find(v => v.lang === 'ja-JP') ||
          voices.find(v => v.lang.startsWith('ja')) ||
          null;
      };
      selectVoice();
      this.synth.onvoiceschanged = selectVoice;
    }
  }

  get available() { return !!this.recognition; }

  startRecording() {
    if (!this.recognition || this.isRecording) return;
    this.synth.cancel(); // stop any ongoing TTS
    try { this.recognition.start(); } catch (e) { console.warn(e); }
  }

  stopRecording() {
    if (!this.recognition || !this.isRecording) return;
    try { this.recognition.stop(); } catch (e) { console.warn(e); }
  }

  speak(text) {
    if (!this.synth || !this.voiceOutput) return Promise.resolve();

    return new Promise((resolve) => {
      this.synth.cancel();

      // Split long text into sentences for smoother playback
      const sentences = text.match(/[^。！？\n]+[。！？\n]?/g) || [text];

      let idx = 0;
      const speakNext = () => {
        if (idx >= sentences.length) {
          if (this._onTTSEnd) this._onTTSEnd();
          resolve();
          return;
        }
        const utt = new SpeechSynthesisUtterance(sentences[idx]);
        utt.lang = 'ja-JP';
        utt.rate = 1.05;
        utt.pitch = 1.1;
        utt.volume = 1.0;
        if (this._jaVoice) utt.voice = this._jaVoice;

        if (idx === 0 && this._onTTSStart) this._onTTSStart();

        utt.onend = () => { idx++; speakNext(); };
        utt.onerror = () => { idx++; speakNext(); };
        this.synth.speak(utt);
      };
      speakNext();
    });
  }

  stop() {
    if (this.synth) this.synth.cancel();
    this.stopRecording();
  }

  on(event, fn) {
    switch (event) {
      case 'result':   this._onResult = fn; break;
      case 'start':    this._onStart  = fn; break;
      case 'end':      this._onEnd    = fn; break;
      case 'ttsStart': this._onTTSStart = fn; break;
      case 'ttsEnd':   this._onTTSEnd   = fn; break;
    }
  }
}
