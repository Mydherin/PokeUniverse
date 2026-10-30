// Minimal DOM builder. Text children become text nodes, so user data is never parsed as HTML.

type Child = Node | string | number | false | null | undefined;
type Props = {
  class?: string;
  on?: { [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
  [attribute: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "on") {
      for (const [event, handler] of Object.entries(value as object)) el.addEventListener(event, handler as EventListener);
    } else if (key === "class") {
      el.className = value as string;
    } else if (value === true) {
      el.setAttribute(key, "");
    } else if (value !== false && value != null) {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child == null || child === false) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Parses trusted, static markup (icons, art). Never pass user data. */
export function trusted(markup: string): Element {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild!;
}
