// Runs the night-mode pixel pass off the main thread, so scrolling and touch stay smooth.
import { nightPixels, type NightOptions } from "./night";

self.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer; width: number; solid: number; o?: NightOptions }>) => {
  const { id, buf, width, solid, o } = e.data;
  nightPixels(new Uint8ClampedArray(buf), width, solid, o);
  (self as unknown as Worker).postMessage({ id, buf }, [buf]);
};
