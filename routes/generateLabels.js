// routes/generateLabels.js
import express from 'express';
import { generateAndUploadLabel } from '../services/pdf.js';

const router = express.Router();

/**
 * POST /generate-labels
 * Body:
 * {
 *   "formId": "123456789012",
 *   "count": 2,
 *   "firstName": "Mary",
 *   "lastName": "Bantin",
 *   "pickupWindow": "Weekday: Mon–Fri 8am–4pm",
 *   "dateText": "10/13/2025"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const {
      formId,
      count = 1,
      firstName = '',
      lastName = '',
      pickupWindow = '',
      dateText = '',
    } = req.body || {};

    if (!formId) {
      return res.status(400).json({ ok: false, error: 'Missing formId' });
    }

    const labelCount = Math.min(Math.max(Number(count) || 1, 1), 5); // 1–5 max
    const results = [];

    for (let i = 1; i <= labelCount; i++) {
      const result = await generateAndUploadLabel({
        firstName,
        lastName,
        pickupWindow,
        dateText,
        index: i,
        total: labelCount,
        formId,
      });
      results.push(result);
    }

    // Return all generated PDFs
    res.json({
      ok: true,
      count: labelCount,
      labels: results.filter(r => r.ok),
      errors: results.filter(r => !r.ok),
    });
  } catch (err) {
    console.error('❌ Label generation failed:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;