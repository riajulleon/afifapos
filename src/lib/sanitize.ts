/**
 * Allowlist sanitiser for rich-text email blocks (MAIL-03). Keeps simple formatting and safe links;
 * everything else is unwrapped to its text. The API runs it again on save, so the editor can't bypass it.
 */
const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'A', 'BR', 'P', 'UL', 'OL', 'LI', 'DIV', 'SPAN']);
/** Dropped with everything inside them, not unwrapped. */
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'HEAD', 'TITLE']);

export function sanitizeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '');
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild!;
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (DROP.has(child.tagName.toUpperCase())) {
        child.remove();
        continue;
      }
      walk(child);
      if (!KEEP.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const ok = child.tagName === 'A' && attr.name === 'href' && /^(https?:|mailto:|\{\{)/i.test(attr.value.trim());
        if (!ok) child.removeAttribute(attr.name);
      }
      if (child.tagName === 'A') child.setAttribute('style', 'color:inherit;text-decoration:underline');
    }
  };
  walk(root);
  return root.innerHTML;
}
