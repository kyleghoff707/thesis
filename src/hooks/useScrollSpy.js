// Shared IntersectionObserver hook for section tracking
// Replaces duplicated observer logic in OnePager.jsx and PitchDeck.jsx
// Uses requestAnimationFrame debouncing to prevent flicker (D-09)

import { useState, useEffect, useRef } from 'react';

export function useScrollSpy(sectionIds, options = {}) {
  const {
    prefix = 'section-',
    threshold = 0.3,
    // topOffset: 52px Layout nav + 40px StageNavBar + 8px buffer = 100px
    topOffset = 100,
  } = options;

  const [activeSection, setActiveSection] = useState(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!sectionIds || sectionIds.length === 0) return;

    const elements = sectionIds
      .map(id => document.getElementById(prefix + id))
      .filter(Boolean);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
          let best = null;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (!best || entry.intersectionRatio > best.intersectionRatio) {
                best = entry;
              }
            }
          }
          if (best) {
            const key = best.target.id.replace(prefix, '');
            setActiveSection(key);
          }
        });
      },
      {
        threshold,
        rootMargin: `-${topOffset}px 0px -60% 0px`,
      },
    );

    elements.forEach(el => observer.observe(el));

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sectionIds, prefix, threshold, topOffset]);

  return activeSection;
}
