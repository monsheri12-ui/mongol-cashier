import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShift, currentReceipt, normalizeSettings, makePractice, submitAnswer } from '../dist/game.js';
import { receiptCopy, receiptUnit, receiptName } from '../dist/receipt.js';

const data = JSON.parse(await readFile(new URL('../dist/data.json', import.meta.url), 'utf8'));

test('full Mongolian receipt overrides Russian product preference without changing answers or amounts', () => {
  assert.equal(normalizeSettings().receiptLanguage, 'ru');
  assert.equal(normalizeSettings({ receiptLanguage: 'unknown' }).receiptLanguage, 'ru');
  for (const mode of ['number_only', 'number_and_currency']) {
    const settings = { length: 10, mode, productLanguage: 'ru' };
    const ru = createShift(data, settings, 'morning', {}, () => .25, 100);
    const mn = createShift(data, { ...settings, receiptLanguage: 'mn' }, 'morning', {}, () => .25, 100);
    assert.equal(mn.receiptLanguage, 'mn');
    assert.equal(mn.productLanguage, 'mn');
    for (let index = 0; index < mn.receipts.length; index += 1) {
      const receipt = mn.receipts[index];
      assert.equal(receipt.receiptLanguage, 'mn');
      assert.equal(receipt.mode, mode);
      assert.equal(receipt.total, ru.receipts[index].total);
      assert.equal(receipt.canonical, ru.receipts[index].canonical);
      for (const item of receipt.items) assert.equal(item.name, data.products.find(p => p.id === item.productId).name_mn);
    }
  }
});

test('three language choices remain distinct, including legacy saved product-only receipts', () => {
  const ru = { productLanguage: 'ru', receiptLanguage: 'ru' };
  const names = { productLanguage: 'mn' };
  const full = { productLanguage: 'mn', receiptLanguage: 'mn' };
  assert.equal(receiptCopy(ru).receipt, 'Чек');
  assert.equal(receiptCopy(names).total, 'Итого');
  assert.equal(receiptCopy(full).receipt, 'Баримт');
  assert.equal(receiptCopy(full).purchase, 'Барааны нэр');
  assert.equal(receiptCopy(full).total, 'Нийт дүн');
  const banana = { productId: 'banana', name: 'Гадил (багц)', unit: 'связ.' };
  assert.equal(receiptName(banana, ru), 'Бананы, связка');
  assert.equal(receiptName(banana, names), 'Гадил (багц)');
  assert.equal(receiptUnit(banana, names), 'связ.');
  assert.equal(receiptUnit(banana, full), 'багц');
});

test('all 47 catalog items have localized trade units in a full Mongolian receipt', () => {
  const receipt = { receiptLanguage: 'mn', productLanguage: 'mn' };
  for (const product of data.products) {
    const unit = receiptUnit({ ...product, productId: product.id }, receipt);
    const expected = product.id === 'banana' ? 'багц' : ['apple','pear','orange','carrot','potato','cucumber','tomato','onion'].includes(product.id) ? 'кг' : 'ш';
    assert.equal(unit, expected, product.id);
    assert.equal(receiptUnit({ ...product, productId: product.id }, { receiptLanguage: 'ru' }), product.id === 'banana' ? 'связ.' : product.unit);
  }
});

test('full receipt language survives history and practice independently of new menu settings', () => {
  const settings = { length: 10, receiptLanguage: 'mn', mode: 'number_only' };
  const shift = createShift(data, settings, 'morning', {}, () => .5, 200);
  settings.receiptLanguage = 'ru';
  const receipt = currentReceipt(shift);
  submitAnswer(shift, 'ошибка', 201);
  submitAnswer(shift, receipt.canonical, 202);
  const saved = JSON.parse(JSON.stringify(shift));
  const before = JSON.stringify(saved);
  const practice = makePractice(saved, saved.receipts[0].id, 203);
  assert.equal(practice.receiptLanguage, 'mn');
  assert.equal(receiptCopy(currentReceipt(practice)).lang, 'mn');
  assert.equal(receiptCopy(currentReceipt(practice)).paid, 'Төлөгдсөн');
  submitAnswer(practice, currentReceipt(practice).canonical, 204);
  assert.equal(JSON.stringify(saved), before);
});
