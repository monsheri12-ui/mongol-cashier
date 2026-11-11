import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createShift,currentReceipt,submitAnswer,advanceShift,recordHint,makePractice } from '../dist/game.js';
import { ACHIEVEMENTS,createAchievementProfile,normalizeAchievementProfile,achievementProgress,unlockAchievements,trackReceipt,trackFinishedGame,trackPlayTime } from '../dist/achievements.js';
const data=JSON.parse(await readFile(new URL('../dist/data.json',import.meta.url),'utf8'));
const shiftOf=()=>createShift(data,{length:10},'morning');
const pay=(profile,shift)=>{const receipt=currentReceipt(shift);submitAnswer(shift,receipt.canonical);trackReceipt(profile,shift,receipt);};

test('collection has exactly 50 uniquely named, reachable achievements with clear conditions',()=>{
  assert.equal(ACHIEVEMENTS.length,50);
  assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,50);
  assert.equal(new Set(ACHIEVEMENTS.map(a=>a.title)).size,50);
  const profile=createAchievementProfile();
  for(const key of Object.keys(profile)) if(typeof profile[key]==='number') profile[key]=1e9;
  profile.customers=Array.from({length:100},(_,i)=>`c${i}`);
  profile.products=Array.from({length:47},(_,i)=>`p${i}`);
  profile.periods=['morning','day','evening','night'];
  for(const award of ACHIEVEMENTS){assert.ok(award.description.length>12);assert.equal(achievementProgress(profile,award),award.target);}
  assert.equal(unlockAchievements(profile,123).length,50);
  assert.equal(unlockAchievements(profile,456).length,0);
  assert.ok(Object.values(profile.unlocked).every(at=>at===123));
});

test('only paid real receipts count, duplicate events and practice give no extra credit',()=>{
  const profile=createAchievementProfile(),shift=shiftOf();
  trackReceipt(profile,shift,currentReceipt(shift)); assert.equal(profile.receipts,0);
  pay(profile,shift);trackReceipt(profile,shift,currentReceipt(shift));
  assert.equal(profile.receipts,1);assert.equal(profile.clean,1);assert.equal(profile.streak,1);
  const practice=makePractice(shift,currentReceipt(shift).id);
  pay(profile,practice);assert.equal(profile.receipts,1);
  advanceShift(shift);submitAnswer(shift,'ошибка');pay(profile,shift);
  assert.equal(profile.receipts,2);assert.equal(profile.clean,1);assert.equal(profile.recoveries,1);assert.equal(profile.streak,0);
  advanceShift(shift);recordHint(shift);pay(profile,shift);
  assert.equal(profile.hinted,1);assert.equal(profile.clean,1);
});

test('full-game awards require completion and cannot be issued twice',()=>{
  const profile=createAchievementProfile(),shift=shiftOf();
  trackFinishedGame(profile,shift);assert.equal(profile.games,0);
  for(let i=0;i<10;i++){pay(profile,shift);if(i<9)advanceShift(shift);}
  trackFinishedGame(profile,shift);trackFinishedGame(profile,shift);
  assert.equal(profile.games,1);assert.equal(profile.perfectGames,1);assert.equal(profile.helpFreeGames,1);
  assert.equal(profile.bestStreak,10);
});

test('both formats and all three receipt languages require their own progress',()=>{
  const profile=createAchievementProfile();
  profile.numberOnly=100;profile.withCurrency=3;
  assert.equal(achievementProgress(profile,ACHIEVEMENTS.find(a=>a.id==='both-modes')),3);
  profile.russian=30;profile.mongolianNames=5;
  assert.equal(achievementProgress(profile,ACHIEVEMENTS.find(a=>a.id==='all-languages')),2);
  profile.mongolianReceipt=1;
  assert.equal(achievementProgress(profile,ACHIEVEMENTS.find(a=>a.id==='all-languages')),3);
});

test('active time, distinct periods, permanent unlocks and cumulative totals survive save/reload',()=>{
  const profile=createAchievementProfile();
  trackPlayTime(profile,1000,'morning');trackPlayTime(profile,1000,'morning');
  assert.equal(profile.playedMs,2000);assert.deepEqual(profile.periods,['morning']);
  profile.receipts=500;unlockAchievements(profile,789);
  const saved=JSON.parse(JSON.stringify(profile));
  const loaded=normalizeAchievementProfile(saved);
  assert.deepEqual(loaded,profile);
  assert.equal(unlockAchievements(loaded,999).length,0);
  assert.equal(loaded.unlocked['receipts-500'],789);
  assert.equal(normalizeAchievementProfile(null),null);
});
