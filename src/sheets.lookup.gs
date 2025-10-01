/** sheets.lookup.gs — Spreadsheet helpers */

function _getRowByFormId(formId) {
  try {
    const ss = SpreadsheetApp.openById(CFG.SOURCE_SHEET_ID);
    const sh = ss.getSheetByName(CFG.SOURCE_SHEET_NAME);
    if (!sh) return { error: 'Response sheet not found.' };

    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const idx = (name) => headers.indexOf(name);
    const colFormId = idx('FormID');
    if (colFormId < 0) return { error: 'FormID column missing.' };

    const last = sh.getLastRow();
    if (last < 2) return { error: 'No submissions yet.' };

    const ids = sh.getRange(2, colFormId + 1, last - 1, 1)
      .getValues().map(r => String(r[0] || '').trim());

    let rowIndex = -1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === String(formId)) { rowIndex = 2 + i; break; }
    }
    if (rowIndex < 0) return { error: 'Order not found for that Form ID.' };

    const rowVals = sh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const rowObj = {};
    headers.forEach((h, i) => rowObj[h] = rowVals[i]);

    return { rowIndex, rowObj };
  } catch (e) {
    return { error: 'Lookup failed.' };
  }
}

function _parseDate(v) {
  if (!v) return null;
  try {
    if (Object.prototype.toString.call(v) === '[object Date]') return v;
    const asNum = Number(v);
    if (!isNaN(asNum)) return new Date(asNum);
    return new Date(String(v));
  } catch (_) { return null; }
}

function _parseServices(csv) {
  if (!csv) return [];
  return String(csv).split(',').map(s => s.trim()).filter(Boolean);
}

function _readPickupWindow(rowObj) {
  const candidates = ['Pick-up Window', 'Pickup Window', 'Pickup window', 'Preferred Pickup Window'];
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(rowObj, key)) {
      return String(rowObj[key] || '').trim();
    }
  }
  return '';
}

function _computeAlerts(rowObj) {
  const alerts = [];

  // Flea medication
  const services = _parseServices(rowObj['Additional Services']);
  if (services.includes('Flea prevention')) {
    alerts.push('FLEA MEDICATION REQUESTED');
  }

  // Puppy / Kitten alert
  for (let i = 1; i <= 6; i++) {
    const age = Number(rowObj[`Pet ${i} Age`] || 0);
    const units = String(rowObj[`Pet ${i} Units`] || '').toLowerCase();
    if (age > 0 && age <= 12 && units === 'months') {
      alerts.push('PUPPY OR KITTEN! Did you check for puppy or kitten food?');
      break;
    }
  }

  // Staff exception
  if (String(rowObj['Special Request'] || '').trim()) {
    alerts.push('STAFF EXCEPTION: Reminder, a staff member added a special item or request.');
  }

  return alerts;
}

function _updateSheetAfterLabels(formId, count, fleaProvided) {
  const ss = SpreadsheetApp.openById(CFG.SOURCE_SHEET_ID);
  const sh = ss.getSheetByName(CFG.SOURCE_SHEET_NAME);
  if (!sh) return;

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idx = (name) => headers.indexOf(name);

  const { rowIndex } = _getRowByFormId(formId);
  if (!rowIndex) return;

  function ensureCol(name) {
    let c = idx(name);
    if (c < 0) {
      c = headers.length;
      sh.getRange(1, c + 1).setValue(name);
      headers.push(name);
    }
    return c + 1;
  }

  sh.getRange(rowIndex, ensureCol('Notification Status')).setValue('Ready');
  sh.getRange(rowIndex, ensureCol('Fulfilled Date')).setValue(new Date());
  if (fleaProvided != null) {
    sh.getRange(rowIndex, ensureCol('Flea Medication Provided')).setValue(fleaProvided ? 'Yes' : 'No');
  }
  sh.getRange(rowIndex, ensureCol('Number of Items')).setValue(count);
}