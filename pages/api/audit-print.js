function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  const markup = typeof req.body?.markup === 'string' ? req.body.markup : '';
  const css = typeof req.body?.css === 'string' ? req.body.css : '';
  const title = escapeHtml(req.body?.title || 'Kids&Us Audit Notes');

  if (!markup) {
    res.status(400).send('Missing printable lesson');
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Short+Stack&display=swap" rel="stylesheet" />
  <style>
    ${css}

    html, body {
      background: #eef1f5 !important;
      color: #24324a !important;
      margin: 0 !important;
      min-height: 100% !important;
    }

    body {
      padding: 14px !important;
    }

    .print-only,
    .print-sheet {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
    }

    .print-sheet {
      width: 100% !important;
      max-width: 210mm !important;
      margin: 0 auto !important;
      background: #fff !important;
      box-shadow: 0 2px 18px rgba(36, 50, 74, .12);
    }

    .print-sheet,
    .print-sheet * {
      font-family: 'Short Stack', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      font-style: normal !important;
    }

    .audit-print-toolbar {
      display: flex !important;
      position: sticky;
      top: 0;
      z-index: 9999;
      justify-content: center;
      padding: 8px 0 14px;
      background: rgba(238, 241, 245, .96);
    }

    .audit-print-toolbar button {
      appearance: none;
      -webkit-appearance: none;
      border: 0;
      border-radius: 12px;
      padding: 12px 18px;
      font: 700 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #315aa8;
      color: #fff;
    }

    @media print {
      html, body {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: #fff !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
      }

      body {
        padding: 0 !important;
        margin: 0 !important;
      }

      .audit-print-toolbar {
        display: none !important;
      }

      .print-only,
      .print-sheet,
      .print-plan,
      .print-bonus,
      .print-activity,
      .print-body {
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: visible !important;
      }

      .print-sheet {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        box-shadow: none !important;
      }

      .print-sheet,
      .print-sheet * {
        font-family: 'Short Stack', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        visibility: visible !important;
      }
    }
  </style>
</head>
<body>
  <div class="audit-print-toolbar">
    <button type="button" onclick="try{window.print()}catch(e){try{document.execCommand('print',false,null)}catch(_){}}">🖨️ Print audit notes</button>
  </div>
  ${markup}
</body>
</html>`);
}
