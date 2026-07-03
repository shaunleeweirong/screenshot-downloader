import { describe, it, expect, beforeEach } from 'vitest';
import { isPinned, findPinnedElements, hidePinned, restorePinned } from '../../src/lib/capture/sticky';

describe('isPinned', () => {
  it('detects fixed and sticky', () => {
    expect(isPinned({ position: 'fixed' } as CSSStyleDeclaration)).toBe(true);
    expect(isPinned({ position: 'sticky' } as CSSStyleDeclaration)).toBe(true);
  });
  it('ignores static/relative/absolute', () => {
    expect(isPinned({ position: 'static' } as CSSStyleDeclaration)).toBe(false);
    expect(isPinned({ position: 'absolute' } as CSSStyleDeclaration)).toBe(false);
  });
});

describe('find/hide/restore pinned elements (jsdom)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <header id="h" style="position: fixed">nav</header>
      <div id="c" style="position: static">content</div>
      <aside id="a" style="position: sticky">side</aside>
    `;
  });

  it('finds only the pinned elements', () => {
    const found = findPinnedElements(document, window).map((el) => el.id).sort();
    expect(found).toEqual(['a', 'h']);
  });

  it('hides then restores original visibility', () => {
    const header = document.getElementById('h') as HTMLElement;
    header.style.visibility = 'visible';
    const pinned = findPinnedElements(document, window);

    hidePinned(pinned);
    expect(header.style.visibility).toBe('hidden');

    restorePinned(pinned);
    expect(header.style.visibility).toBe('visible');
  });

  it('hidePinned is idempotent and preserves the original value once', () => {
    const aside = document.getElementById('a') as HTMLElement;
    const pinned = findPinnedElements(document, window);
    hidePinned(pinned);
    hidePinned(pinned); // second call should not overwrite the remembered value
    restorePinned(pinned);
    expect(aside.style.visibility).toBe('');
  });
});
