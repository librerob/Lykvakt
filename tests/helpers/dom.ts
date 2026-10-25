export class TestElement extends EventTarget {
  children: (TestElement | string)[] = [];
  attributes: Record<string, string>;
  parentElement: TestElement | null = null;
  value = "";
  checked = false;
  disabled = false;
  hidden = false;
  isConnected = true;
  style: Record<string, string> = {};
  constructor(
    public tagName: string,
    attributes: Record<string, string> = {},
  ) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
  }
  get dataset(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.attributes)
        .filter(([k]) => k.startsWith("data-"))
        .map(([k, v]) => [
          k.slice(5).replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase()),
          v,
        ]),
    );
  }
  get textContent(): string {
    return this.children
      .map((x) => (typeof x === "string" ? x : x.textContent))
      .join("");
  }
  set textContent(value: string | null) {
    this.replaceChildren(value ?? "");
  }
  get className(): string {
    return this.attributes.class ?? "";
  }
  set className(value: string) {
    this.attributes.class = value;
  }
  classList = {
    toggle: (name: string, on?: boolean) => {
      const names = new Set(this.className.split(/\s+/).filter(Boolean));
      const add = on ?? !names.has(name);
      if (add) names.add(name);
      else names.delete(name);
      this.className = [...names].join(" ");
      return add;
    },
  };
  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  hasAttribute(name: string) {
    return name in this.attributes;
  }
  removeAttribute(name: string) {
    delete this.attributes[name];
  }
  append(...nodes: (TestElement | string)[]) {
    for (const node of nodes) {
      if (node instanceof TestElement) node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: (TestElement | string)[]) {
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(
        (x) => x !== this,
      );
    this.isConnected = false;
  }
  focus() {
    testDocument.activeElement = this;
  }
  getBoundingClientRect() {
    return { height: 20 };
  }
  querySelectorAll(selector: string): TestElement[] {
    const match = (node: TestElement) => {
      const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && node.tagName !== tag.toUpperCase()) return false;
      for (const hit of selector.matchAll(/\.([\w-]+)/g))
        if (!node.className.split(/\s+/).includes(hit[1]!)) return false;
      for (const hit of selector.matchAll(
        /\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g,
      )) {
        if (!node.hasAttribute(hit[1]!)) return false;
        if (hit[2] !== undefined && node.getAttribute(hit[1]!) !== hit[2])
          return false;
      }
      return true;
    };
    return this.children
      .filter((x): x is TestElement => x instanceof TestElement)
      .flatMap((node) => [
        ...(match(node) ? [node] : []),
        ...node.querySelectorAll(selector),
      ]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  reset() {
    for (const input of this.querySelectorAll("input")) {
      input.value = "";
      input.checked = false;
    }
    this.dispatchEvent(new Event("reset"));
  }
  click() {
    this.dispatchEvent(new Event("click", { cancelable: true }));
  }
}
export const testDocument = {
  activeElement: null as TestElement | null,
  createElement: (tag: string) => new TestElement(tag),
  createElementNS: (_ns: string, tag: string) => new TestElement(tag),
  body: new TestElement("body"),
};
export function keyEvent(key: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Event("keydown", { cancelable: true }), {
    key,
    isComposing: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...extra,
  });
}
export function primaryText(node: TestElement | string): string {
  if (typeof node === "string") return node;
  if (node.hasAttribute("data-technical")) return "";
  return node.children.map(primaryText).join(" ");
}
