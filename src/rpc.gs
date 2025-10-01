/** rpc.gs — Pantry Order Fulfillment APIs
 *  Exposed to frontend via google.script.run
 */

function apiLookup(formId) {
  const id = String(formId || '').trim();
  if (!/^\d{12}$/.test(id)) {
    return { ok: false, message: 'Invalid Form ID (must be 12 digits).' };
  }

  const { rowIndex, rowObj, error } = _getRowByFormId(id);
  if (error) return { ok: false, message: error };

  const first = String(rowObj['First Name'] || '').trim();
  const last = String(rowObj['Last Name'] || '').trim();
  const fullName = `${first} ${last}`.trim();

  const tsRaw = rowObj['Timestamp'];
  const requestDate = _parseDate(tsRaw);
  const requestDatePretty = requestDate
    ? Utilities.formatDate(requestDate, Session.getScriptTimeZone(), 'MMM d, yyyy')
    : '';

  const pickupWindow = _readPickupWindow(rowObj);
  const additionalServices = _parseServices(rowObj['Additional Services']);
  const alerts = _computeAlerts(rowObj);

  return {
    ok: true,
    rowIndex,
    formId: id,
    fullName,
    firstName: first,
    lastName: last,
    requestDatePretty,
    pickupWindow,
    additionalServices,
    alerts
  };
}

function apiGenerateLabels(formId, count, fleaProvided) {
  try {
    const id = String(formId || '').trim();
    const n = Number(count || 0);
    if (!/^\d{12}$/.test(id)) return _fail('Invalid Form ID (12 digits required).');
    if (!(n >= 1 && n <= 5)) return _fail('Label count must be between 1 and 5.');

    const { rowObj, error } = _getRowByFormId(id);
    if (error) return _fail(error);

    const first = String(rowObj['First Name'] || '').trim();
    const last = String(rowObj['Last Name'] || '').trim();
    const pickupWindow = _readPickupWindow(rowObj) || '';
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy');

    const folder = DriveApp.getFolderById(CFG.OUTPUT_FOLDER_ID);
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
    const safeLast = last || 'Last';

    let bagPdfs;
    try {
      bagPdfs = _makeBagLabelPdfs_(folder, first, last, pickupWindow, today, n, ts, id);
    } catch (e) {
      return _fail('Bag label build failed', e);
    }

    if (!bagPdfs.length) return _fail('No pages generated.');

    let merged;
    try {
      merged = _mergePdfsViaService_(bagPdfs, `BagLabels_${safeLast}_${ts}.pdf`, folder);
    } catch (e) {
      return _fail('Merge service error', e);
    }
    if (!merged) return _fail('Merge service failed.');

    _safeTrashFiles_(bagPdfs);

    _updateSheetAfterLabels(id, n, fleaProvided);

    return { ok: true, fileId: merged.getId(), url: merged.getUrl(), name: merged.getName() };
  } catch (err) {
    return _fail('Unexpected error creating labels', err);
  }
}