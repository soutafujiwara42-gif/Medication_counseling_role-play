'use strict';

// ── State ───────────────────────────────────────────────────────────────────
const state = {
  personality: 'talkative',
  prescription: [],
  history: [],
  loading: false,
  patientBackground: {
    age: '', gender: '', chief_complaint: '',
    medical_history: '', allergies: '', notes: ''
  },
};

// ── DOM refs ────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const msgContainer    = $('chat-messages');
const msgInput        = $('msg-input');
const sendBtn         = $('send-btn');
const voiceBtn        = $('voice-btn');
const drugSearchIn    = $('drug-search-input');
const drugResults     = $('drug-search-results');
const prescList       = $('prescription-list');
const prescEmpty      = $('prescription-empty');
const modelBadge      = $('model-name');
const avatarStatus    = $('avatar-status-text');
const avatarRing      = $('avatar-status-ring');
const personalityDisp = $('personality-display');
const voiceOutToggle  = $('voice-out-toggle');
const voiceInToggle   = $('voice-in-toggle');

// Patient background inputs
const bgAge       = $('bg-age');
const bgGender    = $('bg-gender');
const bgComplaint = $('bg-complaint');
const bgHistory   = $('bg-history');
const bgAllergies = $('bg-allergies');
const bgNotes     = $('bg-notes');

// Preset inputs
const presetSelect = $('preset-select');
const presetName   = $('preset-name-input');

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
    voiceInToggle.classList.remove('on');
    voice.voiceInput = false;
  }

  // Voice events
  voice.on('start',    () => { voiceBtn.classList.add('recording'); setAvatarState('listening'); });
  voice.on('end',      () => { voiceBtn.classList.remove('recording'); setAvatarState('idle'); });
  voice.on('result',   text => { msgInput.value = text; sendMessage(); });
  voice.on('ttsStart', () => setAvatarState('speaking'));
  voice.on('ttsEnd',   () => setAvatarState('idle'));

  // Patient background – sync to state
  const bgFields = [
    [bgAge,       'age'],
    [bgGender,    'gender'],
    [bgComplaint, 'chief_complaint'],
    [bgHistory,   'medical_history'],
    [bgAllergies, 'allergies'],
    [bgNotes,     'notes'],
  ];
  bgFields.forEach(([el, key]) => {
    el.addEventListener('input', () => { state.patientBackground[key] = el.value.trim(); });
    el.addEventListener('change', () => { state.patientBackground[key] = el.value.trim(); });
  });

  // Patient background collapse
  $('bg-collapse-btn').addEventListener('click', () => {
    const form = $('patient-bg-form');
    const collapsed = form.classList.toggle('collapsed');
    $('bg-collapse-btn').textContent = collapsed ? '▼' : '▲';
  });

  // Drug search
  let debounce;
  drugSearchIn.addEventListener('input', () => {
    clearTimeout(debounce);
    const q = drugSearchIn.value.trim();
    if (!q) { drugResults.classList.remove('visible'); drugResults.innerHTML = ''; return; }
    debounce = setTimeout(() => searchDrugs(q), 300);
  });
  drugSearchIn.addEventListener('keydown', e => {
    if (e.key === 'Escape') drugResults.classList.remove('visible');
  });
  document.addEventListener('click', e => {
    if (!drugSearchIn.contains(e.target) && !drugResults.contains(e.target))
      drugResults.classList.remove('visible');
  });

  // Chat input
  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  sendBtn.addEventListener('click', sendMessage);
  voiceBtn.addEventListener('click', () => {
    if (voice.isRecording) voice.stopRecording();
    else voice.startRecording();
  });
  $('reset-btn').addEventListener('click', () => resetSession(true));

  // Preset buttons
  $('preset-save-btn').addEventListener('click', savePreset);
  $('preset-load-btn').addEventListener('click', loadPreset);
  $('preset-delete-btn').addEventListener('click', deletePreset);

  loadPresetList();
  addSystemMessage('処方薬と患者背景を設定してから、服薬指導を開始してください。');
  selectPersonality('talkative');
}

// ── Personality ─────────────────────────────────────────────────────────────
const PERSONALITY_LABELS = { talkative: '話好き', quiet: '無口', proxy: '代理' };

function selectPersonality(p) {
  state.personality = p;
  document.querySelectorAll('.personality-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.personality === p));
  personalityDisp.textContent = PERSONALITY_LABELS[p] || p;
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
    </div>`).join('');
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
  if (!state.prescription.length) { prescEmpty.style.display = ''; return; }
  prescEmpty.style.display = 'none';
  state.prescription.forEach(name => {
    const el = document.createElement('div');
    el.className = 'prescription-item';
    el.innerHTML = `<span class="drug-name">${escHtml(name)}</span>
      <button class="remove-btn" title="削除">×</button>`;
    el.querySelector('.remove-btn').addEventListener('click', () => removePrescription(name));
    prescList.appendChild(el);
  });
}

// ── Preset ──────────────────────────────────────────────────────────────────
const PRESET_KEY = 'yakuzaishi_presets_v1';

function getPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch { return {}; }
}

function savePresets(obj) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(obj));
}

function loadPresetList() {
  const presets = getPresets();
  presetSelect.innerHTML = '<option value="">── プリセットを選択 ──</option>';
  Object.keys(presets).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    presetSelect.appendChild(opt);
  });
}

function savePreset() {
  const name = presetName.value.trim();
  if (!name) { alert('プリセット名を入力してください'); return; }
  const presets = getPresets();
  presets[name] = {
    personality: state.personality,
    prescription: [...state.prescription],
    patientBackground: { ...state.patientBackground },
  };
  savePresets(presets);
  loadPresetList();
  presetSelect.value = name;
  presetName.value = '';
  addSystemMessage(`プリセット「${name}」を保存しました。`);
}

function loadPreset() {
  const name = presetSelect.value;
  if (!name) { alert('プリセットを選択してください'); return; }
  const presets = getPresets();
  const p = presets[name];
  if (!p) return;

  // Apply personality
  selectPersonality(p.personality || 'talkative');

  // Apply prescription
  state.prescription = p.prescription ? [...p.prescription] : [];
  renderPrescription();

  // Apply patient background
  const bg = p.patientBackground || {};
  state.patientBackground = { ...bg };
  bgAge.value       = bg.age             || '';
  bgGender.value    = bg.gender          || '';
  bgComplaint.value = bg.chief_complaint || '';
  bgHistory.value   = bg.medical_history || '';
  bgAllergies.value = bg.allergies       || '';
  bgNotes.value     = bg.notes           || '';

  resetSession(false);
  addSystemMessage(`プリセット「${name}」を読み込みました。`);
}

function deletePreset() {
  const name = presetSelect.value;
  if (!name) { alert('削除するプリセットを選択してください'); return; }
  if (!confirm(`プリセット「${name}」を削除しますか？`)) return;
  const presets = getPresets();
  delete presets[name];
  savePresets(presets);
  loadPresetList();
  addSystemMessage(`プリセット「${name}」を削除しました。`);
}

// ── Chat ────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text || state.loading) return;
  msgInput.value = '';
  addMessage('pharmacist', text);
  state.loading = true;
  sendBtn.disabled = true;
  const typingEl = addTypingIndicator();
  setAvatarState('thinking');

  // iOS Safari requires speechSynthesis to be called from a user-gesture context.
  // Speak a silent utterance here (we are still inside the tap/click handler)
  // to unlock the audio session before the async fetch completes.
  if (voice.synth && voice.voiceOutput) {
    const unlock = new SpeechSynthesisUtterance(' ');
    unlock.volume = 0; unlock.rate = 10;
    voice.synth.speak(unlock);
  }

  let autoListen = false;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        prescription: state.prescription,
        personality: state.personality,
        history: state.history.slice(-16),
        patient_background: state.patientBackground,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const reply = data.reply;
    typingEl.remove();
    state.history.push({ role: 'user',      content: text });
    state.history.push({ role: 'assistant', content: reply });
    addMessage('patient', reply);
    if (voice.voiceOutput) await voice.speak(reply);
    else setAvatarState('idle');
    // Auto-restart mic after response if voice input is enabled
    autoListen = voice.voiceInput && voice.available;
  } catch (err) {
    typingEl.remove();
    addSystemMessage(`エラーが発生しました: ${err.message}`);
    setAvatarState('idle');
  } finally {
    state.loading = false;
    sendBtn.disabled = false;
    if (!autoListen) msgInput.focus();
  }
  if (autoListen) {
    // Small delay so iOS audio session fully closes before reopening mic
    setTimeout(() => voice.startRecording(), 400);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────────────
function addMessage(role, text) {
  const isPharmacist = role === 'pharmacist';
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const icon = isPharmacist ? '👨‍⚕️' : '🐕';
  const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `
    <div class="msg-avatar-icon">${icon}</div>
    <div>
      <div class="msg-bubble">${escHtml(text)}</div>
      <div class="msg-time">${time}</div>
    </div>`;
  msgContainer.appendChild(el);
  scrollToBottom();
}

function addTypingIndicator() {
  const el = document.createElement('div');
  el.className = 'msg patient';
  el.innerHTML = `<div class="msg-avatar-icon">🐕</div>
    <div class="msg-bubble patient"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
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
  avatarRing.className = s;
  avatarRing.id = 'avatar-status-ring';
  const labels = { idle: '待機中', listening: '聞いています…', speaking: '話しています…', thinking: '考え中…' };
  avatarStatus.textContent = labels[s] || s;
}

function resetSession(showMsg = true) {
  state.history = [];
  voice.stop();
  setAvatarState('idle');
  if (showMsg) {
    msgContainer.innerHTML = '';
    addSystemMessage(`会話をリセットしました（性格: ${PERSONALITY_LABELS[state.personality]}）`);
  }
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Boot ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
