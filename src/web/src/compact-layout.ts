// Fit the same DOM used by preview and PDF. Never hide or truncate text.
export function fitCompactPages(root: HTMLElement): void {
  for (const page of root.querySelectorAll<HTMLElement>('[data-slide]')) {
    const content = page.querySelector<HTMLElement>('.compact-page-content');
    const footer = page.querySelector<HTMLElement>('.compact-page-footer');
    const push = page.querySelector<HTMLElement>('.push');
    if (!content || !footer || !push) continue;
    page.classList.remove('compact-page--dense');
    content.style.removeProperty('zoom');
    const fits = () => {
      const bottom = page.getBoundingClientRect().bottom - parseFloat(getComputedStyle(page).paddingBottom);
      const availableBottom = bottom - footer.getBoundingClientRect().height - parseFloat(getComputedStyle(push).minHeight);
      return content.getBoundingClientRect().bottom <= availableBottom + 0.5;
    };
    if (fits()) continue;
    // First recover whitespace while keeping the approved font sizes.
    page.classList.add('compact-page--dense');
    if (fits()) continue;
    // Bounded fallback for longer names, headings and evidence. The strict PDF
    // validator still rejects exceptional content that cannot fit at this floor.
    for (let percent = 98; percent >= 86; percent -= 2) {
      content.style.setProperty('zoom', String(percent / 100));
      if (fits()) break;
    }
  }
}
