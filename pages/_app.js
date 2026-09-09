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

      const title = sheet.querySelector('.print-header h1')?.textContent?.trim() || 'Kids&Us Audit Notes';
      const css = collectPrintCss();

      // Printing from an iOS Home Screen web app can silently do nothing.
      // Post the already-rendered audit sheet to the project's normal web
      // origin so iOS opens a regular Safari document. That document uses
      // the exact print CSS and Short Stack font, then invokes native print.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://kidsandus-kyam974-sketchs-projects.vercel.app/api/audit-print';
      form.target = '_blank';
      form.style.display = 'none';

      const addField = (name, value) => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      };

      addField('title', title);
      addField('markup', sheet.outerHTML);
      addField('css', css);

      document.body.appendChild(form);
      form.submit();
      form.remove();
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
