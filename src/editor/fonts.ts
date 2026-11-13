// The editor's fonts (bundled with the app, nothing downloaded): IBM Plex Sans Arabic, whose
// "arabic" and "latin" files together cover Arabic, English and digits.
import arabicUrl from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff?url";
import latinUrl from "@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff?url";
import type { EditorFonts } from "./write";

let loading: Promise<EditorFonts> | undefined;

const get = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());

export function editorFonts(): Promise<EditorFonts> {
  loading ??= Promise.all([get(arabicUrl), get(latinUrl)]).then(([arabic, latin]) => ({ arabic, latin }));
  loading.catch(() => (loading = undefined));
  return loading;
}
