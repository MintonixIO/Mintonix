"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./feature-showcase.module.css";

export function FeatureMotion({ children }: { children: ReactNode }) {
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = section.current;
    if (!root || !("IntersectionObserver" in window) || !Element.prototype.getAnimations) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    const visible = new Set<Element>();
    let active: Element | undefined;
    let stopped = false;

    // Keep one visual cue on screen at a time. Scrolling past a queued item skips it.
    async function playNext() {
      if (active || stopped || document.hidden) return;
      const next = visible.values().next().value;
      if (!next) return;

      active = next;
      visible.delete(next);
      next.setAttribute("data-playing", "");
      next.removeAttribute("data-waiting");
      const animations = next.getAnimations({ subtree: true });
      await Promise.allSettled(animations.map(animation => animation.finished));

      if (stopped) return;
      observer.unobserve(next);
      next.removeAttribute("data-playing");
      active = undefined;
      void playNext();
    }

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
          if (entry.target !== active) visible.add(entry.target);
        } else {
          visible.delete(entry.target);
          if (entry.target === active) active.removeAttribute("data-playing");
        }
      }
      void playNext();
    }, { threshold: 0.35, rootMargin: "0px 0px -5% 0px" });

    const items = root.querySelectorAll("[data-feature-motion]");
    for (const item of items) {
      if (item.getAttribute("data-feature-motion") === "type") item.setAttribute("data-waiting", "");
      observer.observe(item);
    }

    function stop() {
      stopped = true;
      observer.disconnect();
      visible.clear();
      for (const item of items) {
        item.removeAttribute("data-waiting");
        item.removeAttribute("data-playing");
      }
    }

    function onVisibilityChange() {
      if (document.hidden) active?.removeAttribute("data-playing");
      else void playNext();
    }

    reducedMotion.addEventListener("change", stop);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      reducedMotion.removeEventListener("change", stop);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <section ref={section} id="possibilities" className={styles.showcase} aria-labelledby="showcase-heading">
      {children}
    </section>
  );
}
