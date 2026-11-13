// Namespace-tolerant lookups: DOM implementations differ on prefixed XML names (office:text, dc:title).
export const localName = (el: Element): string => {
  const n = el.localName || el.nodeName;
  return n.includes(":") ? n.slice(n.indexOf(":") + 1) : n;
};

export function byLocal(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((e) => localName(e) === name);
}

export const childrenOf = (el: Element, name?: string): Element[] =>
  Array.from(el.children).filter((c) => name === undefined || localName(c) === name);
