// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const API_BASE = 'https://orderfulfillmentapp-580236127675.northamerica-northeast2.run.app';

// ──────────────────────────────────────────────
// DOM ELEMENTS
// ──────────────────────────────────────────────
const els = {
  cameraContainer: document.getElementById('cameraContainer'),
  video: document.getElementById('video'),
  btnStartCam: document.getElementById('btnStartCam'),
  btnStopCam: document.getElementById('btnStopCam'),

  formIdInput: document.getElementById('formIdInput'),
  btnLookup: document.getElementById('btnLookup'),

  resultSection: document.getElementById('result-section'),
  orderSummary: document.getElementById('orderSummary'),

  labelPrompt: document.getElementById('labelPrompt'),
  labelCount: document.getElementById('labelCount'),
  btnContinue: document.getElementById('btnContinue'),
  btnGenerate: document.getElementById('btnGenerate'),

  puppyKittenAlert: document.getElementById('puppyKittenAlert'),
  chkFleaRequested: document.getElementById('chkFleaRequested'),
  chkFleaProvided: document.getElementById('chkFleaProvided'),

  confirmModal: document.getElementById('confirmModal'),

  activitySection: document.getElementById('activity-section'),
  activity: document.getElementById('activity'),
  btnClear: document.getElementById('btnClear'),
};

// ──────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────
let mediaStream = null;
let scanLoop = null;
let lastDetected = '';
let currentOrder = null;

// ──────────────────────────────────────────────
// UTILITIES
// ──────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function scrollIntoView(el) { el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function sanitizeFormId(s) { return String(s || '').replace(/\D+/g, '').slice(0, 12); }
function setVisible(el, visible) { el.hidden = !visible; if (visible) scrollIntoView(el); }

function logLine(kind, msg) {
  const line = document.createElement('div');
  line.className = `line ${kind || ''}`;
  line.innerHTML = `<span class="dot"></span><span>${msg}</span>`;
  els.activity.appendChild(line);
}

// ──────────────────────────────────────────────
// LOOKUP LOGIC
// ──────────────────────────────────────────────
async function lookup(formId) {
  logLine('', `Looking up order ${formId}…`);
  const res = await fetch(`${API_BASE}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formId })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lookup failed');
  return data.data || data;
}

function renderSummary(data) {
  const { formId, firstName, lastName, pickupWindow } = data;
  els.orderSummary.innerHTML = `
    <div class="kv"><div class="k">Form ID</div><div>${formId}</div></div>
    <div class="kv"><div class="k">Client</div><div>${firstName || ''} ${lastName || ''}</div></div>
    <div class="kv"><div class="k">Pickup Window</div><div>${pickupWindow || '—'}</div></div>
  `;
}

// ──────────────────────────────────────────────
// CAMERA + BARCODE
// ──────────────────────────────────────────────
async function startCamera() {
  if (!('BarcodeDetector' in window)) {
    alert('BarcodeDetector not supported on this device. Use manual entry.');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    els.video.srcObject = mediaStream;
    els.cameraContainer.hidden = false;
    els.btnStartCam.hidden = true;
    await els.video.play();

    const detector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'upc_a', 'upc_e'] });

    scanLoop = (async function loop() {
      if (!mediaStream) return;
      try {
        const codes = await detector.detect(els.video);
        if (codes?.length) {
          const raw = codes[0].rawValue || '';
          const digits = sanitizeFormId(raw);
          if (digits.length === 12 && digits !== lastDetected) {
            lastDetected = digits;
            stopCamera();
            els.formIdInput.value = digits;
            await handleLookup();
            return;
          }
        }
      } catch { /* ignore single-frame errors */ }
      requestAnimationFrame(loop);
    })();

  } catch (err) {
    console.error('Camera error:', err);
    alert('Camera unavailable. Please use manual entry.');
  }
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  els.cameraContainer.hidden = true;
  els.btnStartCam.hidden = false;
  lastDetected = '';
}

// ──────────────────────────────────────────────
// FLOW CONTROL
// ──────────────────────────────────────────────
async function handleLookup() {
  try {
    const formId = sanitizeFormId(els.formIdInput.value);
    if (formId.length !== 12) return alert('Form ID must be 12 digits.');

    els.activity.innerHTML = '';
    setVisible(els.activitySection, true);
    logLine('', 'Starting lookup…');

    const data = await lookup(formId);
    currentOrder = data;
    renderSummary(data);
    setVisible(els.resultSection, true);

    // Puppy/Kitten alert
    const alerts = data.alerts || [];
    const hasPuppyKitten = alerts.some(a => /puppy|kitten/i.test(a));
    els.puppyKittenAlert.hidden = !hasPuppyKitten;

    // Flea/tick checkboxes
    const services = data.additionalServices || [];
    const fleaRequested = services.some(s => /flea/i.test(s));
    els.chkFleaRequested.checked = fleaRequested;
    els.chkFleaProvided.checked = false;

    // Show label count step
    setVisible(els.labelPrompt, true);
    scrollIntoView(els.labelPrompt);
    logLine('ok', 'Lookup complete.');
  } catch (err) {
    console.error(err);
    logLine('err', `Lookup failed: ${err.message}`);
    alert(err.message);
  }
}

async function handleContinue() {
  const count = Number(els.labelCount.value || 0);
  if (!(count >= 1 && count <= 5)) return alert('Please select between 1 and 5 labels.');
  const data = currentOrder || {};

  // Puppy/Kitten reminder
  const alerts = data.alerts || [];
  const hasPuppyKitten = alerts.some(a => /puppy|kitten/i.test(a));
  if (hasPuppyKitten && !confirm('Reminder: Young animals may require extra nutrition guidance. Continue?')) return;

  // Flea/tick reminder
  const fleaNeeded = els.chkFleaRequested.checked && !els.chkFleaProvided.checked;
  if (fleaNeeded && !confirm('Flea/tick requested but not marked as provided. Continue anyway?')) return;

  await openConfirmModal(count);
}

// ──────────────────────────────────────────────
// MODAL + LABEL GENERATION
// ──────────────────────────────────────────────
function openConfirmModal(count) {
  return new Promise((resolve) => {
    els.confirmModal.querySelector('.modal-text').textContent =
      `Printing ${count} label(s) will also notify the client. Proceed?`;

    const onClose = () => {
      els.confirmModal.removeEventListener('close', onClose);
      if (els.confirmModal.returnValue === 'confirm') generateLabels(count);
      resolve();
    };

    els.confirmModal.addEventListener('close', onClose);
    els.confirmModal.showModal();
  });
}

async function generateLabels(count) {
  if (!currentOrder) return alert('Lookup an order first.');

  const data = currentOrder;
  const payload = {
    formId: sanitizeFormId(els.formIdInput.value),
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    pickupWindow: data.pickupWindow || '',
    count,
    fleaProvided: !!els.chkFleaProvided.checked,
  };

  try {
    els.activity.innerHTML = '';
    setVisible(els.activitySection, true);
    logLine('', 'Generating labels…');

    const res = await fetch(`${API_BASE}/generate-labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);

    logLine('ok', `Created ${j.count} label(s).`);
    if (j.merged?.url) {
      const a = document.createElement('a');
      a.href = j.merged.url;
      a.target = '_blank';
      a.textContent = 'Open merged PDF';
      const line = document.createElement('div');
      line.className = 'line ok';
      line.innerHTML = `<span class="dot"></span>`;
      line.appendChild(a);
      els.activity.appendChild(line);
      window.open(j.merged.url, '_blank');
    }
  } catch (err) {
    console.error(err);
    logLine('err', `Label generation failed: ${err.message}`);
    alert(err.message);
  }
}

// ──────────────────────────────────────────────
// EVENTS
// ──────────────────────────────────────────────
els.btnStartCam.addEventListener('click', startCamera);
els.btnStopCam.addEventListener('click', stopCamera);
els.btnLookup.addEventListener('click', handleLookup);
els.btnContinue.addEventListener('click', handleContinue);

els.btnClear.addEventListener('click', () => {
  stopCamera();
  els.formIdInput.value = '';
  els.resultSection.hidden = true;
  els.labelPrompt.hidden = true;
  els.activitySection.hidden = true;
  els.activity.innerHTML = '';
  currentOrder = null;
});

// Autofocus + cleanup
window.addEventListener('load', () => els.formIdInput.focus());
window.addEventListener('beforeunload', stopCamera);