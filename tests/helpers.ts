import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", "fixtures");

export const fx = (name: string): Uint8Array => new Uint8Array(readFileSync(join(dir, name)));
export const readFixtureText = (name: string): string => readFileSync(join(dir, name), "utf8");
