function apiLookup(formId) {
  const info = lookupBagLabelInfo(formId);
  if (!info.ok) return info;

  // Puppy/Kitten check
  let hasPuppyKitten = false;
  for (let i = 1; i <= 6; i++) {
    const age = Number(info.rowObj[`Pet ${i} Age`] || '');
    const units = String(info.rowObj[`Pet ${i} Units`] || '').trim().toLowerCase();
    if (!isNaN(age) && age > 0 && age <= 12 && units === 'months') {
      hasPuppyKitten = true;
      break;
    }
  }

  // Staff exception check
  const hasSpecialRequest = Boolean(String(info.rowObj['Special Request'] || '').trim());

  return {
    ...info,
    pickupWindow: _readPickupWindow(info.rowObj),
    hasPuppyKitten,
    hasSpecialRequest,
    fleaFlowEnabled: OP_CONFIG.FLEA_FLOW_FEATURE_ENABLED
  };
}

function apiGenerateLabels(formId, count, flea) {
  const res = generateBagLabels(formId, count);

  if (res.ok) {
    const { rowIndex, rowObj } = _getRowByFormId(formId);
    const ss = SpreadsheetApp.openById(OP_CONFIG.SOURCE_SHEET_ID);
    const sh = ss.getSheetByName(OP_CONFIG.SOURCE_SHEET_NAME);
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);

    // Flea Medication Provided
    if (flea != null) {
      let col = headers.indexOf("Flea Medication Provided");
      if (col < 0) {
        col = headers.length;
        sh.getRange(1, col + 1).setValue("Flea Medication Provided");
      }
      sh.getRange(rowIndex, col + 1).setValue(flea);
    }

    // Number of Items
    let colNum = headers.indexOf("Number of Items");
    if (colNum < 0) {
      colNum = headers.length;
      sh.getRange(1, colNum + 1).setValue("Number of Items");
    }
    sh.getRange(rowIndex, colNum + 1).setValue(Number(count));

    // Fulfilled Date
    let colDate = headers.indexOf("Fulfilled Date");
    if (colDate < 0) {
      colDate = headers.length;
      sh.getRange(1, colDate + 1).setValue("Fulfilled Date");
    }
    sh.getRange(rowIndex, colDate + 1).setValue(new Date());

    // Notification Status
    apiSetNotification(formId, "Ready");
  }

  return res;
}

function apiSetNotification(formId, status) {
  return setNotificationStatus(formId, status);
}