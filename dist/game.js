import { checkAnswer, formatAmount } from './numbers.js';

export const SHIFTS = {
  morning: { label: 'Утренняя смена', short: 'Утро', action: 'Открыть утреннюю смену', icon: 'sunrise', next: 'day', world: 'dawn', customer: 'npc-042' },
  day: { label: 'Дневная смена', short: 'День', action: 'Открыть дневную смену', icon: 'sun', next: 'evening', world: 'day', customer: 'npc-064' },
  evening: { label: 'Вечерняя смена', short: 'Вечер', action: 'Открыть вечернюю смену', icon: 'sunset', next: 'night', world: 'evening', customer: 'npc-046' },
  night: { label: 'Ночная смена', short: 'Ночь', action: 'Открыть ночную смену', icon: 'moon', next: 'morning', world: 'night', customer: 'npc-071' },
};

export function normalizeSettings(value = {}) {
  return {
    length: Math.min(40, Math.max(10, Math.round(Number(value.length) || 20))),
    mode: value.mode === 'number_only' ? 'number_only' : 'number_and_currency',
    sound: value.sound !== false,
    productLanguage: value.receiptLanguage === 'mn' || value.productLanguage === 'mn' ? 'mn' : 'ru',
    receiptLanguage: value.receiptLanguage === 'mn' ? 'mn' : 'ru',
  };
}

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function distributeMorning(target) {
  const exact = [.2, .2, .6].map(weight => weight * target);
  const counts = exact.map(Math.floor);
  const order = [0, 1, 2].sort((a, b) => (exact[b] - counts[b]) - (exact[a] - counts[a]) || a - b);
  for (const i of order.slice(0, target - counts.reduce((a, b) => a + b, 0))) counts[i] += 1;
  return counts;
}

export function createQueue(customers, type, target, random = Math.random) {
  if (!SHIFTS[type]) throw new Error('Неизвестная смена.');
  if (type !== 'morning') {
    const pool = type === 'night' ? customers.filter(c => c.age >= 18) : customers;
    if (pool.length < target) throw new Error('В каталоге недостаточно покупателей.');
    return shuffle(pool, random).slice(0, target).map(c => c.id);
  }
  const [runnerCount, walkerCount, rushCount] = distributeMorning(target);
  const runners = shuffle(customers.filter(c => c.role === 'runners'), random).slice(0, runnerCount);
  const walkers = shuffle(customers.filter(c => c.role === 'dog_walkers'), random).slice(0, walkerCount);
  const office = shuffle(customers.filter(c => c.role === 'office_workers'), random);
  const pupils = shuffle(customers.filter(c => c.role === 'school_pupils'), random);
  const rush = [];
  const pupilFirst = random() > .5;
  for (let i = 0; i < rushCount; i += 1) {
    const wantPupil = (i % 2 === 0) === pupilFirst;
    const preferred = wantPupil ? pupils : office;
    const alternative = wantPupil ? office : pupils;
    const customer = preferred.shift() || alternative.shift();
    if (customer) rush.push(customer);
  }
  const result = [...runners, ...walkers, ...rush].map(c => c.id);
  if (result.length !== target || new Set(result).size !== target) throw new Error('Не удалось собрать очередь покупателей.');
  return result;
}

const SNACKS = ['bread', 'milk', 'apple', 'banana', 'water', 'juice', 'yogurt', 'bun', 'cookies', 'cheese', 'wafer', 'crackers', 'pear', 'orange'];
const RUNNER_PRODUCTS = ['water', 'banana', 'yogurt', 'oatmeal', 'apple', 'pear', 'cereal'];
const OFFICE_PRODUCTS = ['takeaway_coffee', 'bun', 'yogurt', 'water', 'cookies', 'chocolate', 'milk', 'tea'];

function chooseBasket(customer, products, visits, random) {
  if (!visits[customer.id]) return customer.basket.map(item => ({ ...item }));
  let pool = products.map(p => p.id);
  if (customer.age < 18) pool = SNACKS;
  if (customer.role === 'runners') pool = RUNNER_PRODUCTS;
  if (customer.role === 'office_workers' && random() < .65) pool = OFFICE_PRODUCTS;
  const size = customer.age < 18 ? 2 + Math.floor(random() * 2) : 2 + Math.floor(random() * 4);
  let chosen = shuffle(pool, random).slice(0, size);
  if (customer.role === 'dog_walkers' && random() < .5) chosen = ['petfood', ...chosen.filter(id => id !== 'petfood')].slice(0, size);
  return chosen.map(productId => ({ productId, quantity: ['apple', 'banana', 'carrot', 'potato', 'pear', 'orange', 'bun'].includes(productId) ? 1 + Math.floor(random() * 3) : 1 }));
}

export function createShift(data, settings, type, visits = {}, random = Math.random, now = Date.now()) {
  const clean = normalizeSettings(settings);
  const queue = createQueue(data.customers, type, clean.length, random);
  const customers = new Map(data.customers.map(c => [c.id, c]));
  const products = new Map(data.products.map(p => [p.id, p]));
  const id = globalThis.crypto?.randomUUID?.() || `shift-${now}-${Math.floor(random() * 1e9)}`;
  const receipts = queue.map((customerId, index) => {
    const customer = customers.get(customerId);
    const items = chooseBasket(customer, data.products, visits, random).map(item => {
      const product = products.get(item.productId);
      if (!product) throw new Error('Товар отсутствует в каталоге.');
      const quantity = Math.min(5, Math.max(1, Math.round(item.quantity)));
      return { productId: product.id, name: clean.productLanguage === 'mn' ? product.name_mn || product.name_ru : product.name_ru, unit: product.unit, quantity, price: product.price, lineTotal: product.price * quantity };
    });
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    return { id: `${id}-receipt-${index + 1}`, number: index + 1, customerId, customerTitle: customer.title, items, total, mode: clean.mode, productLanguage: clean.productLanguage, receiptLanguage: clean.receiptLanguage, attempts: [], completed: false, hasErrors: false, completedAt: null, canonical: formatAmount(total, clean.mode) };
  });
  return { id, type, target: clean.length, mode: clean.mode, productLanguage: clean.productLanguage, receiptLanguage: clean.receiptLanguage, startedAt: now, completedAt: null, index: 0, completedCount: 0, draftAnswer: '', receipts };
}

export function currentReceipt(shift) { return shift.receipts[shift.index]; }

export function submitAnswer(shift, rawAnswer, now = Date.now()) {
  const receipt = currentReceipt(shift);
  if (!receipt || receipt.completed) return { status: 'already-complete', receipt };
  if (!String(rawAnswer).trim()) return { status: 'empty', receipt };
  const result = checkAnswer(rawAnswer, receipt.total, receipt.mode);
  receipt.attempts.push({ rawAnswer: String(rawAnswer), correct: result.correct, at: now, reason: result.reason, differences: result.differences });
  receipt.hasErrors ||= !result.correct;
  if (result.correct) {
    receipt.completed = true;
    receipt.completedAt = now;
    receipt.canonical = result.canonical;
    shift.completedCount = shift.receipts.filter(r => r.completed).length;
    shift.draftAnswer = '';
    if (shift.completedCount === shift.target) shift.completedAt = now;
  } else {
    shift.draftAnswer = String(rawAnswer);
  }
  return { status: result.correct ? 'paid' : 'incorrect', result, receipt };
}

export function advanceShift(shift) {
  const receipt = currentReceipt(shift);
  if (!receipt?.completed) return false;
  if (shift.index >= shift.target - 1) return 'finished';
  shift.index += 1;
  shift.draftAnswer = '';
  return true;
}

export function summarizeShift(shift) {
  const completed = shift.receipts.filter(r => r.completed);
  const withErrors = completed.filter(r => r.hasErrors).length;
  return { total: completed.length, withoutErrors: completed.length - withErrors, withErrors, target: shift.target, finished: completed.length === shift.target };
}

export function makePractice(shift, receiptId, now = Date.now()) {
  const original = shift.receipts.find(r => r.id === receiptId);
  if (!original) throw new Error('Чек не найден.');
  const receipt = structuredClone(original);
  receipt.attempts = [];
  receipt.completed = false;
  receipt.completedAt = null;
  receipt.hasErrors = false;
  return { id: `practice-${now}`, sourceShiftId: shift.id, sourceReceiptId: original.id, type: shift.type, target: 1, mode: original.mode, productLanguage: original.productLanguage || shift.productLanguage || 'ru', receiptLanguage: original.receiptLanguage || shift.receiptLanguage || 'ru', startedAt: now, completedAt: null, index: 0, completedCount: 0, draftAnswer: '', isPractice: true, receipts: [receipt] };
}

export function morningPhase(shift) {
  if (shift.type !== 'morning') return ({ day: 'Дневные покупки', evening: 'Вечерние покупки', night: '' })[shift.type];
  const [runners, walkers] = distributeMorning(shift.target);
  if (shift.index < runners) return 'Раннее утро · после пробежки';
  if (shift.index < runners + walkers) return 'Утренняя прогулка';
  return 'Перед работой и школой';
}

export function worldAt(type, progress = 0) {
  const p = Math.max(0, Math.min(1, progress));
  const stops = {
    morning: [[0, 'dawn'], [.45, 'morning'], [1, 'day']],
    day: [[0, 'day'], [.65, 'day'], [1, 'evening']],
    evening: [[0, 'evening'], [.8, 'night'], [1, 'night']],
    night: [[0, 'night'], [.7, 'night'], [1, 'dawn']],
  }[type] || [[0, 'evening'], [1, 'evening']];
  const right = stops.findIndex(([at]) => at > p);
  if (right < 0) return { from: stops.at(-1)[1], to: stops.at(-1)[1], blend: 0 };
  const a = stops[Math.max(0, right - 1)], b = stops[right];
  return { from: a[1], to: b[1], blend: b[0] === a[0] ? 0 : (p - a[0]) / (b[0] - a[0]) };
}
