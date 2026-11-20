// Runs the night-mode pixel pass off the main thread, so scrolling and touch stay smooth.
import { nightPixels } from "./night";

self.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer; width: number; solid: number }>) => {
  const { id, buf, width, solid } = e.data;
  nightPixels(new Uint8ClampedArray(buf), width, solid);
  (self as unknown as Worker).postMessage({ id, buf }, [buf]);
};
