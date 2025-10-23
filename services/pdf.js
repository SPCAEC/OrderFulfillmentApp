// services/pdf.js
// -----------------------------------------------------------------------------
// Generates 4x6 “Pet Food Pantry Pickup” bag labels and uploads PDFs to Drive.
// -----------------------------------------------------------------------------

import { PDFDocument, StandardFonts } from 'pdf-lib';
import axios from 'axios';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { Readable } from 'stream';

// ──────────────────────────────────────────────
// CONFIG
// ──────────────────────────────────────────────
const LOGO_URL =
  'https://drive.google.com/uc?export=download&id=1QdKdMM-VHas0xgrCFpP_cITMn2ZZx7hY';
const OUTPUT_FOLDER_ID = '1wGhhU3XulZVW8JzO1AUlq0L3XHNVGG-b'; // Pantry label folder ID

// Utility: simple timestamped log
function logStep(label, data = null) {
  const now = new Date().toISOString();
  if (data) console.log(`🕓 [${now}] ${label}`, data);
  else console.log(`🕓 [${now}] ${label}`);
}

// ──────────────────────────────────────────────
// MAIN GENERATOR
// ──────────────────────────────────────────────
export async function generateAndUploadLabel({
  firstName,
  lastName,
  pickupWindow,
  dateText,
  index,
  total,
  formId,
}) {
  try {
    logStep('▶️ Starting PDF generation', { formId, firstName, lastName });

    // 1️⃣ Create 4x6 PDF
    const doc = await PDFDocument.create();
    const page = doc.addPage([288, 432]);
    const { width, height } = page.getSize();

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    logStep('✅ Fonts embedded');

    // 2️⃣ Fetch logo + barcode
    logStep('⬇️ Fetching logo and barcode...');
    const [logoBytes, barcodeBytes] = await Promise.all([
      axios.get(LOGO_URL, { responseType: 'arraybuffer' }).then(r => r.data),
      axios
        .get(
          `https://quickchart.io/barcode?text=${encodeURIComponent(
            formId
          )}&type=code128&format=png&width=250&height=60&margin=0`,
          { responseType: 'arraybuffer' }
        )
        .then(r => r.data),
    ]);
    logStep('✅ Images fetched', {
      logoBytes: logoBytes?.byteLength,
      barcodeBytes: barcodeBytes?.byteLength,
    });

    const logo = await doc.embedPng(logoBytes);
    const barcode = await doc.embedPng(barcodeBytes);
    logStep('✅ Images embedded into PDF');

    // 3️⃣ Layout and text blocks
    page.drawImage(logo, { x: 25, y: height - 120, width: 95, height: 95 });
    page.drawText('Pet Food', { x: 140, y: height - 40, size: 16, font: bold });
    page.drawText('Pantry Pickup', { x: 140, y: height - 60, size: 16, font: bold });

    const disclaimer =
      'These items have been provided as a good-faith effort to assist during a temporary need or crisis. The SPCA is not legally liable for the distribution, use, or consumption of these items. Items not picked up within 7 days of the date below will be repurposed for other clients.';
    drawWrappedText(page, disclaimer, {
      x: 140,
      y: height - 110,
      width: 120,
      font,
      size: 7,
      lineHeight: 9,
    });

    let y = 250;
    const nameText = `${firstName?.charAt(0) || ''} ${lastName || ''}`;
    page.drawText(`Name: ${nameText}`, { x: 40, y, size: 16, font: bold });
    y -= 25;
    page.drawText(`Item/Bag: ${index} of ${total}`, { x: 80, y, size: 12, font });
    y -= 25;
    page.drawText(`Date Prepared: ${dateText}`, { x: 60, y, size: 12, font });
    y -= 40;
    page.drawText(`Pickup Window: ${pickupWindow}`, { x: 30, y, size: 12, font });
    page.drawImage(barcode, { x: 20, y: 25, width: 250, height: 60 });

    logStep('✅ Layout complete');

    // 4️⃣ Save + upload to Drive
    const pdfBytes = await doc.save();
    logStep('💾 PDF saved to memory', { size: pdfBytes.length });

    const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const drive = google.drive({ version: 'v3', auth });
    logStep('🔑 Google Auth ready');

    const fileName = `BagLabel_${lastName || 'Last'}_${formId}_${index}of${total}.pdf`;
    const stream = Readable.from([Buffer.from(pdfBytes)]);
    logStep('📤 Uploading to Drive...', { fileName, folder: OUTPUT_FOLDER_ID });

    const fileRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/pdf',
        parents: [OUTPUT_FOLDER_ID],
      },
      media: { mimeType: 'application/pdf', body: stream },
      fields: 'id, webViewLink, webContentLink',
    });

    logStep('✅ File uploaded to Drive', fileRes.data);

    return {
      ok: true,
      fileId: fileRes.data.id,
      url: fileRes.data.webViewLink || fileRes.data.webContentLink,
    };
  } catch (err) {
    console.error('🚨 PDF generation or upload failed:', err);
    return { ok: false, error: err.message, stack: err.stack };
  }
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function drawWrappedText(page, text, { x, y, width, font, size, lineHeight }) {
  const words = text.split(' ');
  let line = '';
  let cursorY = y;
  for (const w of words) {
    const testLine = line + w + ' ';
    const testWidth = font.widthOfTextAtSize(testLine, size);
    if (testWidth > width && line.length > 0) {
      page.drawText(line.trim(), { x, y: cursorY, size, font });
      line = w + ' ';
      cursorY -= lineHeight;
    } else line = testLine;
  }
  if (line) page.drawText(line.trim(), { x, y: cursorY, size, font });
}