/** Positions physical purchase units inside the visible checkout surface. */
export function checkoutSurface(viewportWidth, viewportHeight, layout = { left: .28, top: .645, width: .47, height: .325 }, reservedRight = 0) {
  const compact = viewportWidth <= 980;
  const stageWidth = compact ? Math.max(viewportWidth, viewportHeight * 16 / 9 * .52) : viewportHeight * 16 / 9;
  const stageHeight = stageWidth * 9 / 16;
  const offset = (stageWidth - viewportWidth) / 2;
  const cardWidth = viewportWidth >= 1600 ? 455 : viewportWidth <= 1050 ? Math.min(390, viewportWidth * .42) : Math.min(430, viewportWidth * .35);
  const rightSpace = (compact ? 16 : cardWidth + (viewportWidth >= 1600 ? 28 + viewportWidth * .015 : viewportWidth <= 1050 ? 20 : 28) + 15) + reservedRight;
  const left = Math.max(layout.left, (offset + 16) / stageWidth);
  const right = Math.min(layout.left + layout.width, (offset + viewportWidth - rightSpace) / stageWidth);
  return { compact, stageWidth, stageHeight, left, top: layout.top, width: Math.max(.08, right - left), height: layout.height };
}

const SMALL = new Set(['apple', 'pear', 'orange', 'tomato', 'onion', 'carrot', 'soap', 'sponge', 'butter', 'chocolate', 'cheese']);
const FLAT = new Set(['eggs', 'wafer', 'bun']);
const MEDIUM = new Set(['yogurt', 'sourcream', 'cottagecheese', 'tissues', 'takeaway_coffee', 'juice']);
const WEIGHED_PRODUCE = new Set(['apple','pear','orange','carrot','potato','cucumber','tomato','onion']);
export function isBaggedProduce(item) { return item.unit === 'кг' && WEIGHED_PRODUCE.has(item.productId); }

function factor(id) {
  if (id === 'banana') return .7;
  if (SMALL.has(id)) return .5;
  if (id === 'bread') return .8;
  if (FLAT.has(id)) return .65;
  if (MEDIUM.has(id)) return .72;
  return 1;
}

function packGroups(groups, width, height, gap, order) {
  const sorted = [...groups].sort((a,b) => order === 'height' ? b.height-a.height || b.width-a.width : order === 'width' ? b.width-a.width || b.height-a.height : b.width*b.height-a.width*a.height);
  const rows = [];
  let row = {groups:[],width:0,height:0};
  for (const group of sorted) {
    if (group.width > width || group.height > height) return null;
    if (row.groups.length && row.width + gap + group.width > width) {
      rows.push(row); row = {groups:[],width:0,height:0};
    }
    row.width += (row.groups.length ? gap : 0) + group.width;
    row.height = Math.max(row.height,group.height);
    row.groups.push(group);
  }
  if (row.groups.length) rows.push(row);
  const totalHeight = rows.reduce((sum,row)=>sum+row.height,0) + gap*(rows.length-1);
  if (totalHeight > height) return null;
  // Each row has a shared base. Small goods no longer float beside taller ones.
  let y = (height-totalHeight)*.65;
  const placed = [];
  for (const row of rows) {
    const breathingRoom = (width-row.width)/(row.groups.length+1);
    let x = breathingRoom;
    for (const group of row.groups) {
      placed.push({...group,left:x,top:y+row.height-group.height});
      x += group.width+gap+breathingRoom;
    }
    y += row.height+gap;
  }
  return placed;
}

/** Exact piece counts and weighed bags, stable bases, full silhouettes inside the worktop. */
export function layoutPurchases(items, atlas, surfaceWidth, surfaceHeight) {
  const quantities = new Map();
  for (const item of items) {
    const bagged = isBaggedProduce(item);
    const key = `${item.productId}:${bagged ? 'kg' : 'piece'}`;
    const group = quantities.get(key) || {productId:item.productId, quantity:0, bagWeight:0};
    if (bagged) { group.bagWeight += Math.max(0, Number(item.quantity) || 0); group.quantity = group.bagWeight > 0 ? 1 : 0; }
    else group.quantity += Math.max(0, Math.floor(item.quantity));
    quantities.set(key,group);
  }
  const groups = [...quantities.values()].filter(group => group.quantity > 0).map(({productId,quantity,bagWeight}) => {
    const metadata = atlas.products[productId];
    if (!metadata) throw new Error(`Нет изображения товара ${productId}`);
    const sheet = atlas.sheets.find(item => item.id === metadata.sheet);
    const bounds = bagWeight ? {x:0,y:0,width:1,height:1} : metadata.bounds || { x: .1, y: .1, width: .8, height: .8 };
    const cellAspect = (sheet.width / sheet.columns) / (sheet.height / sheet.rows);
    const aspect = bagWeight ? .77 : cellAspect * bounds.width / bounds.height;
    const unitHeight = Math.min(320, surfaceHeight * .75 * (bagWeight ? .9 : factor(productId)));
    const unitWidth = unitHeight * aspect;
    const columns = Math.min(quantity, 2), rows = Math.ceil(quantity / columns);
    return { productId, quantity, bagWeight, bounds, unitHeight, unitWidth, columns, rows };
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
      units.push({ productId: group.productId, unitIndex, bagWeight: group.bagWeight, left, top, width, height, frameWidth, frameHeight, offsetX: -group.bounds.x * frameWidth, offsetY: -group.bounds.y * frameHeight, zIndex: 1 + Math.round(top + height), renderScale: usedScale, footprint: { left: left + width * .12, top: top + height - footprintHeight, width: width * .76, height: footprintHeight } });
    }
  }
  return units;
}

