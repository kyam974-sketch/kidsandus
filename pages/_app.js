import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '../styles/globals.css';

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
      const dayInput = document.querySelector('.planner-selectors input[type="number"]');
      if (selectors.length < 2 || !dayInput) {
        tries += 1;
        if (tries < 30) window.setTimeout(apply, 50);
        return;
      }
      if (course) setReactField(selectors[0], course);
      if (story) setReactField(selectors[1], story);
      if (day) setReactField(dayInput, day);
    };

    apply();
  }, [router.isReady, router.pathname, router.query.course, router.query.story, router.query.day]);

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
        <link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" href="/apple-touch-icon.png" />
      </Head>
      <CalendarPlannerBridge />
      <Component {...pageProps} />
    </>
  );
}
