import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Short_Stack } from 'next/font/google';
import LZString from 'lz-string';
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
    const { course, story, day, start, audit } = router.query;
    if (!course && !story && !day && !start && audit !== '1') return;

    let tries = 0;
    const apply = () => {
      const selectors = document.querySelectorAll('.planner-selectors select');
      if (selectors.length < 3) {
        tries += 1;
        if (tries < 40) window.setTimeout(apply, 50);
        return;
      }

      if (course) setReactField(selectors[0], course);
      if (story) setReactField(selectors[1], story);
      if (day) setReactField(selectors[2], day);

      if (audit === '1') {
        const liveButton = Array.from(document.querySelectorAll('.mode-buttons button'))
          .find((button) => button.textContent?.trim() === 'Live');
        liveButton?.click();
      }

      if (start) {
        let startTries = 0;
        const applyStart = () => {
          const startInput = document.querySelector('.live-tools input[type="time"]');
          if (startInput) {
            setReactField(startInput, start);
            return;
          }
          startTries += 1;
          if (startTries < 40) window.setTimeout(applyStart, 50);
        };
        applyStart();
      }
    };

    apply();
  }, [router.isReady, router.pathname, router.query.course, router.query.story, router.query.day, router.query.start, router.query.audit]);

  return null;
}

function encodePrintPayload(text) {
  return `lz.${LZString.compressToEncodedURIComponent(String(text || ''))}`;
}

function StandaloneAuditPrintBridge() {
  const router = useRouter();

  useEffect(() => {
    const printablePath = router.pathname === '/planner' || router.pathname === '/special-lessons-live';
    if (!router.isReady || !printablePath) return undefined;

    const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true
      || window.matchMedia?.('(display-mode: standalone)').matches
      || window.matchMedia?.('(display-mode: fullscreen)').matches;

    if (!appleMobile || !standalone) return undefined;

    const nativePrint = window.print.bind(window);

    window.print = () => {
      const sheets = Array.from(document.querySelectorAll('.print-sheet'));
      if (!sheets.length) {
        nativePrint();
        return;
      }

      const sheetHtml = sheets.map((sheet) => sheet.outerHTML).join('');
      const payload = encodePrintPayload(sheetHtml);
      const href = `https://kidsandus-kyam974-sketchs-projects.vercel.app/audit-print#${payload}`;

      // Use a different hostname from the installed PWA so iPadOS hands the
      // print view to normal Safari. Compress the complete print sheet before
      // putting it in the fragment: long Special Lessons can otherwise exceed
      // the fragment length Safari reliably preserves and lose the final rows.
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer external';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    return () => {
      window.print = nativePrint;
    };
  }, [router.isReady, router.pathname]);

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
        <StandaloneAuditPrintBridge />
        <PrintFontPreloader />
        <CalendarPlannerBridge />
        <Component {...pageProps} />
      </div>
    </>
  );
}
