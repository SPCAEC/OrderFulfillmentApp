// services/pdfMerge.js
// -----------------------------------------------------------------------------
// Combines multiple PDF files (by Drive ID) into a single PDF via external merge service.
// Compatible with Node 18+ / Cloud Run (binary-safe FormData upload).
// -----------------------------------------------------------------------------

import fetch from 'node-fetch';
import FormData from 'form-data';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

const MERGE_SERVICE_URL = 'https://pdf-merge-service.onrender.com/merge';

// 🔧 Helper: Authenticated Drive client
async function getDriveClient() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const auth = new GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  return google.drive({ version: 'v3', auth });
}

// -----------------------------------------------------------------------------
// MAIN: mergeAndUpload
// -----------------------------------------------------------------------------
export async function mergeAndUpload({ fileIds, outputName, outputFolderId }) {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { ok: false, error: 'No file IDs provided for merge.' };

  try {
    const drive = await getDriveClient();
    console.log(`📦 Fetching ${fileIds.length} PDFs for merge...`);

    // 1️⃣ Download each PDF as a Buffer
    const buffers = [];
    for (const [i, id] of fileIds.entries()) {
      try {
        const res = await drive.files.get(
          { fileId: id, alt: 'media' },
          { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(res.data);
        buffers.push({ name: `label_${i + 1}.pdf`, buffer });
      } catch (err) {
        console.error(`⚠️ Failed to fetch file ${id}:`, err.message);
      }
    }

    if (buffers.length === 0)
      throw new Error('No valid PDFs fetched for merge.');

    console.log(`🧾 Prepared ${buffers.length}/${fileIds.length} PDFs for merge.`);

    // 2️⃣ Build FormData for Render merge service
    const form = new FormData();
    buffers.forEach((f) => {
      form.append('files', f.buffer, {
        filename: f.name,
        contentType: 'application/pdf',
      });
    });

    // 3️⃣ Send to Render merge service
    console.log(`🚀 Uploading to merge service: ${MERGE_SERVICE_URL}`);
    const mergeRes = await fetch(MERGE_SERVICE_URL, {
      method: 'POST',
      body: form,
    });

    if (!mergeRes.ok) {
      const txt = await mergeRes.text();
      throw new Error(`Merge service error: ${mergeRes.status} ${txt}`);
    }

    const mergedBuffer = Buffer.from(await mergeRes.arrayBuffer());

    // 4️⃣ Upload merged PDF back to Drive
    const uploadRes = await drive.files.create({
      requestBody: {
        name: outputName,
        mimeType: 'application/pdf',
        parents: [outputFolderId],
      },
      media: {
        mimeType: 'application/pdf',
        body: mergedBuffer,
      },
      fields: 'id, webViewLink, webContentLink',
    });

    // 5️⃣ Optional cleanup of originals
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id });
      } catch (err) {
        console.warn(`⚠️ Could not delete temp file ${id}: ${err.message}`);
      }
    }

    console.log(`✅ Merged PDF uploaded: ${uploadRes.data.id}`);

    return {
      ok: true,
      fileId: uploadRes.data.id,
      url: uploadRes.data.webViewLink || uploadRes.data.webContentLink,
      count: buffers.length,
    };
  } catch (err) {
    console.error('❌ mergeAndUpload failed:', err);
    return { ok: false, error: err.message };
  }
}