import { useEffect, useState, type RefObject } from "react";

// One IntersectionObserver per margin for the whole app, instead of one per page or thumbnail:
// a 500-page document used to make 500 observers in each list.
type Shared = { io: IntersectionObserver; seen: Map<Element, (near: boolean) => void> };
const shared = new Map<string, Shared>();

function observer(margin: string): Shared {
  let s = shared.get(margin);
  if (!s) {
    const seen = new Map<Element, (near: boolean) => void>();
    const io = new IntersectionObserver((entries) => entries.forEach((e) => seen.get(e.target)?.(e.isIntersecting)), { rootMargin: margin });
    shared.set(margin, (s = { io, seen }));
  }
  return s;
}

/** Calls `on` whenever `el` comes within `margin` of the screen or leaves it. Returns the unwatch. */
export function watchNear(el: Element, margin: string, on: (near: boolean) => void): () => void {
  const s = observer(margin);
  s.seen.set(el, on);
  s.io.observe(el);
  return () => {
    s.io.unobserve(el);
    s.seen.delete(el);
  };
}

/** True while the element is within `margin` (vertically) of the screen. */
export function useNear(ref: RefObject<Element | null>, margin = 400): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return watchNear(el, `${margin}px 0px`, setNear);
  }, [ref, margin]);
  return near;
}
