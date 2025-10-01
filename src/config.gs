/** config.gs — Pantry Order Fulfillment App (IDs + constants) */

const CFG = {
  // Intake responses (Google Sheet)
  SOURCE_SHEET_ID: '1JrfUHDAPMCIvOSknKoN3vVR6KQZTKUaNLpsRru7cekU',
  SOURCE_SHEET_NAME: 'Form Responses 1', // gid=2089414052

  // Bag label template (4×4) + output folder
  BAG_TEMPLATE_SLIDES_ID: '1hFOGjr4PWmXNeO0grA6C0XUhKia3Hg4IV94n7FI-lSs',
  OUTPUT_FOLDER_ID: '1wGhhU3XulZVW8JzO1AUlq0L3XHNVGG-b',

  // Merge service (Render)
  MERGE_API_URL: 'https://pdf-merge-service.onrender.com/merge',

  // Slides placeholder for barcode image
  BAG_IMAGE_PLACEHOLDER: '{{barcode}}',

  // Barcode generation (QuickChart)
  BARCODE_TYPE: 'code128',    // widely scannable
  BARCODE_WIDTH_PX: 600,
  BARCODE_HEIGHT_PX: 220,

  // Debugging
  DEBUG: true,

  // Feature flag — flea/tick workflow
  FLEA_FLOW_FEATURE_ENABLED: true
};