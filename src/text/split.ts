/**
 * Glyph splitting.
 *
 * The spaghettification needs to move individual characters, so the prose
 * has to be broken up into spans. The split is *destructive* and happens
 * once, at start-up; nothing else touches the DOM structure afterwards.
 *
 * Text inside an element marked with `data-no-split` is left alone — that is
 * how a word is kept together (a name, a number, a formula).
 */

export interface CharacterSpan {
  /** The span that wraps one character. */
  element: HTMLElement;
  /** The character itself. */
  text: string;
  /** The offset of the character's centre relative to the parent's box. */
  offsetX: number;
  offsetY: number;
  /** The size of the character's box. */
  width: number;
  height: number;
}

export interface SplitResult {
  /** The characters, in document order. */
  characters: CharacterSpan[];
  /** The parent that was split. */
  element: HTMLElement;
}

/** The elements that should be pulled into the shadow. */
export function pullTargets(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-pull]'));
}

/**
 * Split every text node under `element` into per-character spans.
 *
 * The parent gets `white-space: pre-wrap` so the spaces survive.
 */
export function splitCharacters(element: HTMLElement): SplitResult {
  element.classList.add('pik-pull');
  element.style.whiteSpace = 'pre-wrap';

  const characters: CharacterSpan[] = [];

  const walk = (node: Node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? '';
        if (!text) continue;
        const fragment = document.createDocumentFragment();
        for (const character of text) {
          if (character === ' ') {
            fragment.append(document.createTextNode(' '));
            continue;
          }
          const span = document.createElement('span');
          span.className = 'pik-pull__char';
          span.textContent = character;
          fragment.append(span);
          characters.push({
            element: span,
            text: character,
            offsetX: 0,
            offsetY: 0,
            width: 0,
            height: 0,
          });
        }
        node.replaceChild(fragment, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const elementChild = child as HTMLElement;
        if (elementChild.hasAttribute('data-no-split')) continue;
        walk(elementChild);
      }
    }
  };

  walk(element);

  // Measure once, in one pass, so the offsets are relative to the parent.
  const parentRect = element.getBoundingClientRect();
  for (const character of characters) {
    const rect = character.element.getBoundingClientRect();
    character.offsetX = rect.left - parentRect.left;
    character.offsetY = rect.top - parentRect.top;
    character.width = rect.width;
    character.height = rect.height;
  }

  return { characters, element };
}

/** Split every pull target under `root`. */
export function splitPullTargets(root: ParentNode = document): SplitResult[] {
  return pullTargets(root).map((element) => splitCharacters(element));
}
