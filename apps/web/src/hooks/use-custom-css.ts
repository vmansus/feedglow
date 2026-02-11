'use client';

import { useEffect, useState } from 'react';
import { getCustomCss } from '@/lib/api';

const STYLE_ID = 'user-custom-css';
const STORAGE_KEY = 'feedglow_custom_css';

export function useCustomCss() {
  const [css, setCss] = useState<string>('');
  const [loaded, setLoaded] = useState(false);

  // 1. Immediately load from localStorage (no auth needed, instant)
  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        setCss(cached);
        injectCss(cached);
      }
    } catch { /* localStorage unavailable */ }
    setLoaded(true);
  }, []);

  // 2. Then sync from API (needs auth, may take a moment)
  useEffect(() => {
    let cancelled = false;
    const syncFromApi = () => {
      getCustomCss()
        .then((data) => {
          if (cancelled) return;
          const apiCss = data.css || '';
          setCss(apiCss);
          injectCss(apiCss);
          // Update localStorage cache
          try { localStorage.setItem(STORAGE_KEY, apiCss); } catch {}
        })
        .catch(() => {
          // Auth not ready yet, retry once after a delay
          if (!cancelled) {
            setTimeout(() => {
              if (cancelled) return;
              getCustomCss()
                .then((data) => {
                  if (cancelled) return;
                  const apiCss = data.css || '';
                  setCss(apiCss);
                  injectCss(apiCss);
                  try { localStorage.setItem(STORAGE_KEY, apiCss); } catch {}
                })
                .catch(() => {}); // Give up after 2nd try
            }, 2000);
          }
        });
    };
    syncFromApi();
    return () => { cancelled = true; };
  }, []);

  return { css, setCss, loaded };
}

/** Inject or update the custom CSS <style> tag */
export function injectCss(css: string) {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!css) {
    if (styleEl) styleEl.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = css;
}

/** Save CSS to both API and localStorage, then inject */
export function saveAndInjectCss(css: string) {
  try { localStorage.setItem(STORAGE_KEY, css); } catch {}
  injectCss(css);
}
