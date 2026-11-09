import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SHIFTS, advanceShift, createQueue, createShift, currentReceipt,
  distributeMorning, makePractice, morningPhase, normalizeSettings,
  submitAnswer, summarizeShift, worldAt,
} from '../dist/game.js';
import { checkAnswer, formatAmount } from '../dist/numbers.js';

const data = JSON.parse(await readFile(new URL('../dist/data.json', import.meta.url), 'utf8'));
const customers = new Map(data.customers.map(customer => [customer.id, customer]));
const products = new Map(data.products.map(product => [product.id, product]));
const TYPES = ['morning', 'day', 'evening', 'night'];
const START = 1_800_000_000_000;

// Seeded PRNG makes the fixtures repeatable without replacing global randomness.
function rng(seed = 123456789) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(1664525, value) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shiftOf(options = {}) {
  return createShift(data, { length: 10, mode: 'number_and_currency', ...options }, 'morning', {}, rng(42), START);
}

// Independent expected 20%/20%/60% apportionment for each supported target.
// Largest remainders receive spare places; ties give runners priority over walkers.
const MORNING_COUNTS = [
  [2, 2, 6], [2, 2, 7], [3, 2, 7], [3, 2, 8], [3, 3, 8],
  [3, 3, 9], [3, 3, 10], [4, 3, 10], [4, 3, 11], [4, 4, 11],
  [4, 4, 12], [4, 4, 13], [5, 4, 13], [5, 4, 14], [5, 5, 14],
  [5, 5, 15], [5, 5, 16], [6, 5, 16], [6, 5, 17], [6, 6, 17],
  [6, 6, 18], [6, 6, 19], [7, 6, 19], [7, 6, 20], [7, 7, 20],
  [7, 7, 21], [7, 7, 22], [8, 7, 22], [8, 7, 23], [8, 8, 23], [8, 8, 24],
];

test('catalog IDs, prices and every prescribed basket are valid and convertible', () => {
  assert.equal(data.customers.length, 100);
  assert.equal(customers.size, data.customers.length);
  assert.equal(products.size, data.products.length);
  for (const product of data.products) {
    assert.ok(Number.isInteger(product.price) && product.price > 0, product.id);
  }
  for (const customer of data.customers) {
    assert.ok(customer.basket.length > 0, customer.id);
    let total = 0;
    for (const item of customer.basket) {
      assert.ok(products.has(item.productId), `${customer.id}: ${item.productId}`);
      assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 5, customer.id);
      total += products.get(item.productId).price * item.quantity;
    }
    assert.ok(total >= 1 && total <= 999999, `${customer.id}: ${total}`);
  }
  // Two independently calculated examples: 2 × 1700 + 1900; 1800 + 2600.
  const sum = id => customers.get(id).basket.reduce((n, item) => n + products.get(item.productId).price * item.quantity, 0);
  assert.equal(sum('npc-001'), 5300);
  assert.equal(sum('npc-002'), 4400);
});

test('all integer targets 10–40 produce exact unique queues in every shift', () => {
  for (let target = 10; target <= 40; target += 1) {
    assert.equal(normalizeSettings({ length: target }).length, target);
    for (const type of TYPES) {
      for (const seed of [1, 42, 98765]) {
        const queue = createQueue(data.customers, type, target, rng(seed));
        assert.equal(queue.length, target, `${type}/${target}/${seed}`);
        assert.equal(new Set(queue).size, target, `${type}/${target}/${seed}: duplicates`);
        assert.ok(queue.every(id => customers.has(id)));
        assert.deepEqual(createQueue(data.customers, type, target, rng(seed)), queue);
        if (type === 'night') assert.ok(queue.every(id => customers.get(id).age >= 18), `night/${target}`);
      }
    }
  }
});

test('morning has runners, then dog walkers, then strictly interleaved office workers and pupils', () => {
  for (let target = 10; target <= 40; target += 1) {
    const [runners, walkers, rush] = MORNING_COUNTS[target - 10];
    assert.deepEqual(distributeMorning(target), [runners, walkers, rush], String(target));
    for (const random of [() => 0, () => 0.999999, rng(target)]) {
      const queue = createQueue(data.customers, 'morning', target, random).map(id => customers.get(id));
      assert.ok(queue.slice(0, runners).every(customer => customer.role === 'runners'));
      assert.ok(queue.slice(runners, runners + walkers).every(customer => customer.role === 'dog_walkers'));
      const rushRoles = queue.slice(runners + walkers).map(customer => customer.role);
      assert.equal(rushRoles.length, rush);
      assert.ok(rushRoles.every(role => ['office_workers', 'school_pupils'].includes(role)));
      for (let i = 1; i < rushRoles.length; i += 1) assert.notEqual(rushRoles[i], rushRoles[i - 1], `${target}: rush must alternate`);
      assert.ok(Math.abs(rushRoles.filter(role => role === 'office_workers').length - rushRoles.filter(role => role === 'school_pupils').length) <= 1);
    }
    assert.equal(morningPhase({ type: 'morning', target, index: runners - 1 }), 'Раннее утро · после пробежки');
    assert.equal(morningPhase({ type: 'morning', target, index: runners }), 'Утренняя прогулка');
    assert.equal(morningPhase({ type: 'morning', target, index: runners + walkers }), 'Перед работой и школой');
  }
  const firstRushRole = random => customers.get(createQueue(data.customers, 'morning', 20, random)[8]).role;
  assert.equal(firstRushRole(() => 0), 'office_workers');
  assert.equal(firstRushRole(() => 0.999999), 'school_pupils');
});

test('fresh and repeat-visit baskets have exact arithmetic, valid quantities and converter-safe totals', () => {
  const visited = Object.fromEntries(data.customers.map(customer => [customer.id, 1]));
  const catalogSnapshot = JSON.stringify(data);
  for (let target = 10; target <= 40; target += 1) {
    for (const type of TYPES) {
      for (const visits of [{}, visited]) {
        for (const mode of ['number_only', 'number_and_currency']) {
          const shift = createShift(data, { length: target, mode }, type, visits, rng(target * 17), START);
          assert.equal(shift.target, target);
          assert.equal(shift.receipts.length, target);
          assert.equal(new Set(shift.receipts.map(receipt => receipt.id)).size, target);
          for (const [index, receipt] of shift.receipts.entries()) {
            assert.equal(receipt.number, index + 1);
            assert.equal(receipt.mode, mode);
            assert.ok(receipt.items.length > 0);
            let expectedTotal = 0;
            for (const item of receipt.items) {
              const product = products.get(item.productId);
              assert.ok(product);
              assert.equal(item.price, product.price);
              assert.ok(Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 5);
              assert.equal(item.lineTotal, product.price * item.quantity);
              expectedTotal += product.price * item.quantity;
            }
            assert.equal(receipt.total, expectedTotal);
            assert.ok(Number.isInteger(receipt.total) && receipt.total > 0 && receipt.total <= 999999);
            assert.equal(checkAnswer(receipt.canonical, receipt.total, mode).correct, true);
            if (!visits[receipt.customerId]) {
              assert.deepEqual(receipt.items.map(({ productId, quantity }) => ({ productId, quantity })), customers.get(receipt.customerId).basket);
            }
          }
        }
      }
    }
  }
  assert.equal(JSON.stringify(data), catalogSnapshot, 'creating receipts must not mutate the catalog');
  assert.ok(Object.values(visited).every(count => count === 1), 'creating shifts must not mutate visit history');
});

test('several errors and one successful retry count as one completed receipt with errors', () => {
  const shift = shiftOf();
  const receipt = currentReceipt(shift);
  assert.equal(advanceShift(shift), false, 'unpaid receipt cannot be skipped');
  for (const answer of ['ошибка', '5000 төгрөг', 'tavan']) {
    assert.equal(submitAnswer(shift, answer, START + 1).status, 'incorrect');
    assert.equal(shift.completedCount, 0);
    assert.equal(shift.index, 0);
    assert.equal(summarizeShift(shift).total, 0);
  }
  assert.equal(receipt.attempts.length, 3);
  assert.equal(submitAnswer(shift, receipt.canonical, START + 2).status, 'paid');
  assert.equal(receipt.attempts.length, 4);
  assert.equal(receipt.hasErrors, true);
  assert.equal(shift.completedCount, 1);
  assert.deepEqual(summarizeShift(shift), { total: 1, withoutErrors: 0, withErrors: 1, target: 10, finished: false });
  assert.equal(advanceShift(shift), true);
  assert.equal(shift.index, 1);
  assert.equal(submitAnswer(shift, currentReceipt(shift).canonical, START + 3).status, 'paid');
  assert.deepEqual(summarizeShift(shift), { total: 2, withoutErrors: 1, withErrors: 1, target: 10, finished: false });
});

test('correct double submit is idempotent and final payment ends the shift exactly once', () => {
  const shift = shiftOf();
  for (let index = 0; index < 10; index += 1) {
    const receipt = currentReceipt(shift);
    assert.equal(shift.index, index);
    assert.equal(submitAnswer(shift, receipt.canonical, START + index + 1).status, 'paid');
    const paidSnapshot = JSON.stringify(shift);
    assert.equal(submitAnswer(shift, receipt.canonical, START + 100).status, 'already-complete');
    assert.equal(JSON.stringify(shift), paidSnapshot);
    assert.equal(receipt.attempts.length, 1);
    assert.equal(shift.completedCount, index + 1);
    assert.equal(advanceShift(shift), index === 9 ? 'finished' : true);
    if (index < 9) assert.equal(shift.completedAt, null);
  }
  assert.equal(shift.index, 9);
  assert.equal(shift.completedAt, START + 10);
  assert.deepEqual(summarizeShift(shift), { total: 10, withoutErrors: 10, withErrors: 0, target: 10, finished: true });
  assert.equal(advanceShift(shift), 'finished');
  assert.equal(submitAnswer(shift, 'ошибка').status, 'already-complete');
  assert.equal(shift.receipts.reduce((count, receipt) => count + receipt.attempts.length, 0), 10);
});

test('whitespace-only submissions never create an attempt or change progress/draft', () => {
  const shift = shiftOf();
  const before = JSON.stringify(shift);
  for (const answer of ['', ' ', '\n\t\r', '\u00a0\u2003']) {
    assert.equal(submitAnswer(shift, answer).status, 'empty');
    assert.equal(JSON.stringify(shift), before);
  }
  submitAnswer(shift, 'ошибка', START + 1);
  const afterError = JSON.stringify(shift);
  assert.equal(submitAnswer(shift, ' \n ').status, 'empty');
  assert.equal(JSON.stringify(shift), afterError);
});

test('practice resets its own attempts and does not mutate source shift or stored history', () => {
  const original = shiftOf();
  const source = currentReceipt(original);
  submitAnswer(original, 'ошибка', START + 1);
  submitAnswer(original, source.canonical, START + 2);
  const history = [original];
  const historySnapshot = JSON.stringify(history);
  const practice = makePractice(original, source.id, START + 3);
  assert.equal(practice.isPractice, true);
  assert.equal(practice.target, 1);
  assert.equal(practice.sourceShiftId, original.id);
  assert.equal(practice.sourceReceiptId, source.id);
  assert.equal(practice.completedCount, 0);
  assert.equal(practice.completedAt, null);
  const replay = currentReceipt(practice);
  assert.notEqual(replay, source);
  assert.notEqual(replay.items, source.items);
  assert.notEqual(replay.items[0], source.items[0]);
  assert.equal(replay.mode, source.mode);
  assert.equal(replay.total, source.total);
  assert.deepEqual(replay.attempts, []);
  assert.equal(replay.completed, false);
  assert.equal(replay.hasErrors, false);
  submitAnswer(practice, 'ошибка', START + 4);
  submitAnswer(practice, replay.canonical, START + 5);
  assert.equal(advanceShift(practice), 'finished');
  assert.deepEqual(summarizeShift(practice), { total: 1, withoutErrors: 0, withErrors: 1, target: 1, finished: true });
  assert.equal(JSON.stringify(history), historySnapshot);
  assert.throws(() => makePractice(original, 'missing-receipt'), /Чек не найден/u);
});

test('answer modes are copied per receipt and remain fixed after settings change', () => {
  for (const mode of ['number_only', 'number_and_currency']) {
    const settings = { length: 10, mode };
    const shift = createShift(data, settings, 'day', {}, rng(12), START);
    const otherMode = mode === 'number_only' ? 'number_and_currency' : 'number_only';
    settings.mode = otherMode;
    settings.length = 40;
    assert.equal(shift.target, 10);
    assert.ok(shift.receipts.every(receipt => receipt.mode === mode));
    const receipt = currentReceipt(shift);
    // Even a changed top-level preference cannot alter the pending receipt.
    shift.mode = otherMode;
    assert.equal(submitAnswer(shift, formatAmount(receipt.total, otherMode), START + 1).status, 'incorrect');
    assert.equal(submitAnswer(shift, formatAmount(receipt.total, mode), START + 2).status, 'paid');
    assert.equal(receipt.mode, mode);
    assert.equal(receipt.attempts.length, 2);
    assert.equal(receipt.hasErrors, true);
  }
});

test('product-language preference defaults to Russian and captures all Mongolian catalog names', () => {
  assert.equal(normalizeSettings().productLanguage, 'ru');
  assert.equal(normalizeSettings({ productLanguage: 'ru' }).productLanguage, 'ru');
  assert.equal(normalizeSettings({ productLanguage: 'mn' }).productLanguage, 'mn');
  assert.equal(normalizeSettings({ productLanguage: 'unknown' }).productLanguage, 'ru');
  assert.ok(data.products.every(product => typeof product.name_mn === 'string' && product.name_mn.trim().length > 0));

  const visited = Object.fromEntries(data.customers.map(customer => [customer.id, 1]));
  for (const mode of ['number_only', 'number_and_currency']) {
    for (const type of TYPES) {
      for (const visits of [{}, visited]) {
        const russian = createShift(data, { length: 40, mode, productLanguage: 'ru' }, type, visits, rng(2026), START);
        const mongolian = createShift(data, { length: 40, mode, productLanguage: 'mn' }, type, visits, rng(2026), START);
        assert.equal(mongolian.productLanguage, 'mn');
        assert.equal(russian.productLanguage, 'ru');
        for (let i = 0; i < russian.receipts.length; i += 1) {
          const ru = russian.receipts[i];
          const mn = mongolian.receipts[i];
          assert.equal(mn.customerId, ru.customerId);
          assert.equal(mn.productLanguage, 'mn');
          assert.equal(ru.productLanguage, 'ru');
          assert.equal(mn.total, ru.total, 'language must not change the sale amount');
          assert.equal(mn.mode, ru.mode);
          assert.equal(mn.canonical, ru.canonical, 'language must not change the expected numeral answer');
          assert.equal(mn.items.length, ru.items.length);
          for (let j = 0; j < ru.items.length; j += 1) {
            const ruItem = ru.items[j];
            const mnItem = mn.items[j];
            const catalogItem = products.get(ruItem.productId);
            assert.equal(mnItem.name, catalogItem.name_mn);
            assert.equal(ruItem.name, catalogItem.name_ru);
            assert.deepEqual(
              { ...mnItem, name: undefined },
              { ...ruItem, name: undefined },
              'only the product label changes'
            );
          }
        }
      }
    }
  }
});

test('Mongolian product names survive settings changes, saved history and isolated practice', () => {
  const settings = { length: 10, mode: 'number_and_currency', productLanguage: 'mn' };
  const original = createShift(data, settings, 'morning', {}, rng(99), START);
  const labels = original.receipts.map(receipt => receipt.items.map(item => item.name));
  settings.productLanguage = 'ru';
  assert.equal(original.productLanguage, 'mn');
  assert.ok(original.receipts.every(receipt => receipt.productLanguage === 'mn'));
  assert.deepEqual(original.receipts.map(receipt => receipt.items.map(item => item.name)), labels);
  const receipt = currentReceipt(original);
  submitAnswer(original, 'ошибка', START + 1);
  submitAnswer(original, receipt.canonical, START + 2);

  // JSON serialization models the actual persisted browser history boundary.
  const history = JSON.parse(JSON.stringify([original]));
  const saved = history[0];
  assert.equal(saved.productLanguage, 'mn');
  assert.deepEqual(saved.receipts.map(item => item.items.map(product => product.name)), labels);
  const beforePractice = JSON.stringify(history);
  const practice = makePractice(saved, saved.receipts[0].id, START + 3);
  assert.equal(practice.productLanguage, 'mn');
  const replay = currentReceipt(practice);
  assert.equal(replay.productLanguage, 'mn');
  assert.deepEqual(replay.items.map(item => item.name), labels[0]);
  assert.equal(replay.total, receipt.total);
  assert.equal(replay.canonical, receipt.canonical);
  submitAnswer(practice, replay.canonical, START + 4);
  assert.equal(JSON.stringify(history), beforePractice, 'practice cannot rewrite saved product-language labels or history');
});

test('world timeline follows dawn/day/evening/night boundaries and clamps progress', () => {
  const checkpoints = [
    ['morning', 0, 'dawn', 'morning', 0],
    ['morning', .225, 'dawn', 'morning', .5],
    ['morning', .45, 'morning', 'day', 0],
    ['morning', .725, 'morning', 'day', .5],
    ['morning', 1, 'day', 'day', 0],
    ['day', 0, 'day', 'day', 0],
    ['day', .65, 'day', 'evening', 0],
    ['day', .825, 'day', 'evening', .5],
    ['day', 1, 'evening', 'evening', 0],
    ['evening', 0, 'evening', 'night', 0],
    ['evening', .4, 'evening', 'night', .5],
    ['evening', .8, 'night', 'night', 0],
    ['evening', 1, 'night', 'night', 0],
    ['night', 0, 'night', 'night', 0],
    ['night', .7, 'night', 'dawn', 0],
    ['night', .85, 'night', 'dawn', .5],
    ['night', 1, 'dawn', 'dawn', 0],
  ];
  for (const [type, progress, from, to, blend] of checkpoints) {
    const actual = worldAt(type, progress);
    assert.equal(actual.from, from, `${type}/${progress}`);
    assert.equal(actual.to, to, `${type}/${progress}`);
    assert.ok(Math.abs(actual.blend - blend) < 1e-12, `${type}/${progress}: ${actual.blend}`);
  }
  for (const type of TYPES) {
    assert.deepEqual(worldAt(type, -1), worldAt(type, 0));
    assert.deepEqual(worldAt(type, 2), worldAt(type, 1));
  }
  assert.equal(SHIFTS.morning.next, 'day');
  assert.equal(SHIFTS.day.next, 'evening');
  assert.equal(SHIFTS.evening.next, 'night');
  assert.equal(SHIFTS.night.next, 'morning');
});
