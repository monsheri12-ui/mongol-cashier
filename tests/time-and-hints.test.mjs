import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSettings, createShift, currentReceipt, submitAnswer, advanceShift, clockAt, addPlayTime, refreshUpcomingReceipts, recordHint, summarizeShift, makePractice } from '../dist/game.js';

const data = JSON.parse(await readFile(new URL('../dist/data.json', import.meta.url), 'utf8'));
const shiftOf = options => createShift(data, {length:10, ...options}, 'morning');
const pay = shift => submitAnswer(shift, currentReceipt(shift).canonical);

test('existing saves retain enabled hints and get a ten-minute clock; explicit preferences survive', () => {
  assert.equal(normalizeSettings().hints, true);
  assert.equal(normalizeSettings({hints:false}).hints, false);
  assert.equal(normalizeSettings({timeStepMinutes:1}).timeStepMinutes, undefined, 'the interval is not a user preference');
});

test('time advances by elapsed minutes at exact boundaries, independently of receipt count', () => {
  for (const start of ['morning','day','evening','night']) {
    for (const minutes of [10]) {
      const shift = createShift(data, {length:40,timeStepMinutes:minutes}, start);
      const types = ['morning','day','evening','night'];
      for (let period = 0; period < 9; period += 1) {
        shift.playedMs = period * minutes * 60_000;
        const clock = clockAt(shift);
        assert.equal(clock.type, types[(types.indexOf(start) + period) % 4]);
        assert.equal(clock.progress, 0);
        assert.equal(clock.remainingMs, minutes * 60_000);
        shift.playedMs += minutes * 60_000 - 1;
        assert.equal(clockAt(shift).type, clock.type);
        assert.equal(clockAt(shift).remainingMs, 1);
      }
    }
  }
  const legacy = {type:'evening', index:9, target:10};
  assert.equal(clockAt(legacy).type, 'evening');
  assert.equal(clockAt(legacy).remainingMs, 600_000);
});

test('saved active time survives reload, while practice and completed games add no time', () => {
  const shift = shiftOf({timeStepMinutes:1});
  addPlayTime(shift, 599_900);
  const reloaded = JSON.parse(JSON.stringify(shift));
  assert.equal(clockAt(reloaded).remainingMs, 100);
  addPlayTime(reloaded, 100);
  assert.equal(clockAt(reloaded).type, 'day');
  for (const invalid of [0,-1,NaN,Infinity]) addPlayTime(reloaded, invalid);
  assert.equal(reloaded.playedMs, 600_000);
  reloaded.completedAt = Date.now(); addPlayTime(reloaded, 600_000);
  assert.equal(reloaded.playedMs, 600_000);
  const practice = makePractice(shift, currentReceipt(shift).id);
  addPlayTime(practice, 600_000);
  assert.equal(practice.playedMs, undefined);
});

test('night transition preserves paid and current receipts, errors, draft and score; only future adults change', () => {
  for (const length of [10,20,40]) {
    const shift = shiftOf({length,timeStepMinutes:1});
    pay(shift); advanceShift(shift); pay(shift); advanceShift(shift);
    submitAnswer(shift,'ошибка'); shift.draftAnswer = 'мой черновик';
    const protectedReceipts = structuredClone(shift.receipts.slice(0,3));
    const score = summarizeShift(shift);
    addPlayTime(shift, 1_800_000);
    assert.equal(clockAt(shift).type,'night');
    assert.equal(refreshUpcomingReceipts(shift,data),true);
    assert.deepEqual(shift.receipts.slice(0,3),protectedReceipts);
    assert.equal(shift.draftAnswer,'мой черновик');
    assert.deepEqual(summarizeShift(shift),score);
    assert.equal(shift.receipts.length,length);
    assert.equal(new Set(shift.receipts.map(r=>r.customerId)).size,length);
    for (const [index,receipt] of shift.receipts.entries()) {
      assert.equal(receipt.number,index+1);
      assert.equal(receipt.id,`${shift.id}-receipt-${index+1}`);
      if (index>2) assert.ok(data.customers.find(c=>c.id===receipt.customerId).age>=18);
    }
    assert.equal(refreshUpcomingReceipts(shift,data),false);
  }
});

test('three exclusive receipt outcomes sum to the total and preserve all errors for review', () => {
  const shift=shiftOf();
  pay(shift); advanceShift(shift);
  submitAnswer(shift,'ошибка'); pay(shift); advanceShift(shift);
  submitAnswer(shift,'ошибка'); recordHint(shift); recordHint(shift); pay(shift);
  assert.deepEqual(summarizeShift(shift),{total:3,withoutErrors:1,withErrors:1,withHints:1,target:10,finished:false});
  assert.equal(shift.receipts.filter(r=>r.completed&&r.hasErrors).length,2);
  assert.equal(recordHint(shift),false,'paid receipt cannot be reclassified');
  const original=JSON.stringify(shift);
  const practice=makePractice(shift,currentReceipt(shift).id);
  assert.equal(currentReceipt(practice).usedHint,false);
  pay(practice);
  assert.equal(summarizeShift(practice).withoutErrors,1);
  assert.equal(JSON.stringify(shift),original);
});
