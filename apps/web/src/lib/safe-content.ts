const blockedPattern =
  /javascript:|vbscript:|data:text\/html|srcdoc\s*=|on[a-z]+\s*=|<\s*script|<\s*iframe|<\s*object|<\s*embed|<\s*svg|<\s*math|document\.|window\.|eval\s*\(|Function\s*\(/i;

const allowedTags = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "BLOCKQUOTE", "UL", "OL", "LI"]);
const blockedTags = new Set([
  "SCRIPT",
  "STYLE",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "MATH",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "LINK",
  "META"
]);

export const hasBlockedPlainTextContent = (value: string) =>
  /[<>]/.test(value) || blockedPattern.test(value);

const sanitizeNode = (node: Node, documentRef: Document): Node[] => {
  if (node.nodeType === Node.TEXT_NODE) {
    return [documentRef.createTextNode(node.textContent ?? "")];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toUpperCase();

  if (blockedTags.has(tagName)) {
    return [];
  }

  if (!allowedTags.has(tagName)) {
    return [...element.childNodes].flatMap((child) => sanitizeNode(child, documentRef));
  }

  const cleanElement = documentRef.createElement(tagName.toLowerCase());
  for (const child of [...element.childNodes]) {
    const sanitizedChildren = sanitizeNode(child, documentRef);
    sanitizedChildren.forEach((sanitizedChild) => cleanElement.appendChild(sanitizedChild));
  }

  return [cleanElement];
};

export const sanitizeStudioRichText = (html: string) => {
  if (typeof document === "undefined") {
    return html
      .replace(/<\s*(script|style|iframe|object|embed|svg|math)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;

  const sanitizedRoot = document.createElement("div");
  for (const child of [...wrapper.childNodes]) {
    const sanitizedChildren = sanitizeNode(child, document);
    sanitizedChildren.forEach((sanitizedChild) => sanitizedRoot.appendChild(sanitizedChild));
  }

  return sanitizedRoot.innerHTML
    .replace(/&nbsp;/g, " ")
    .replace(/\s+<\/p>/g, "</p>")
    .trim();
};

export const sanitizeStudioPreviewHtml = (html: string) => sanitizeStudioRichText(html);
