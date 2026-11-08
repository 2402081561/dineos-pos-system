export function normalizeMenuBrowse(value) {
  return {
    searchTerm: typeof value?.searchTerm === 'string' ? value.searchTerm.slice(0, 200) : '',
    category: typeof value?.category === 'string' ? value.category.slice(0, 100) : 'all',
    popularOnly: value?.popularOnly === true,
    scrollY: Number.isFinite(value?.scrollY) ? Math.max(0, Math.min(1000000, value.scrollY)) : 0,
    anchorId: typeof value?.anchorId === 'string' ? value.anchorId.slice(0, 100) : '',
    anchorTop: Number.isFinite(value?.anchorTop) ? Math.max(-10000, Math.min(10000, value.anchorTop)) : 0,
  }
}

export function menuRestoreTop(saved, currentAnchorTop, currentScrollY) {
  return Math.max(0, Number.isFinite(currentAnchorTop)
    ? currentScrollY + currentAnchorTop - saved.anchorTop
    : saved.scrollY)
}
