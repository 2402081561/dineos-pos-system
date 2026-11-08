export function groupMobileMenuItems(categories, items, otherName) {
  const groups = categories.map((category) => ({ ...category, items: [] }))
  const byId = new Map(groups.map((group) => [group.id, group]))
  const other = { id: 'uncategorised', name: otherName, items: [] }
  for (const item of items) (byId.get(item.categoryId) ?? other).items.push(item)
  if (other.items.length) groups.push(other)
  return groups.filter((group) => group.items.length)
}

export function visibleMenuSection(positions, anchor, atBottom = false) {
  if (!positions.length) return 'all'
  if (atBottom) return positions.at(-1).id
  let active = 'all'
  for (const section of positions) {
    if (section.top > anchor + 2) break
    active = section.id
  }
  return active
}
