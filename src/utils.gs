/** utils.gs — Common helpers */

function _fail(prefix, e) {
  const msg = (e && (e.message || e.toString())) || 'Unknown error';
  return { ok: false, message: CFG.DEBUG ? `${prefix}: ${msg}` : prefix };
}

function _fetchUrlAsBlob_(url) {
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  return resp.getBlob();
}

function _mergePdfsViaService_(files, outName, folder) {
  const payload = {
    files: files.map((f, idx) => {
      const blob = f.getBlob();
      const bytes = Utilities.base64Encode(blob.getBytes());
      return { name: f.getName() || ('part' + (idx + 1) + '.pdf'), data: bytes };
    })
  };

  const resp = UrlFetchApp.fetch(CFG.MERGE_API_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() >= 300) {
    return null;
  }

  const mergedBlob = resp.getBlob().setName(outName);
  return folder.createFile(mergedBlob);
}

function _safeTrashFiles_(files) {
  files.forEach(f => { try { f.setTrashed(true); } catch (_) {} });
}