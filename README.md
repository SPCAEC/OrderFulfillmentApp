# Pantry Order Fulfillment (SPCA)

This project is a Google Apps Script + Web App for generating **Pet Food Pantry Order Pickup Labels**.

## Features
- Scan or enter 12-digit **FormID** to look up pantry order
- Show client name, pickup window, reminders/alerts
- Handle flea/tick medication workflow (with feature flag)
- Generate bag labels (1–5) with barcode + placeholders
- Merge PDFs via external service
- Update Google Sheet with status, fulfilled date, flea status, and item count

## File Structure
- `src/` → all clasp-managed code
  - `index.html` → main UI shell
  - `css.app.html` → shared styles
  - `js.app.html` → frontend controller
  - `Code.gs` → doGet + include
  - `config.gs` → constants
  - `rpc.gs` → API entrypoints
  - `sheets.lookup.gs` → sheet helpers
  - `slides.labels.gs` → Slides → PDF
  - `utils.gs` → misc helpers

## Development
1. Install clasp (`npm install -g @google/clasp`)
2. Log in (`clasp login`)
3. Push code (`npx clasp push`)
4. Deploy via Apps Script dashboard

## License
Internal use at **SPCA Serving Erie County**.