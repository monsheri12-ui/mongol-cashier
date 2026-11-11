const awards = (metric, targets, titles, describe) => targets.map((target, index) => ({
  id: `${metric}-${target}`, metric, target, title: titles[index], description: describe(target),
}));

export const ACHIEVEMENTS = [
  ...awards('receipts', [1,5,10,25,50,100,250,500], ['Первый покупатель','Разогрев','Десятка','Четверть сотни','Полсотни','Сотня чеков','Большая очередь','Легенда магазина'], n => `Обслужи ${n} покупателей.`),
  ...awards('clean', [1,5,10,25,50,100,250], ['Точно в цель','Пять точных','Уверенный кассир','Верный расчёт','Мастер точности','Безупречная сотня','Ювелир суммы'], n => `Оплати ${n} чеков без ошибок и подсказок.`),
  ...awards('bestStreak', [3,5,10,20,40], ['Тройной успех','Поймал ритм','Десять подряд','Железная серия','Сорок из сорока'], n => `Назови ${n} сумм подряд без ошибок и подсказок.`),
  ...awards('games', [1,3,5,10,25], ['До последнего чека','Снова за кассой','Постоянный кассир','Опытный продавец','Хранитель магазина'], n => `Заверши ${n} игр.`),
  ...awards('perfectGames', [1,3,5], ['Чистая игра','Три идеальные','Пять идеальных'], n => `Заверши ${n} игр без ошибок и подсказок.`),
  ...awards('helpFreeGames', [1,5], ['Самостоятельная работа','Своя голова'], n => `Заверши ${n} игр, ни разу не открывая подсказку или ответ.`),
  ...awards('recoveries', [1,5,10], ['Не сдаюсь','Работа над ошибками','Упорство'], n => `Исправь ошибку и оплати ${n} чеков без подсказок.`),
  ...awards('hinted', [1,5], ['Учусь с поддержкой','Полезная подсказка'], n => `Оплати ${n} чеков после подсказки или показа ответа.`),
  ...awards('numberOnly', [10], ['Числа словами'], n => `Оплати ${n} чеков в формате «Только число».`),
  ...awards('withCurrency', [10], ['Считаю в тугриках'], n => `Оплати ${n} чеков в формате «Число + валюта».`),
  {id:'both-modes', metric:'bothModes', target:10, title:'Два способа', description:'Оплати по 10 чеков в каждом формате ответа.'},
  ...awards('russian', [10], ['Знакомый чек'], n => `Оплати ${n} чеков на русском.`),
  ...awards('mongolianNames', [10], ['Знаю покупки'], n => `Оплати ${n} чеков с монгольскими названиями товаров.`),
  ...awards('mongolianReceipt', [10], ['Монгол дэлгүүр'], n => `Оплати ${n} полностью монгольских чеков.`),
  {id:'all-languages', metric:'allLanguages', target:3, title:'Три вида чека', description:'Оплати хотя бы один чек с каждым из трёх вариантов языка.'},
  ...awards('customers', [10,50,100], ['Знакомые лица','Знаю полгорода','Все свои'], n => `Обслужи ${n} разных покупателей.`),
  ...awards('products', [10,30,47], ['Первая полка','Богатый ассортимент','Знаю весь магазин'], n => `Продай ${n} разных видов товаров.`),
  {id:'all-periods', metric:'periods', target:4, title:'Полный круг', description:'Побывай за кассой утром, днём, вечером и ночью.'},
  {id:'one-hour', metric:'playedMs', target:3_600_000, title:'Час в магазине', description:'Проведи в игре 60 минут активного времени.'},
];

const COUNTERS = ['receipts','clean','bestStreak','streak','games','perfectGames','helpFreeGames','recoveries','hinted','numberOnly','withCurrency','russian','mongolianNames','mongolianReceipt','playedMs'];

export function createAchievementProfile() {
  return {version:1, ...Object.fromEntries(COUNTERS.map(key => [key,0])), customers:[], products:[], periods:[], unlocked:{}};
}

export function normalizeAchievementProfile(value) {
  if (value?.version !== 1) return null;
  const profile = createAchievementProfile();
  for (const key of COUNTERS) if (Number.isFinite(value[key])) profile[key] = Math.max(0, value[key]);
  for (const key of ['customers','products','periods']) if (Array.isArray(value[key])) profile[key] = [...new Set(value[key].filter(item => typeof item === 'string'))];
  for (const award of ACHIEVEMENTS) if (Number.isFinite(value.unlocked?.[award.id])) profile.unlocked[award.id] = value.unlocked[award.id];
  return profile;
}

export function achievementProgress(profile, award) {
  let value = profile[award.metric];
  if (award.metric === 'bothModes') value = Math.min(profile.numberOnly, profile.withCurrency);
  if (award.metric === 'allLanguages') value = [profile.russian, profile.mongolianNames, profile.mongolianReceipt].filter(n => n > 0).length;
  if (Array.isArray(value)) value = value.length;
  return Math.min(award.target, Math.max(0, Number(value) || 0));
}

export function unlockAchievements(profile, now = Date.now()) {
  const unlocked = [];
  for (const award of ACHIEVEMENTS) if (!Object.hasOwn(profile.unlocked, award.id) && achievementProgress(profile, award) >= award.target) {
    profile.unlocked[award.id] = now;
    unlocked.push(award);
  }
  return unlocked;
}

export function trackReceipt(profile, shift, receipt) {
  if (shift.isPractice || !receipt?.completed) return;
  shift.achievementReceipts ||= [];
  if (shift.achievementReceipts.includes(receipt.id)) return;
  shift.achievementReceipts.push(receipt.id);
  profile.receipts += 1;
  const clean = !receipt.hasErrors && !receipt.usedHint;
  profile.clean += Number(clean);
  profile.streak = clean ? profile.streak + 1 : 0;
  profile.bestStreak = Math.max(profile.bestStreak, profile.streak);
  profile.hinted += Number(!!receipt.usedHint);
  profile.recoveries += Number(receipt.hasErrors && !receipt.usedHint);
  profile[receipt.mode === 'number_only' ? 'numberOnly' : 'withCurrency'] += 1;
  profile[receipt.receiptLanguage === 'mn' ? 'mongolianReceipt' : receipt.productLanguage === 'mn' ? 'mongolianNames' : 'russian'] += 1;
  profile.customers = [...new Set([...profile.customers, receipt.customerId])];
  profile.products = [...new Set([...profile.products, ...receipt.items.map(item => item.productId)])];
}

export function trackFinishedGame(profile, shift) {
  if (shift.isPractice || shift.achievementGame || shift.receipts.length !== shift.target || !shift.receipts.every(receipt => receipt.completed)) return;
  shift.achievementGame = true;
  profile.games += 1;
  profile.perfectGames += Number(shift.receipts.every(receipt => !receipt.hasErrors && !receipt.usedHint));
  profile.helpFreeGames += Number(shift.receipts.every(receipt => !receipt.usedHint));
}

export function trackPlayTime(profile, elapsedMs, type) {
  if (Number.isFinite(elapsedMs) && elapsedMs > 0) profile.playedMs += elapsedMs;
  if (['morning','day','evening','night'].includes(type) && !profile.periods.includes(type)) profile.periods.push(type);
}
