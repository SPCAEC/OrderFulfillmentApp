# 🐾 SPCA Pantry Fulfillment Backend

**Environment:** Google Cloud Run (Node.js 20)  
**Purpose:** Replaces the legacy Google Apps Script backend for order fulfillment and label generation at the Pet Food Pantry.

---

## 🚀 Overview

This service provides the backend API endpoints for:

| Endpoint | Purpose |
|-----------|----------|
| `/` | Health check |
| `/api/lookup` | Look up pantry orders in the Google Sheet by form ID or barcode |
| `/api/createLabels` | Generate printable PDF labels and upload to Drive |
| `/api/update` | Update order status and timestamps in Sheets |

All endpoints are built with **Express** and integrate directly with **Google Sheets** and **Drive** via a service account.

---

## 🧱 Project Structure
pantry-fulfillment/
├── package.json
├── index.js
├── /config
├── /routes
├── /services
└── /utils
---

## 🔑 Environment Variables (Configured in Cloud Run)

| Name | Description |
|------|--------------|
| `GOOGLE_SERVICE_ACCOUNT` | JSON key for the Google Workspace service account (stored as secret) |
| `OPENAI_API_KEY` | Used for AI-assisted tasks (stored as secret) |
| `SHEET_ID` | Google Sheet ID for pantry orders |
| `LABEL_FOLDER_ID` | Google Drive folder for generated PDFs |
| `MERGE_SERVICE_URL` | Optional Render-based PDF merge endpoint |
| `PORT` | Provided automatically by Cloud Run |

---

## ⚙️ Development

### 1. Install dependencies
```bash
npm install