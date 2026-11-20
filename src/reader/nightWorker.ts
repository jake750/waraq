// Runs the night-mode pixel pass off the main thread, so scrolling and touch stay smooth.
import { nightPixels } from "./night";

self.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer }>) => {
  const { id, buf } = e.data;
  nightPixels(new Uint8ClampedArray(buf));
  (self as unknown as Worker).postMessage({ id, buf }, [buf]);
};
