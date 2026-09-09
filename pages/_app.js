import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Short_Stack } from 'next/font/google';
import '../styles/globals.css';
import '../styles/print-safari.css';
import '../styles/print-font.css';
import '../styles/print-grid.css';

const printHandwriting = Short_Stack({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-handwriting',
});

function setReactField(element, value) {
  if (!element) return false;
  const proto = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return false;
  setter.call(element, String(value));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function CalendarPlannerBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/planner') return;
    const { course, story, day } = router.query;
    if (!course && !story && !day) return;

    let tries = 0;
    const apply = () => {
      const selectors = document.querySelectorAll('.planner-selectors select');
      if (selectors.length < 3) {
        tries += 1;
        if (tries < 30) window.setTimeout(apply, 50);
        return;
      }
      if (course) setReactField(selectors[0], course);
      if (story) setReactField(selectors[1], story);
      if (day) setReactField(selectors[2], day);
    };

    apply();
  }, [router.isReady, router.pathname, router.query.course, router.query.story, router.query.day]);

  return null;
}

function PrintFontPreloader() {
  useEffect(() => {
    if (!document.fonts?.load) return;
    document.fonts.load(`400 16px ${printHandwriting.style.fontFamily}`).catch(() => {});
  }, []);

  return (
    <span
      className={printHandwriting.className}
      aria-hidden="true"
      style={{ position: 'fixed', left: '-10000px', top: 0, opacity: 0, pointerEvents: 'none' }}
    >
      Lesson notes handwriting preload
    </span>
  );
}

function collectPrintCss() {
  let css = '';

  const walk = (rules) => {
    Array.from(rules || []).forEach((rule) => {
      if (rule.type === CSSRule.MEDIA_RULE) {
        const mediaText = rule.media?.mediaText || '';
        if (mediaText.includes('print')) {
          css += Array.from(rule.cssRules || []).map((nested) => nested.cssText).join('\n') + '\n';
        }
        return;
      }
      if (rule.type === CSSRule.IMPORT_RULE) {
        try { walk(rule.styleSheet?.cssRules); } catch {}
      }
    });
  };

  Array.from(document.styleSheets || []).forEach((sheet) => {
    try { walk(sheet.cssRules); } catch {}
  });

  return css;
}

function AppleStandalonePrintBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/planner') return;

    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches
      || window.matchMedia?.('(display-mode: fullscreen)').matches;

    if (!appleMobile || !standalone) return;

    const nativePrint = window.print.bind(window);

    window.print = () => {
      const sheet = document.querySelector('.print-sheet');
      if (!sheet) {
        nativePrint();
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        nativePrint();
        return;
      }

      const headAssets = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
        .map((node) => node.outerHTML)
        .join('\n');
      const previewPrintCss = collectPrintCss();
      const fontValue = window.getComputedStyle(sheet).getPropertyValue('--font-handwriting').trim();
      const title = sheet.querySelector('.print-header h1')?.textContent?.trim() || 'Kids&Us Audit Notes';
      const fontStyle = fontValue ? `--font-handwriting:${fontValue};` : '';

      printWindow.document.open();
      printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base href="${window.location.origin}/" />
<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
${headAssets}
<style>
  /* The audit layout was intentionally designed inside @media print.
     Mirror those exact rules on screen in this clean Safari preview so
     the user sees the same notebook sheet that will actually be printed. */
  ${previewPrintCss}

  html, body { background: #fff !important; color: #24324a !important; }
  body { margin: 0 !important; padding: 16px !important; ${fontStyle} }
  .print-only, .print-sheet { display: block !important; }
  .audit-print-toolbar {
    display: flex !important;
    position: sticky;
    top: 0;
    z-index: 9999;
    justify-content: center;
    padding: 10px 0 14px;
    background: rgba(255,255,255,.96);
  }
  .audit-print-toolbar button {
    appearance: none;
    border: 0;
    border-radius: 12px;
    padding: 12px 18px;
    font: inherit;
    font-weight: 700;
    background: #315aa8;
    color: #fff;
  }
  @media print {
    body { padding: 0 !important; }
    .audit-print-toolbar { display: none !important; }
  }
</style>
</head>
<body style="${fontStyle}">
  <div class="audit-print-toolbar"><button type="button" onclick="window.print()">🖨️ Print audit notes</button></div>
  ${sheet.outerHTML}
</body>
</html>`);
      printWindow.document.close();
    };

    return () => {
      window.print = nativePrint;
    };
  }, [router.isReady, router.pathname]);

  return null;
}

function PwaSetup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>Kids&amp;Us Hub</title>
        <meta name="application-name" content="Kids&Us Hub" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kids&Us Hub" />
        <meta name="theme-color" content="#ff5364" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
      </Head>
      <div className={printHandwriting.variable}>
        <PwaSetup />
        <AppleStandalonePrintBridge />
        <PrintFontPreloader />
        <CalendarPlannerBridge />
        <Component {...pageProps} />
      </div>
    </>
  );
}
