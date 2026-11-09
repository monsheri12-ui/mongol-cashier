/** Positions physical purchase units inside the visible checkout surface. */
export function checkoutSurface(viewportWidth, viewportHeight, layout = { left: .28, top: .645, width: .47, height: .325 }) {
  const compact = viewportWidth <= 980;
  const stageWidth = compact ? Math.max(viewportWidth, viewportHeight * 16 / 9 * .52) : viewportHeight * 16 / 9;
  const stageHeight = stageWidth * 9 / 16;
  const offset = (stageWidth - viewportWidth) / 2;
  const cardWidth = viewportWidth >= 1600 ? 455 : viewportWidth <= 1050 ? Math.min(390, viewportWidth * .42) : Math.min(430, viewportWidth * .35);
  const rightSpace = compact ? 16 : cardWidth + (viewportWidth >= 1600 ? 28 + viewportWidth * .015 : viewportWidth <= 1050 ? 20 : 28) + 15;
  const left = Math.max(layout.left, (offset + 16) / stageWidth);
  const right = Math.min(layout.left + layout.width, (offset + viewportWidth - rightSpace) / stageWidth);
  return { compact, stageWidth, stageHeight, left, top: layout.top, width: Math.max(.08, right - left), height: layout.height };
}

const SMALL = new Set(['apple', 'pear', 'orange', 'tomato', 'onion', 'carrot', 'soap', 'sponge', 'butter', 'chocolate', 'cheese']);
const FLAT = new Set(['eggs', 'wafer', 'bun']);
const MEDIUM = new Set(['yogurt', 'sourcream', 'cottagecheese', 'tissues', 'takeaway_coffee', 'juice']);

function factor(id) {
  if (id === 'banana') return .7;
  if (SMALL.has(id)) return .5;
  if (id === 'bread') return .8;
  if (FLAT.has(id)) return .65;
  if (MEDIUM.has(id)) return .72;
  return 1;
}

function contains(a, b) { return b.x >= a.x - .001 && b.y >= a.y - .001 && b.x + b.width <= a.x + a.width + .001 && b.y + b.height <= a.y + a.height + .001; }
function intersects(a, b) { return a.x < b.x + b.width - .001 && a.x + a.width > b.x + .001 && a.y < b.y + b.height - .001 && a.y + a.height > b.y + .001; }

function packGroups(groups, width, height, gap, order) {
  let free = [{ x: 0, y: 0, width, height }];
  const placed = [];
  const sorted = [...groups].sort((a, b) => order === 'height' ? b.height - a.height || b.width - a.width : order === 'width' ? b.width - a.width || b.height - a.height : b.width * b.height - a.width * a.height);
  for (const group of sorted) {
    const requested = { width: group.width + gap, height: group.height + gap };
    const choices = free.filter(r => r.width + .001 >= requested.width && r.height + .001 >= requested.height);
    choices.sort((a, b) => Math.min(a.width - requested.width, a.height - requested.height) - Math.min(b.width - requested.width, b.height - requested.height) || a.y - b.y || a.x - b.x);
    if (!choices.length) return null;
    const area = { x: choices[0].x, y: choices[0].y, ...requested };
    placed.push({ ...group, left: area.x, top: area.y });
    const split = [];
    for (const rectangle of free) {
      if (!intersects(rectangle, area)) { split.push(rectangle); continue; }
      if (area.x > rectangle.x) split.push({ ...rectangle, width: area.x - rectangle.x });
      if (area.x + area.width < rectangle.x + rectangle.width) split.push({ ...rectangle, x: area.x + area.width, width: rectangle.x + rectangle.width - area.x - area.width });
      if (area.y > rectangle.y) split.push({ ...rectangle, height: area.y - rectangle.y });
      if (area.y + area.height < rectangle.y + rectangle.height) split.push({ ...rectangle, y: area.y + area.height, height: rectangle.y + rectangle.height - area.y - area.height });
    }
    free = split.filter(r => r.width > .1 && r.height > .1).filter((r, i, all) => !all.some((other, j) => i !== j && contains(other, r) && (other.width > r.width + .001 || other.height > r.height + .001 || j < i)));
  }
  return placed;
}

/** Exact quantities, stable placement, full silhouettes inside the worktop. */
export function layoutPurchases(items, atlas, surfaceWidth, surfaceHeight) {
  const quantities = new Map();
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) || 0) + Math.max(0, Math.floor(item.quantity)));
  const groups = [...quantities].filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => {
    const metadata = atlas.products[productId];
    if (!metadata) throw new Error(`Нет изображения товара ${productId}`);
    const sheet = atlas.sheets.find(item => item.id === metadata.sheet);
    const bounds = metadata.bounds || { x: .1, y: .1, width: .8, height: .8 };
    const cellAspect = (sheet.width / sheet.columns) / (sheet.height / sheet.rows);
    const aspect = cellAspect * bounds.width / bounds.height;
    const unitHeight = Math.min(320, surfaceHeight * .75 * factor(productId));
    const unitWidth = unitHeight * aspect;
    const columns = Math.min(quantity, 2), rows = Math.ceil(quantity / columns);
    return { productId, quantity, bounds, unitHeight, unitWidth, columns, rows };
  });
  if (!groups.length) return [];
  const padding = Math.min(9, surfaceWidth * .016, surfaceHeight * .035);
  const initialGap = Math.min(9, Math.max(4, surfaceWidth * .014));
  let packed = null, usedScale = 1, usedGap = initialGap;
  for (let step = 0; step < 45 && !packed; step += 1) {
    const scale = 1 - step * .02;
    const gap = initialGap * (.55 + .45 * scale);
    const scaled = groups.map(group => ({ ...group, unitWidth: group.unitWidth * scale, unitHeight: group.unitHeight * scale, width: group.unitWidth * scale * group.columns + gap * (group.columns - 1), height: group.unitHeight * scale * group.rows + gap * (group.rows - 1) }));
    for (const order of ['height', 'area', 'width']) {
      packed = packGroups(scaled, surfaceWidth - 2 * padding, surfaceHeight - 2 * padding, gap, order);
      if (packed) { usedScale = scale; usedGap = gap; break; }
    }
  }
  if (!packed) throw new Error('Не удалось разместить покупки на столе.');
  const units = [];
  for (const group of packed) {
    for (let unitIndex = 0; unitIndex < group.quantity; unitIndex += 1) {
      const column = unitIndex % group.columns, row = Math.floor(unitIndex / group.columns);
      const left = padding + group.left + column * (group.unitWidth + usedGap);
      const top = padding + group.top + row * (group.unitHeight + usedGap);
      const width = group.unitWidth, height = group.unitHeight;
      const frameWidth = width / group.bounds.width, frameHeight = height / group.bounds.height;
      const footprintHeight = Math.min(8, height * .08);
      units.push({ productId: group.productId, unitIndex, left, top, width, height, frameWidth, frameHeight, offsetX: -group.bounds.x * frameWidth, offsetY: -group.bounds.y * frameHeight, zIndex: 1 + Math.round(top + height), renderScale: usedScale, footprint: { left: left + width * .12, top: top + height - footprintHeight, width: width * .76, height: footprintHeight } });
    }
  }
  return units;
}

