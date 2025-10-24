// ------- CONFIG -------
const API_BASE = 'https://orderfulfillmentapp-580236127675.northamerica-northeast2.run.app';

// ------- DOM -------
const els = {
  video: document.getElementById('video'),
  canvas: document.getElementById('canvas'),
  btnStartCam: document.getElementById('btnStartCam'),
  btnStopCam: document.getElementById('btnStopCam'),
  formIdInput: document.getElementById('formIdInput'),
  btnLookup: document.getElementById('btnLookup'),
  resultSection: document.getElementById('result-section'),
  orderSummary: document.getElementById('orderSummary'),
  btnClear: document.getElementById('btnClear'),
  chkFleaRequested: document.getElementById('chkFleaRequested'),
  chkFleaProvided: document.getElementById('chkFleaProvided'),
  labelCount: document.getElementById('labelCount'),
  btnGenerate: document.getElementById('btnGenerate'),
  puppyKittenAlert: document.getElementById('puppyKittenAlert'),
  activitySection: document.getElementById('activity-section'),
  activity: document.getElementById('activity'),
  confirmModal: document.getElementById('confirmModal')
};

// ------- STATE -------
let scanLoop = null;
let mediaStream = null;
let lastDetected = '';
let currentOrder = null; // { formId, firstName, lastName, pickupWindow, additionalServices, alerts }

// ------- UTIL -------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function scrollIntoView(el) { el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function logLine(kind, msg){
  const line = document.createElement('div');
  line.className = `line ${kind||''}`;
  line.innerHTML = `<span class="dot"></span><span>${msg}</span>`;
  els.activity.appendChild(line);
}
function setSectionVisible(section, visible){
  section.hidden = !visible;
  if (visible) scrollIntoView(section);
}
function sanitizeFormId(s){
  return String(s||'').replace(/\D+/g,'').slice(0,12);
}

// ------- LOOKUP -------
async function lookup(formId){
  logLine('', `Looking up order ${formId}…`);
  const res = await fetch(`${API_BASE}/lookup`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ formId })
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Lookup failed');
  return data;
}

function renderOrderSummary(data){
  const { formId, firstName, lastName, pickupWindow } = data;
  els.orderSummary.innerHTML = `
    <div class="kv"><div class="k">Form ID</div><div>${formId}</div></div>
    <div class="kv"><div class="k">Client</div><div>${(firstName?.charAt(0)||'')} ${lastName||''}</div></div>
    <div class="kv"><div class="k">Pickup Window</div><div>${pickupWindow||'—'}</div></div>
  `;
}

// ------- BARCODE -------
async function startCamera(){
  if (!('BarcodeDetector' in window)) {
    alert('BarcodeDetector not supported on this device. Use manual entry.');
    return;
  }
  try{
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    els.video.srcObject = mediaStream;
    await els.video.play();

    const detector = new BarcodeDetector({ formats: ['code_128','ean_13','code_39','upc_a','upc_e'] });

    scanLoop = (async function loop(){
      if (!mediaStream) return;
      try{
        const codes = await detector.detect(els.video);
        if (codes?.length){
          const raw = codes[0].rawValue || '';
          const digits = sanitizeFormId(raw);
          if (digits.length === 12 && digits !== lastDetected){
            lastDetected = digits;
            els.formIdInput.value = digits;
            await onLookupClick(); // auto-lookup on capture
          }
        }
      }catch(e){ /* ignore frame */ }
      requestAnimationFrame(loop);
    })();
  }catch(err){
    console.error(err);
    alert('Camera unavailable. Use manual entry.');
  }
}

function stopCamera(){
  if (mediaStream){
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  lastDetected = '';
}

// ------- EVENTS -------
els.btnStartCam.addEventListener('click', startCamera);
els.btnStopCam.addEventListener('click', stopCamera);

els.btnLookup.addEventListener('click', onLookupClick);
els.formIdInput.addEventListener('input', (e)=>{
  e.target.value = sanitizeFormId(e.target.value);
});

async function onLookupClick(){
  try{
    const formId = sanitizeFormId(els.formIdInput.value);
    if (formId.length !== 12) return alert('Form ID must be 12 digits.');

    // Prepare UI
    els.activity.innerHTML = '';
    setSectionVisible(els.activitySection, true);
    logLine('', 'Starting lookup…');

    // Lookup
    const resp = await lookup(formId);
    currentOrder = resp; // keep full payload (expects .data or normalized top-level)
    const data = resp.data || resp; // support either shape

    renderOrderSummary(data);
    setSectionVisible(els.resultSection, true);

    // Puppy/Kitten reminder from alerts array
    const alerts = data.alerts || [];
    const hasPuppyKitten = alerts.some(a => /puppy|kitten/i.test(a));
    els.puppyKittenAlert.hidden = !hasPuppyKitten;

    // Flea requested?
    const services = data.additionalServices || [];
    const fleaRequested = services.some(s => /flea/i.test(s));
    els.chkFleaRequested.checked = fleaRequested;

    logLine('ok', 'Lookup complete.');
  }catch(err){
    console.error(err);
    logLine('err', `Lookup failed: ${err.message}`);
    alert(err.message);
  }
}

els.btnClear.addEventListener('click', ()=>{
  stopCamera();
  els.formIdInput.value = '';
  currentOrder = null;
  els.resultSection.hidden = true;
  els.activitySection.hidden = true;
  els.activity.innerHTML = '';
});

// Generate labels (with confirmation modal)
els.btnGenerate.addEventListener('click', async ()=>{
  if (!currentOrder){
    return alert('Lookup an order first.');
  }
  const formId = sanitizeFormId(els.formIdInput.value);
  const count = Number(els.labelCount.value || 0);
  if (!(count >= 1 && count <= 5)){
    return alert('Label count must be between 1 and 5.');
  }

  // open modal
  const choice = await openConfirmModal();
  if (choice !== 'confirm') return;

  // Build payload
  const data = currentOrder.data || currentOrder;
  const payload = {
    formId,
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    pickupWindow: data.pickupWindow || '',
    count,
    fleaProvided: !!els.chkFleaProvided.checked
  };

  try{
    els.activity.innerHTML = '';
    setSectionVisible(els.activitySection, true);
    logLine('', 'Generating labels…');

    const res = await fetch(`${API_BASE}/generate-labels`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);

    logLine('ok', `Created ${j.count} label(s).`);
    if (j.merged?.url){
      const a = document.createElement('a');
      a.href = j.merged.url;
      a.target = '_blank';
      a.textContent = 'Open merged PDF';
      const line = document.createElement('div');
      line.className = 'line ok';
      line.innerHTML = `<span class="dot"></span>`;
      line.appendChild(a);
      els.activity.appendChild(line);
    }
  }catch(err){
    console.error(err);
    logLine('err', `Label generation failed: ${err.message}`);
    alert(err.message);
  }
});

// ------- Modal helper -------
function openConfirmModal(){
  return new Promise((resolve)=>{
    const onClose = (ev)=> {
      els.confirmModal.removeEventListener('close', onClose);
      resolve(els.confirmModal.returnValue);
    };
    els.confirmModal.addEventListener('close', onClose);
    els.confirmModal.showModal();
  });
}

// ------- Autofocus / Autoscroll -------
window.addEventListener('load', ()=>{
  scrollIntoView(document.querySelector('.app-header'));
  els.formIdInput.focus();
});

// Cleanup camera when navigating away
window.addEventListener('beforeunload', stopCamera);