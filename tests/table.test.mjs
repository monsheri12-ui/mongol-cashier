import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkoutSurface, layoutPurchases } from '../dist/table.js';
import { createShift } from '../dist/game.js';

const data = JSON.parse(await readFile(new URL('../dist/data.json', import.meta.url), 'utf8'));
const atlas = JSON.parse(await readFile(new URL('../dist/assets/product-atlas.json', import.meta.url), 'utf8'));
const EPSILON = 1e-7;
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 855, height: 774 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'large desktop', width: 1920, height: 1080 },
  { name: 'ultrawide', width: 2560, height: 1080 },
];

function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function overlaps(a, b) {
  return Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > EPSILON &&
    Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > EPSILON;
}

function contained(rect, outer, label) {
  assert.ok(rect.left >= outer.left - EPSILON, `${label}: left ${rect.left} < ${outer.left}`);
  assert.ok(rect.top >= outer.top - EPSILON, `${label}: top ${rect.top} < ${outer.top}`);
  assert.ok(rect.left + rect.width <= outer.left + outer.width + EPSILON, `${label}: right ${rect.left + rect.width} > ${outer.left + outer.width}`);
  assert.ok(rect.top + rect.height <= outer.top + outer.height + EPSILON, `${label}: bottom ${rect.top + rect.height} > ${outer.top + outer.height}`);
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= EPSILON, `${label}: ${actual} != ${expected}`);
}

function placement(viewport) {
  const surface = checkoutSurface(viewport.width, viewport.height);
  const width = surface.width * surface.stageWidth;
  const height = surface.height * surface.stageHeight;
  // The CSS stage is horizontally centered. Desktop cover images are centered
  // vertically; compact play scenes are attached to the top of the page.
  const stageLeft = (viewport.width - surface.stageWidth) / 2;
  const stageTop = surface.compact ? 0 : (viewport.height - surface.stageHeight) / 2;
  return {
    surface, width, height, stageLeft, stageTop,
    screen: {
      left: stageLeft + surface.left * surface.stageWidth,
      top: stageTop + surface.top * surface.stageHeight,
      width, height,
    },
  };
}

function receiptCard(viewport, layout) {
  // Independent screen-space exclusion derived from the receipt card's CSS.
  // Its entire vertical strip is reserved on desktop, including the outline.
  if (viewport.width <= 980) {
    const width = Math.min(570, viewport.width - 26);
    return { left: (viewport.width - width) / 2, top: layout.surface.stageHeight + 24, width, height: viewport.height };
  }
  const width = viewport.width >= 1600 ? 455 : viewport.width <= 1050 ? Math.min(390, .42 * viewport.width) : Math.min(430, .35 * viewport.width);
  const right = viewport.width >= 1600 ? 28 + .015 * viewport.width : viewport.width <= 1050 ? 20 : 28;
  return { left: viewport.width - right - width - 5, top: 0, width: width + 10, height: viewport.height };
}

// The new v2 artwork reserves the left quarter for scanner/printer/terminal.
// It is deliberately independent of the previous, narrower world-art manifest,
// which is replaced only once all five corresponding native plates are ready.
const EQUIPMENT = [
  { name: 'scanner/printer/terminal zone', left: 0, top: 0, width: .25, height: 1 },
];

function checkBasket(items, viewport, label) {
  const layout = placement(viewport);
  const units = layoutPurchases(items, atlas, layout.width, layout.height);
  const expected = new Map();
  for (const item of items) expected.set(item.productId, (expected.get(item.productId) || 0) + item.quantity);
  const actual = new Map();
  for (const unit of units) actual.set(unit.productId, (actual.get(unit.productId) || 0) + 1);
  assert.deepEqual(actual, expected, `${label}: physical count per SKU must equal receipt quantity`);
  assert.equal(units.length, items.reduce((total, item) => total + item.quantity, 0), label);

  const screenUnits = [];
  const footprints = [];
  for (const [index, unit] of units.entries()) {
    const name = `${label}/${unit.productId}/${index}`;
    for (const key of ['left', 'top', 'width', 'height', 'frameWidth', 'frameHeight', 'offsetX', 'offsetY']) {
      assert.ok(Number.isFinite(unit[key]), `${name}: ${key} must be finite`);
    }
    assert.ok(unit.width > 0 && unit.height > 0 && unit.frameWidth > 0 && unit.frameHeight > 0, `${name}: positive dimensions`);
    contained(unit, { left: 0, top: 0, width: layout.width, height: layout.height }, `${name}: full visible silhouette stays inside tabletop`);
    assert.ok(unit.footprint, `${name}: physical base footprint is required`);
    for (const key of ['left', 'top', 'width', 'height']) assert.ok(Number.isFinite(unit.footprint[key]), `${name}: finite footprint ${key}`);
    assert.ok(unit.footprint.width > 0 && unit.footprint.height > 0, `${name}: positive footprint`);
    contained(unit.footprint, { left: 0, top: 0, width: layout.width, height: layout.height }, `${name}: base rests inside tabletop`);
    footprints.push(unit.footprint);

    const metadata = atlas.products[unit.productId];
    const sheet = atlas.sheets.find(item => item.id === metadata.sheet);
    const bounds = metadata.bounds;
    // Verify the real alpha rectangle lands on the allotted unit rectangle,
    // while the full transparent sprite frame preserves its original aspect.
    close(unit.offsetX + bounds.x * unit.frameWidth, 0, `${name}: alpha left`);
    close(unit.offsetY + bounds.y * unit.frameHeight, 0, `${name}: alpha top`);
    close(bounds.width * unit.frameWidth, unit.width, `${name}: alpha width`);
    close(bounds.height * unit.frameHeight, unit.height, `${name}: alpha height`);
    close(unit.frameWidth / unit.frameHeight, (sheet.width / sheet.columns) / (sheet.height / sheet.rows), `${name}: undistorted artwork`);

    const screen = { left: layout.screen.left + unit.left, top: layout.screen.top + unit.top, width: unit.width, height: unit.height };
    contained(screen, { left: 0, top: 0, width: viewport.width, height: viewport.height }, `${name}: visible viewport containment`);
    assert.equal(overlaps(screen, receiptCard(viewport, layout)), false, `${name}: receipt card must remain clear`);
    for (const equipment of EQUIPMENT) {
      const forbidden = {
        left: layout.stageLeft + equipment.left * layout.surface.stageWidth,
        top: layout.stageTop + equipment.top * layout.surface.stageHeight,
        width: equipment.width * layout.surface.stageWidth,
        height: equipment.height * layout.surface.stageHeight,
      };
      assert.equal(overlaps(screen, forbidden), false, `${name}: overlaps ${equipment.name}`);
    }
    screenUnits.push(screen);
  }
  for (let i = 0; i < screenUnits.length; i += 1) {
    for (let j = i + 1; j < screenUnits.length; j += 1) {
      assert.equal(overlaps(screenUnits[i], screenUnits[j]), false, `${label}: visible silhouettes ${i} and ${j} overlap`);
      assert.equal(overlaps(footprints[i], footprints[j]), false, `${label}: base footprints ${i} and ${j} overlap`);
    }
  }
  return units;
}

test('real atlas alpha bounds cover every catalog SKU and are usable normalized rectangles', () => {
  for (const product of data.products) {
    const metadata = atlas.products[product.id];
    assert.ok(metadata, product.id);
    assert.ok(atlas.sheets.some(sheet => sheet.id === metadata.sheet), product.id);
    assert.ok(metadata.bounds, `${product.id}: measured bounds are required`);
    const { x, y, width, height } = metadata.bounds;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0, product.id);
    assert.ok(x + width <= 1 + EPSILON && y + height <= 1 + EPSILON, product.id);
  }
});

test('checkout surfaces fit the visible tabletop and leave viewport edges and receipt cards clear', async t => {
  for (const viewport of VIEWPORTS) {
    await t.test(`${viewport.name} ${viewport.width}×${viewport.height}`, () => {
      const layout = placement(viewport);
      assert.ok(layout.width > 0 && layout.height > 0);
      contained(layout.screen, { left: 16, top: 0, width: viewport.width - 32, height: viewport.height }, `${viewport.name}: surface`);
      // The open tabletop starts below the background's rear edge. Its bottom
      // cannot exceed the physical counter edge in the source artwork.
      assert.ok(layout.surface.left >= .28 - EPSILON, `${viewport.name}: left of v2 free tabletop`);
      assert.ok(layout.surface.left + layout.surface.width <= .75 + EPSILON, `${viewport.name}: right of v2 free tabletop`);
      assert.ok(layout.surface.top >= .64 - EPSILON, `${viewport.name}: above v2 tabletop`);
      assert.ok(layout.surface.top + layout.surface.height <= .97 + EPSILON, `${viewport.name}: below v2 counter`);
      assert.equal(overlaps(layout.screen, receiptCard(viewport, layout)), false, viewport.name);
    });
  }
});

test('quantity two creates exactly two independently positioned banana bunches at every viewport', async t => {
  for (const viewport of VIEWPORTS) {
    await t.test(viewport.name, () => {
      const units = checkBasket([{ productId: 'banana', quantity: 2 }], viewport, `two bananas/${viewport.name}`);
      assert.equal(units.length, 2);
      assert.deepEqual(units.map(unit => unit.unitIndex), [0, 1]);
      assert.ok(units[0].left !== units[1].left || units[0].top !== units[1].top, 'two bunches need distinct physical positions');
      close(units[0].top, units[1].top, 'two banana bunches sit side by side');
      assert.ok(units[0].left + units[0].width < units[1].left || units[1].left + units[1].width < units[0].left, 'separate side-by-side bunches');
      const layout = placement(viewport);
      assert.deepEqual(layoutPurchases([{ productId: 'banana', quantity: 2 }], atlas, layout.width, layout.height), units, 'placement is stable on rerender');
      const splitLines = checkBasket([{ productId: 'banana', quantity: 1 }, { productId: 'banana', quantity: 1 }], viewport, `split banana lines/${viewport.name}`);
      assert.deepEqual(splitLines, units, 'two lines of the same SKU still represent two grouped bunches');
    });
  }
});

test('all 100 actual baskets keep full silhouettes inside the v2 tabletop without overlaps', async t => {
  for (const viewport of VIEWPORTS) {
    await t.test(viewport.name, () => {
      for (const customer of data.customers) checkBasket(customer.basket, viewport, `${viewport.name}/${customer.id}`);
    });
  }
});

test('repeat-visit generated baskets also fit across viewports with the real product aspect bounds', async t => {
  const visits = Object.fromEntries(data.customers.map(customer => [customer.id, 1]));
  const baskets = ['morning', 'day', 'evening', 'night'].flatMap((type, index) => {
    const shift = createShift(data, { length: 40, mode: 'number_only' }, type, visits, rng(1234 + index), 1_800_000_000_000);
    return shift.receipts.map(receipt => ({ name: `${type}/${receipt.customerId}`, items: receipt.items }));
  });
  for (const viewport of VIEWPORTS) {
    await t.test(viewport.name, () => {
      for (const basket of baskets) checkBasket(basket.items, viewport, `${viewport.name}/repeat/${basket.name}`);
    });
  }
});

test('empty baskets produce no physical units', () => {
  assert.deepEqual(layoutPurchases([], atlas, 500, 180), []);
});
