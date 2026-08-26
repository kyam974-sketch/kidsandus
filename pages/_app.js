import { useEffect } from 'react';
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
      <CalendarPlannerBridge />
      <Component {...pageProps} />
    </>
  );
}
