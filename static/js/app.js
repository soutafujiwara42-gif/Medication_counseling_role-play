'use strict';

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  personality: 'talkative',
  prescription: [],
  history: [],
  loading: false,
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const msgContainer  = $('chat-messages');
const msgInput      = $('msg-input');
const sendBtn       = $('send-btn');
const voiceBtn      = $('voice-btn');
const drugSearchIn  = $('drug-search-input');
const drugResults   = $('drug-search-results');
const prescList     = $('prescription-list');
const prescEmpty    = $('prescription-empty');
const modelBadge    = $('model-name');
const avatarStatus  = $('avatar-status-text');
const avatarRing    = $('avatar-status-ring');
const personalityDisp = $('personality-display');
const voiceOutToggle  = $('voice-out-toggle');
const voiceInToggle   = $('voice-in-toggle');

// ── Subsystems ──────────────────────────────────────────────────────────────
const voice  = new VoiceManager();
const avatar = new PatientAvatar('avatar-canvas');

// ── Init ────────────────────────────────────────────────────────────────────
async function init() {
  // Load model info
  try {
    const r = await fetch('/api/model');
    const d = await r.json();
    modelBadge.textContent = d.model;
  } catch { modelBadge.textContent = 'claude-sonnet-4-6'; }

  // Personality buttons
  document.querySelectorAll('.personality-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPersonality(btn.dataset.personality));
  });

  // Voice toggles
  voiceOutToggle.addEventListener('click', () => {
    voice.voiceOutput = !voice.voiceOutput;
    voiceOutToggle.classList.toggle('on', voice.voiceOutput);
  });
  voiceInToggle.addEventListener('click', () => {
    voice.voiceInput = !voice.voiceInput;
    voiceInToggle.classList.toggle('on', voice.voiceInput);
    if (!voice.voiceInput) voice.stopRecording();
  });
  voiceOutToggle.classList.add('on');
  voiceInToggle.classList.add('on');
  if (!voice.available) {
    voiceBtn.disabled = true;
    voiceBtn.title = '音声認識はこのブラウザでサポートされていません';
    voiceInToggle.classList.remove('on');
    voice.voiceInput = false;
  }

  // Voice events
  voice.on('start',    () => { voiceBtn.classList.add('recording'); setAvatarState('listening'); });
  voice.on('end',      () => { voiceBtn.classList.remove('recording'); setAvatarState('idle'); });
  voice.on('result',   (text) => { msgInput.value = text; sendMessage(); });
  voice.on('ttsStart', () => setAvatarState('speaking'));
  voice.on('ttsEnd',   () => setAvatarState('idle'));

  // Drug search
  let debounce;
  drugSearchIn.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = drugSearchIn.value.trim();
    if (!q) { drugResults.classList.remove('visible'); drugResults.innerHTML = ''; return; }
    debounce = setTimeout(() => searchDrugs(q), 300);
  });

  drugSearchIn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { drugResults.classList.remove('visible'); }
  });

  document.addEventListener('click', (e) => {
    if (!drugSearchIn.contains(e.target) && !drugResults.contains(e.target)) {
      drugResults.classList.remove('visible');
    }
  });

  // Chat input
  msgInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);
  voiceBtn.addEventListener('click', () => {
    if (voice.isRecording) { voice.stopRecording(); }
    else { voice.startRecording(); }
  });

  $('reset-btn').addEventListener('click', resetSession);

  // Initial greeting
  addSystemMessage('処方薬を登録してから、服薬指導を開始してください。');
  selectPersonality('talkative');
}

// ── Personality ─────────────────────────────────────────────────────────────
const PERSONALITY_LABELS = {
  talkative: '話好き',
  quiet:     '無口',
  proxy:     '代理',
};

function selectPersonality(p) {
  state.personality = p;
  document.querySelectorAll('.personality-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.personality === p);
  });
  personalityDisp.textContent = PERSONALITY_LABELS[p] || p;
  resetSession(false);
}

// ── Drug Search ─────────────────────────────────────────────────────────────
async function searchDrugs(q) {
  try {
    const r = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    renderDrugResults(d.results);
  } catch {
    drugResults.innerHTML = '<div class="drug-result-item"><span class="drug-result-name">検索エラー</span></div>';
    drugResults.classList.add('visible');
  }
}

function renderDrugResults(results) {
  if (!results.length) {
    drugResults.innerHTML = '<div class="drug-result-item"><span class="drug-result-name" style="color:#94a3b8">見つかりませんでした</span></div>';
    drugResults.classList.add('visible');
    return;
  }
  drugResults.innerHTML = results.map(d => `
    <div class="drug-result-item" data-name="${escHtml(d.name)}">
      <div class="drug-result-name">${escHtml(d.name)}</div>
      <div class="drug-result-sub">${escHtml(d.ingredient)} ${escHtml(d.dosage)} 薬価:${escHtml(d.price)}円</div>
    </div>
  `).join('');
  drugResults.classList.add('visible');

  drugResults.querySelectorAll('.drug-result-item').forEach(el => {
    el.addEventListener('click', () => {
      addPrescription(el.dataset.name);
      drugResults.classList.remove('visible');
      drugSearchIn.value = '';
    });
  });
}

function addPrescription(name) {
  if (!name || state.prescription.includes(name)) return;
  state.prescription.push(name);
  renderPrescription();
}

function removePrescription(name) {
  state.prescription = state.prescription.filter(n => n !== name);
  renderPrescription();
}

function renderPrescription() {
  prescList.innerHTML = '';
  if (!state.prescription.length) {
    prescEmpty.style.display = '';
    return;
  }
  prescEmpty.style.display = 'none';
  state.prescription.forEach(name => {
    const el = document.createElement('div');
    el.className = 'prescription-item';
    el.innerHTML = `
      <span class="drug-name">${escHtml(name)}</span>
      <button class="remove-btn" title="削除">×</button>
    `;
    el.querySelector('.remove-btn').addEventListener('click', () => removePrescription(name));
    prescList.appendChild(el);
  });
}

// ── Chat ────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || state.loading) return;

  msgInput.value = '';
  addMessage('pharmacist', text);
  state.loading = true;
  sendBtn.disabled = true;

  // Thinking indicator
  const typingEl = addTypingIndicator();
  setAvatarState('thinking');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        prescription: state.prescription,
        personality: state.personality,
        history: state.history.slice(-16), // last 8 turns
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const reply = data.reply;

    typingEl.remove();

    // Add to history
    state.history.push({ role: 'user',      content: text });
    state.history.push({ role: 'assistant', content: reply });

    addMessage('patient', reply);

    // TTS
    if (voice.voiceOutput) {
      await voice.speak(reply);
    } else {
      setAvatarState('idle');
    }
  } catch (err) {
    typingEl.remove();
    addSystemMessage(`エラーが発生しました: ${err.message}`);
    setAvatarState('idle');
  } finally {
    state.loading = false;
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

// ── UI helpers ──────────────────────────────────────────────────────────────
function addMessage(role, text) {
  const isPharmacist = role === 'pharmacist';
  const el = document.createElement('div');
  el.className = `msg ${role}`;

  const icon = isPharmacist ? '👨‍⚕️' : '🧑';
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  el.innerHTML = `
    <div class="msg-avatar-icon">${icon}</div>
    <div>
      <div class="msg-bubble">${escHtml(text)}</div>
      <div class="msg-time">${time}</div>
    </div>
  `;
  msgContainer.appendChild(el);
  scrollToBottom();
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'msg patient';
  el.innerHTML = `
    <div class="msg-avatar-icon">🧑</div>
    <div class="msg-bubble patient">
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  msgContainer.appendChild(el);
  scrollToBottom();
  return el;
}

function addSystemMessage(text) {
  const el = document.createElement('div');
  el.className = 'msg-system';
  el.textContent = text;
  msgContainer.appendChild(el);
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => { msgContainer.scrollTop = msgContainer.scrollHeight; });
}

function setAvatarState(s) {
  avatar.setState(s);
  avatarRing.className = `${s}`;
  avatarRing.id = 'avatar-status-ring';
  const labels = { idle: '待機中', listening: '聞いています…', speaking: '話しています…', thinking: '考え中…' };
  avatarStatus.textContent = labels[s] || s;
}

function resetSession(addMsg = true) {
  state.history = [];
  voice.stop();
  setAvatarState('idle');
  if (addMsg) {
    msgContainer.innerHTML = '';
    addSystemMessage(`性格を「${PERSONALITY_LABELS[state.personality]}」に変更しました。会話をリセットしました。`);
  }
}

function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
