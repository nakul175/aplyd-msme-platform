// The measurements, written to run INSIDE a page. `qualityProbe` is installed into every page of a browser context as
// `window.__quality` (see install.ts) and is called with `page.evaluate`. It must stay self-contained: Playwright sends its source
// text to the page, so nothing here may use an import or a variable from outside the function.
//
// It reads the page and moves its scroll position. It changes nothing else: no style, no markup, no event handler except the one
// focus listener that `focusStart` adds (and only to record). It is a measurement, not a full audit: see ../../VALIDATION.md.

export type Box = { w: number; h: number };
export type SmallTarget = { key: string; hit: Box; own: Box; via: string; count: number };
export type ClippedControl = { key: string; left: number; right: number; count: number };
export type CoveredControl = { key: string; by: string; count: number };
export type WideElement = { key: string; width: number; left: number; right: number };

export type PhoneMeasure = {
  clientWidth: number;
  scrollWidth: number;
  /** The height of the whole page, in CSS pixels. Reported, not judged. */
  scrollHeight: number;
  /** True when the document can be scrolled sideways. */
  documentOverflows: boolean;
  /** Elements whose box reaches past the right or left edge of the screen and are not inside a box that scrolls or clips them on purpose. Widest first. */
  wide: WideElement[];
  controls: number;
  small: SmallTarget[];
  clipped: ClippedControl[];
  covered: CoveredControl[];
  /** Links inside a sentence. They are exempt from the size check (WCAG 2.5.5 names the exception) and counted so the exemption is visible. */
  inlineLinksExempt: number;
};

export type StructureMeasure = {
  lang: string;
  title: string;
  mains: number;
  h1s: number;
  headings: { level: number; text: string }[];
  headingSkips: { key: string; detail: string }[];
  notes: number;
  viewportContent: string;
  zoomBlocked: boolean;
  fields: number;
  fieldsWithoutLabel: { key: string; detail: string }[];
  imagesWithoutAlt: { key: string; detail: string }[];
};

export type FocusStop = {
  key: string;
  isField: boolean;
  /** Where a ring or shadow appeared when it took focus (itself, its parent ...), or null when nothing did. */
  indicator: string | null;
  /** Set by focusCheck, once the browser has scrolled the element into view: what lies over its centre, or null when nothing does. */
  obscuredBy: string | null;
};
export type FocusMeasure = { focusables: number; stops: FocusStop[] };

export function qualityProbe() {
  // The probe is installed before the document exists, so the root element is read when it is needed, never at install time.
  const doc = {
    get clientWidth() {
      return document.documentElement.clientWidth;
    },
    get clientHeight() {
      return document.documentElement.clientHeight;
    },
    get scrollWidth() {
      return document.documentElement.scrollWidth;
    },
    getAttribute(name: string) {
      return document.documentElement.getAttribute(name);
    },
  };
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  /** A key must not change from run to run: long numbers and identifiers are replaced. */
  const stable = (s: string) =>
    s
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "*")
      .replace(/\d{4,}/g, "*")
      .replace(/:r[0-9a-z]+:/g, "*");
  const classOf = (el: Element) => (el.getAttribute("class") ?? "").trim().split(/\s+/).filter(Boolean);

  const isRendered = (el: Element) => {
    if (el.getClientRects().length === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    // The inside of a closed disclosure box has a layout box but is not shown and cannot be touched.
    const check = (el as Element & { checkVisibility?: (o?: object) => boolean }).checkVisibility;
    return check ? check.call(el, { checkVisibilityCSS: true, visibilityProperty: true }) : true;
  };

  /** A short, stable description of an element, for people to find it by. */
  const selectorOf = (el: Element) => {
    const one = (e: Element) => {
      const tag = e.tagName.toLowerCase();
      const id = e.id && /^[A-Za-z][\w-]*$/.test(e.id) ? `#${stable(e.id)}` : "";
      const cls = classOf(e)
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("");
      const testid = e.getAttribute("data-testid");
      return `${tag}${id}${cls}${testid ? `[data-testid=${stable(testid)}]` : ""}`;
    };
    const parent = el.parentElement && el.parentElement !== document.body ? `${one(el.parentElement)} > ` : "";
    return `${parent}${one(el)}`;
  };

  const FIELD_TAGS = ["input", "select", "textarea"];
  const textOf = (el: Element) => norm((el as HTMLElement).innerText ?? el.textContent);

  /** The key of a control: tag, type, a name or id, the words on it. Radio buttons and checkboxes are keyed by their group. */
  const controlKey = (el: Element) => {
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type");
    const grouped = tag === "input" && (type === "radio" || type === "checkbox");
    const id = el.id && /^[A-Za-z][\w-]*$/.test(el.id) ? stable(el.id) : "";
    const name = el.getAttribute("name");
    const base = `${tag}${type && tag === "input" ? `[${type}]` : ""}`;
    const who = grouped ? (name ? `[name=${stable(name)}]` : id ? `#${id}` : "") : id ? `#${id}` : name ? `[name=${stable(name)}]` : "";
    let words = "";
    if (grouped) words = "";
    else if (tag === "a" || tag === "button" || tag === "summary") words = norm(el.getAttribute("aria-label")) || textOf(el);
    else if (tag === "input" && (type === "submit" || type === "button" || type === "reset")) words = norm((el as HTMLInputElement).value);
    else {
      const labels = Array.from((el as HTMLInputElement).labels ?? []);
      words = norm(el.getAttribute("aria-label")) || (labels[0] ? norm(labels[0].textContent) : "");
    }
    let href = "";
    if (tag === "a") {
      try {
        href = ` -> ${stable(new URL(el.getAttribute("href") ?? "", location.href).pathname)}`;
      } catch {
        href = "";
      }
    }
    return `${base}${who}${words ? ` "${cut(stable(words), 40)}"` : ""}${href}`;
  };

  const labelsOf = (el: Element): HTMLLabelElement[] => Array.from((el as HTMLInputElement).labels ?? []);
  const isHit = (el: Element, hit: Element | null) => !!hit && (hit === el || el.contains(hit) || labelsOf(el).some((l) => l.contains(hit)));

  const CONTROLS = "a[href], button, input:not([type=hidden]), select, textarea, summary";
  /** The element that took focus last, and the record made for it, so focusCheck can complete the record after the browser has scrolled. */
  let lastFocus: { el: Element; record: FocusStop } | null = null;
  const controls = () => Array.from(document.querySelectorAll(CONTROLS)).filter(isRendered);

  return {
    /** Opens every disclosure box, as a person would to read what is in it, so that what is inside is measured too. Returns how many were closed. */
    openDisclosures(): number {
      const closed = Array.from(document.querySelectorAll("details:not([open])"));
      for (const d of closed) d.setAttribute("open", "");
      return closed.length;
    },

    /** Sideways overflow, the size of every control's target, and whether each control can be reached. */
    phone(args: { min: number; tolerance: number; offscreenByDesign: string[] }): PhoneMeasure {
      const { min, tolerance, offscreenByDesign } = args;
      const clientWidth = doc.clientWidth;
      const scrollWidth = doc.scrollWidth;

      // 1. Anything reaching past the edge of the screen, unless a box that scrolls or clips it on purpose is in the way.
      const clippedByAncestor = (el: Element) => {
        for (let a = el.parentElement; a && a !== document.body && a !== doc; a = a.parentElement) {
          const o = getComputedStyle(a).overflowX;
          if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") {
            const r = a.getBoundingClientRect();
            if (r.right <= clientWidth + tolerance && r.left >= -tolerance) return true;
          }
        }
        return false;
      };
      const wide: WideElement[] = [];
      for (const el of Array.from(document.body.querySelectorAll("*"))) {
        if ((el as SVGElement).ownerSVGElement) continue;
        if (!isRendered(el)) continue;
        if (offscreenByDesign.some((s) => el.matches(s) || el.closest(s))) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 && r.height <= 1) continue;
        if (r.right <= clientWidth + tolerance && r.left >= -tolerance) continue;
        if (clippedByAncestor(el)) continue;
        wide.push({ key: selectorOf(el), width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) });
      }
      wide.sort((a, b) => b.right - b.left - (a.right - a.left));

      // 2. Controls: size of the target, then whether the control can be reached.
      const small: SmallTarget[] = [];
      const clipped: ClippedControl[] = [];
      const covered: CoveredControl[] = [];
      let inlineLinksExempt = 0;
      const list = controls();
      // Controls with the same key (two links with the same words to the same place) are told apart by their order. The options of a
      // radio or checkbox group share one key on purpose: the group is the finding, and `count` says how many options it covers.
      const seen = new Map<string, number>();
      const identify = (el: Element, key: string) => {
        const type = el.getAttribute("type");
        if (el.tagName.toLowerCase() === "input" && (type === "radio" || type === "checkbox")) return key;
        const n = (seen.get(key) ?? 0) + 1;
        seen.set(key, n);
        return n === 1 ? key : `${key} #${n}`;
      };
      const push = <T extends { key: string; count: number }>(into: T[], item: T) => {
        const same = into.find((x) => x.key === item.key);
        if (same) same.count += 1;
        else into.push(item);
      };
      for (const el of list) {
        const designed = offscreenByDesign.some((s) => el.matches(s));
        const tag = el.tagName.toLowerCase();
        const key = identify(el, controlKey(el));
        const own = el.getBoundingClientRect();

        // Size. The target is the control's own box, a label that wraps or points at it, or the stretched box a link gets from a
        // pseudo-element laid over its card, whichever is large enough in both directions (or, failing that, the largest).
        const candidates: { w: number; h: number; via: string }[] = [{ w: own.width, h: own.height, via: "itself" }];
        for (const l of labelsOf(el)) {
          const r = l.getBoundingClientRect();
          candidates.push({ w: r.width, h: r.height, via: "its label" });
        }
        const passes = () => candidates.some((c) => c.w >= min - tolerance && c.h >= min - tolerance);
        if (!passes() && (tag === "a" || tag === "button")) {
          const pseudo = (p: string) => {
            const cs = getComputedStyle(el, p);
            return cs.content !== "none" && (cs.position === "absolute" || cs.position === "fixed");
          };
          if (pseudo("::after") || pseudo("::before")) {
            // Walk outwards from the centre, one pixel at a time, while the point still belongs to the control.
            window.scrollTo(0, Math.max(0, own.top + window.scrollY - window.innerHeight / 2 + own.height / 2));
            const r = el.getBoundingClientRect();
            const cx = Math.round(r.left + r.width / 2);
            const cy = Math.round(r.top + r.height / 2);
            const run = (dx: number, dy: number) => {
              let n = 0;
              for (let s = 1; s <= 400; s++) {
                const x = cx + dx * s;
                const y = cy + dy * s;
                if (x < 0 || y < 0 || x >= clientWidth || y >= doc.clientHeight) break;
                if (!isHit(el, document.elementFromPoint(x, y))) break;
                n = s;
              }
              return n;
            };
            if (isHit(el, document.elementFromPoint(cx, cy))) candidates.push({ w: run(-1, 0) + run(1, 0) + 1, h: run(0, -1) + run(0, 1) + 1, via: "a stretched pseudo-element" });
          }
        }
        if (!passes()) {
          const inline =
            tag === "a" &&
            getComputedStyle(el).display === "inline" &&
            norm((el.parentElement?.textContent ?? "").replace(el.textContent ?? "", "")).length > 0;
          if (inline) inlineLinksExempt++;
          else {
            const best = candidates.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
            push(small, { key, hit: { w: Math.round(best.w), h: Math.round(best.h) }, own: { w: Math.round(own.width), h: Math.round(own.height) }, via: best.via, count: 1 });
          }
        }

        // Reach. Bring the control to the middle of the screen by scrolling up or down only, then ask what is at its centre.
        if (designed) continue;
        window.scrollTo(0, Math.max(0, own.top + window.scrollY - window.innerHeight / 2 + own.height / 2));
        const r = el.getBoundingClientRect();
        if (r.left < -tolerance || r.right > clientWidth + tolerance) {
          push(clipped, { key, left: Math.round(r.left), right: Math.round(r.right), count: 1 });
          continue;
        }
        // A link that runs over two lines has a box that is mostly not the link, so every line's own box is tried; one hit is enough.
        let top: Element | null = null;
        let reachable = false;
        for (const q of Array.from(el.getClientRects()).filter((x) => x.width > 0 && x.height > 0)) {
          top = document.elementFromPoint(q.left + q.width / 2, Math.min(Math.max(q.top + q.height / 2, 0), doc.clientHeight - 1));
          if (isHit(el, top)) {
            reachable = true;
            break;
          }
        }
        if (!reachable) push(covered, { key, by: top ? selectorOf(top) : "nothing", count: 1 });
      }
      window.scrollTo(0, 0);

      return { clientWidth, scrollWidth, scrollHeight: document.documentElement.scrollHeight, documentOverflows: scrollWidth > clientWidth + tolerance, wide, controls: list.length, small, clipped, covered, inlineLinksExempt };
    },

    /** What a reader of the markup would check: the language, one main, one h1, headings in order, names on fields and pictures. */
    structure(): StructureMeasure {
      const hidden = (el: Element) => el.getAttribute("aria-hidden") === "true" || !isRendered(el);
      const nameText = (node: Node, skipFields: boolean): string => {
        if (node.nodeType === 3) return node.textContent ?? "";
        if (node.nodeType !== 1) return "";
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (el.getAttribute("aria-hidden") === "true") return "";
        if (tag === "img") return el.getAttribute("alt") ?? "";
        if (tag === "svg") return el.querySelector(":scope > title")?.textContent ?? el.getAttribute("aria-label") ?? "";
        if (skipFields && FIELD_TAGS.includes(tag)) return "";
        return Array.from(el.childNodes)
          .map((c) => nameText(c, skipFields))
          .join(" ");
      };
      /** The name the brief asks for on a field: a label, aria-label or aria-labelledby. A placeholder or a title does not count. */
      const fieldName = (el: Element) => {
        const by = el.getAttribute("aria-labelledby");
        if (by) {
          const t = norm(
            by
              .split(/\s+/)
              .map((id) => {
                const n = document.getElementById(id);
                return n ? nameText(n, true) : "";
              })
              .join(" "),
          );
          if (t) return t;
        }
        const al = norm(el.getAttribute("aria-label"));
        if (al) return al;
        const labels = labelsOf(el);
        if (labels.length) return norm(labels.map((l) => nameText(l, true)).join(" "));
        return "";
      };

      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]"))
        .filter((h) => !hidden(h))
        .map((h) => {
          const level = /^h[1-6]$/i.test(h.tagName) ? Number(h.tagName[1]) : Number(h.getAttribute("aria-level") ?? 2);
          return { level, text: cut(norm(h.textContent), 40), el: h };
        });
      const headingSkips: { key: string; detail: string }[] = [];
      let previous = 0;
      for (const h of headings) {
        if (h.level > previous + 1) headingSkips.push({ key: `h${h.level} "${stable(h.text)}"`, detail: `h${h.level} follows ${previous === 0 ? "nothing" : `h${previous}`}` });
        previous = h.level;
      }

      const fields = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea")).filter(isRendered);
      const fieldsWithoutLabel = fields.filter((f) => !fieldName(f)).map((f) => ({ key: controlKey(f), detail: "no label, aria-label or aria-labelledby with words in it" }));

      const pictures = Array.from(document.querySelectorAll("img, svg, [role=img], input[type=image]")).filter((p) => !(p as SVGElement).ownerSVGElement && !hidden(p));
      const imagesWithoutAlt: { key: string; detail: string }[] = [];
      for (const p of pictures) {
        const tag = p.tagName.toLowerCase();
        const decorative = p.getAttribute("role") === "presentation" || p.getAttribute("role") === "none";
        let ok = decorative;
        if (!ok && (tag === "img" || (tag === "input" && p.getAttribute("type") === "image"))) ok = p.hasAttribute("alt");
        else if (!ok) ok = !!norm(p.getAttribute("aria-label")) || !!norm(p.querySelector(":scope > title")?.textContent) || !!norm(nameText(p, false));
        if (!ok) imagesWithoutAlt.push({ key: `${tag}${p.getAttribute("class") ? `.${classOf(p)[0]}` : ""}`, detail: tag === "img" ? "no alt attribute" : "not hidden from assistive tools and has no name" });
      }

      const viewportContent = document.querySelector("meta[name=viewport]")?.getAttribute("content") ?? "";
      return {
        lang: doc.getAttribute("lang") ?? "",
        title: norm(document.title),
        mains: document.querySelectorAll("main, [role=main]").length,
        h1s: headings.filter((h) => h.level === 1).length,
        headings: headings.map(({ level, text }) => ({ level, text })),
        headingSkips,
        notes: document.querySelectorAll("[role=note]").length,
        viewportContent,
        zoomBlocked: /user-scalable\s*=\s*(no|0)/i.test(viewportContent) || /maximum-scale\s*=\s*(0?\.\d+|1(\.0+)?)\b/i.test(viewportContent),
        fields: fields.length,
        fieldsWithoutLabel,
        imagesWithoutAlt,
      };
    },

    /**
     * Starts recording every focus change. The resting look of every focusable element is read first, so that what a focus changes can be
     * told from what was always there. The indicator may be on the element, on its ::before or ::after, or on one of its three nearest
     * parents (a label that lights up when the radio button inside it has focus).
     */
    focusStart(): number {
      const FOCUSABLE = `${CONTROLS}, [tabindex]:not([tabindex="-1"])`;
      const focusables = Array.from(document.querySelectorAll(FOCUSABLE)).filter((e) => isRendered(e) && !(e as HTMLInputElement).disabled);
      const look = (el: Element) => {
        const places: [string, Element, string | null][] = [["itself", el, null], ["its ::before", el, "::before"], ["its ::after", el, "::after"]];
        let a = el.parentElement;
        for (let i = 1; i <= 3 && a; i++, a = a.parentElement) places.push([i === 1 ? "its parent" : `its parent ${i}`, a, null]);
        return places.map(([where, e, pseudo]) => {
          const cs = getComputedStyle(e, pseudo);
          const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} ${cs.outlineOffset}` : "none";
          return { where, outline, shadow: cs.boxShadow };
        });
      };
      const resting = new Map<Element, ReturnType<typeof look>>(focusables.map((e) => [e, look(e)]));
      const w = window as unknown as { __qualityFocus?: FocusStop[] };
      w.__qualityFocus = [];
      document.addEventListener(
        "focusin",
        (event) => {
          const el = event.target as Element;
          if (!(el instanceof Element)) return;
          const before = resting.get(el) ?? look(el);
          const after = look(el);
          let indicator: string | null = null;
          for (let i = 0; i < after.length && indicator === null; i++) {
            const changed = after[i].outline !== before[i].outline || after[i].shadow !== before[i].shadow;
            if (changed && (after[i].outline !== "none" || after[i].shadow !== "none")) indicator = after[i].where;
          }
          const tag = el.tagName.toLowerCase();
          const record: FocusStop = { key: controlKey(el), isField: FIELD_TAGS.includes(tag), indicator, obscuredBy: null };
          w.__qualityFocus!.push(record);
          lastFocus = { el, record };
        },
        true,
      );
      return focusables.length;
    },

    /**
     * Call after each Tab press. The browser scrolls a newly focused element into view after the focus event, so what covers it can only be read
     * now: whatever lies at its centre (a bar fixed to the bottom of the screen, a banner) that is not the element or its label.
     */
    focusCheck(): void {
      if (!lastFocus) return;
      const { el, record } = lastFocus;
      const rects = Array.from(el.getClientRects()).filter((x) => x.width > 0 && x.height > 0);
      if (rects.length === 0) return;
      // A link that runs over two lines has a box that is mostly not the link, so every line's own box is tried; one hit is enough.
      let top: Element | null = null;
      for (const r of rects) {
        const cx = Math.min(Math.max(r.left + r.width / 2, 0), doc.clientWidth - 1);
        const cy = r.top + r.height / 2;
        if (cy < 0 || cy >= doc.clientHeight) continue;
        top = document.elementFromPoint(cx, cy);
        if (isHit(el, top)) return;
      }
      record.obscuredBy = top ? selectorOf(top) : "nothing: it is outside the screen";
    },

    focusRead(): FocusStop[] {
      return (window as unknown as { __qualityFocus?: FocusStop[] }).__qualityFocus ?? [];
    },

    /** The key of one element, for a finding that another tool (the browser's accessibility tree) located. Called on an element object. */
    keyOf(el: Element): string {
      return controlKey(el);
    },

    /** Whether the skip link, once it has focus, is on the screen. */
    skipLinkOnScreenWhenFocused(selector: string): { present: boolean; onScreen: boolean } {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) return { present: false, onScreen: false };
      el.focus();
      const r = el.getBoundingClientRect();
      const on = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= doc.clientWidth && r.width > 0 && r.height > 0;
      el.blur();
      return { present: true, onScreen: on };
    },
  };
}

declare global {
  interface Window {
    /** Installed by matrix.ts into every page of a phone context. */
    __quality: ReturnType<typeof qualityProbe>;
  }
}
