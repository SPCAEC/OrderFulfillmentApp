/** slides.labels.gs — Build bag labels in Google Slides */

function _makeBagLabelPdfs_(folder, first, last, pickupWindow, todayText, count, ts, formId) {
  const pdfs = [];
  const barcodeBlob = _makeBarcodeBlob_(formId, CFG.BARCODE_TYPE, CFG.BARCODE_WIDTH_PX, CFG.BARCODE_HEIGHT_PX);

  for (let i = 1; i <= count; i++) {
    const templateFile = DriveApp.getFileById(CFG.BAG_TEMPLATE_SLIDES_ID);
    const working = templateFile.makeCopy(`_tmp_Bag_${last || 'Last'}_${ts}_${i}`, folder);
    const pres = SlidesApp.openById(working.getId());
    const slide = pres.getSlides()[0];

    _replaceTextAll_(pres, {
      '{{lastName}}': String(last || '').trim(),
      '{{todaysDate}}': todayText,
      '{{pickupWindow}}': String(pickupWindow || '').trim(),
      '{{one}}': String(i),
      '{{many}}': String(count)
    });

    _replaceImagePlaceholderFitBox_(slide, CFG.BAG_IMAGE_PLACEHOLDER, barcodeBlob);

    pres.saveAndClose();

    const outName = `BagLabel_${last || 'Last'}_${ts}_${i}of${count}.pdf`;
    const pdfBlob = DriveApp.getFileById(working.getId()).getAs(MimeType.PDF).setName(outName);
    const file = folder.createFile(pdfBlob);
    pdfs.push(file);

    try { working.setTrashed(true); } catch (_) {}
  }
  return pdfs;
}

function _replaceTextAll_(presentation, map) {
  Object.keys(map).forEach(find => {
    presentation.replaceAllText(find, String(map[find] ?? ''));
  });
}

function _replaceImagePlaceholderFitBox_(slide, placeholder, blob) {
  let targetShape = null;
  slide.getPageElements().forEach(el => {
    if (el.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
      const shape = el.asShape();
      const text = String(shape.getText().asString() || '');
      if (text.includes(placeholder) && !targetShape) targetShape = shape;
    }
  });
  if (!targetShape) return;

  try { targetShape.getText().setText(''); } catch (_) {}
  const left = targetShape.getLeft(), top = targetShape.getTop();
  const widthPts = targetShape.getWidth(), heightPts = targetShape.getHeight();

  try {
    slide.insertImage(blob, left, top, widthPts, heightPts);
  } catch (e) {
    const img = slide.insertImage(blob);
    img.setLeft(left).setTop(top).setWidth(widthPts).setHeight(heightPts);
  }
}

function _makeBarcodeBlob_(text, type, widthPx, heightPx) {
  const url = 'https://quickchart.io/barcode?' +
    'text=' + encodeURIComponent(String(text)) +
    '&type=' + encodeURIComponent(type || 'code128') +
    '&format=png' +
    '&width=' + encodeURIComponent(widthPx || 600) +
    '&height=' + encodeURIComponent(heightPx || 220) +
    '&margin=0';
  return _fetchUrlAsBlob_(url);
}