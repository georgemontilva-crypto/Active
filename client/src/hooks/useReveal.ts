import { useEffect, useRef } from "react";

/**
 * Adds the `in-view` class to elements with the `reveal` class once they enter
 * the viewport, driving CSS entrance transitions. Returns a ref for a
 * container; all descendant `.reveal` elements are observed.
 *
 * A MutationObserver keeps watching for elements added after mount. Without it,
 * anything React renders later — a filtered grid, a switched tab — is never
 * observed and stays stuck at the transition's starting opacity, i.e.
 * invisible. That looked like content failing to load.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Elements already revealed keep their class; this only tracks what the
    // IntersectionObserver is currently watching, so nothing is observed twice.
    const observed = new WeakSet<Element>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    const register = (els: HTMLElement[]) => {
      els.forEach((el, i) => {
        if (observed.has(el) || el.classList.contains("in-view")) return;
        observed.add(el);
        const delay = el.dataset.revealDelay;
        el.style.transitionDelay = delay
          ? `${delay}ms`
          : `${Math.min(i * 60, 360)}ms`;
        observer.observe(el);
      });
    };

    const scan = () =>
      register(Array.from(container.querySelectorAll<HTMLElement>(".reveal")));

    scan();

    const mutations = new MutationObserver((records) => {
      // Only rescan when nodes actually appeared, not on every attribute change
      // (adding `in-view` is itself a mutation and would loop).
      const added = records.some((r) => r.addedNodes.length > 0);
      if (added) scan();
    });
    mutations.observe(container, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return containerRef;
}
