import { SHIFTS, normalizeSettings, createShift, currentReceipt, submitAnswer, advanceShift, summarizeShift, makePractice, morningPhase, worldAt } from './game.js';
import { checkAnswer } from './numbers.js';
import { checkoutSurface, layoutPurchases } from './table.js';
import { receiptCopy, receiptUnit, receiptName } from './receipt.js';
import { collectGameAssets, preloadAssets, createIntroScreen } from './loading.js?v=1.1.1';

const app = document.querySelector('#app');
const world = document.querySelector('#world');
const announcer = document.querySelector('#announcer');
const STORAGE_KEY = 'mongol-cashier-v1';
const money = value => new Intl.NumberFormat('ru-RU').format(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const modeLabel = mode => mode === 'number_only' ? 'Только число' : 'Число + валюта';
const plural = (number, one = 'чек', few = 'чека', many = 'чеков') => number % 10 === 1 && number % 100 !== 11 ? one : number % 10 >= 2 && number % 10 <= 4 && (number % 100 < 12 || number % 100 > 14) ? few : many;
const paths = {
  back: 'm15 18-6-6 6-6', next: 'm9 18 6-6-6-6', close: 'm6 6 12 12M18 6 6 18',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3',
  check: 'm5 12 4 4L19 6', error: 'm8 8 8 8M16 8l-8 8',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  sunrise: 'M3 18h18M3 22h18M12 2v3M4.2 7.2l2.1 2.1M19.8 7.2l-2.1 2.1M5 18a7 7 0 0 1 14 0M9 5l3-3 3 3',
  sunset: 'M3 18h18M3 22h18M12 2v7M9 6l3 3 3-3M4.2 7.2l2.1 2.1M19.8 7.2l-2.1 2.1M5 18a7 7 0 0 1 14 0',
  sound: 'm11 5-6 4H2v6h3l6 4V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
  mute: 'm11 5-6 4H2v6h3l6 4V5ZM16 9l5 6M21 9l-5 6',
  history: 'M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5M12 7v5l3 2',
  repeat: 'M3 11a8 8 0 0 1 14-5l3 3M20 3v6h-6M21 13a8 8 0 0 1-14 5l-3-3M4 21v-6h6',
  leaf: 'M20 4C10 2 3 7 5 14c2 7 13 5 15-10ZM4 21 17 8',
  bag: 'M5 7h14l1 14H4L5 7ZM9 8V6a3 3 0 0 1 6 0v2',
  help: 'M9.1 8a3 3 0 1 1 5.8 1c-.9 1.4-2.9 1.3-2.9 3M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};
const icon = (name, className = '') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.receipt}"/></svg>`;
let data, buyers, productAtlas, worldArt;
let view = 'home';
let feedback = '';
let feedbackKind = '';
let revealed = false;
let selectedShiftId = null;
let selectedReceiptId = null;
let practice = null;
let transitionTimer = null;
let audio = null;
let storageAvailable = true;

function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { settings: normalizeSettings(value.settings), active: validShift(value.active) ? value.active : null, history: Array.isArray(value.history) ? value.history.filter(validShift).slice(0, 40) : [], visits: value.visits && typeof value.visits === 'object' ? value.visits : {} };
  } catch { return { settings: normalizeSettings(), active: null, history: [], visits: {} }; }
}
function validShift(shift) {
  return !!shift && !!SHIFTS[shift.type] && Number.isInteger(shift.target) && shift.target >= 1 && shift.target <= 40 && Array.isArray(shift.receipts) && shift.receipts.length === shift.target && Number.isInteger(shift.index) && shift.index >= 0 && shift.index < shift.receipts.length && shift.receipts.every(r => Array.isArray(r.items) && Array.isArray(r.attempts) && Number.isInteger(r.total) && r.total > 0 && r.total <= 999999);
}
const state = loadState();
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { storageAvailable = false; } }
function announce(text) { announcer.textContent = ''; requestAnimationFrame(() => { announcer.textContent = text; }); }
function clearTransition() { clearTimeout(transitionTimer); transitionTimer = null; }
function show(name) { clearTransition(); view = name; feedback = ''; feedbackKind = ''; revealed = false; try { sessionStorage.setItem('cashier-last-view', name); } catch {} render(); }
function dateLabel(timestamp) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(timestamp); }
function findShift(id = selectedShiftId) { return state.history.find(shift => shift.id === id); }
function playedShift() { return practice || state.active; }
function spriteStyle(mapping, sheets, id) {
  const item = mapping?.[id];
  const sheet = item && sheets?.find(sheet => sheet.id === item.sheet);
  if (!sheet) return '';
  const x = sheet.columns > 1 ? (item.column ?? item.index % sheet.columns) / (sheet.columns - 1) * 100 : 0;
  const y = sheet.rows > 1 ? (item.row ?? Math.floor(item.index / sheet.columns)) / (sheet.rows - 1) * 100 : 0;
  const ratio = (sheet.width || 1536) / sheet.columns / ((sheet.height || 1024) / sheet.rows);
  return `background-image:url('${escape(sheet.src)}');background-size:${sheet.columns * 100}% ${sheet.rows * 100}%;background-position:${x}% ${y}%;--sprite-ratio:${ratio}`;
}
function customerArt(id, className = '') {
  return `<div class="customer-art ${className}" style="${spriteStyle(buyers?.customers, buyers?.sheets, id)}" aria-hidden="true"></div>`;
}
function productArt(id) { return `<div class="product-art" style="${spriteStyle(productAtlas?.products, productAtlas?.sheets, id)}" aria-hidden="true"></div>`; }
function worldPath(phase) { return worldArt?.variants?.find(item => item.id === phase)?.src || `assets/world/table-v2/${phase}.webp`; }

function purchasesMarkup(receipt) {
  const surface = checkoutSurface(innerWidth, innerHeight, worldArt?.layers?.groceryStage);
  const width = surface.width * surface.stageWidth, height = surface.height * surface.stageHeight;
  const units = layoutPurchases(receipt.items, productAtlas, width, height);
  return `<div class="counter-purchases" data-testid="counter-purchases" data-unit-count="${units.length}" style="left:${surface.left * 100}%;top:${surface.top * 100}%;width:${surface.width * 100}%;height:${surface.height * 100}%">${units.map(unit => `<div class="table-unit" data-product-id="${unit.productId}" data-unit-index="${unit.unitIndex}" style="left:${unit.left}px;top:${unit.top}px;width:${unit.width}px;height:${unit.height}px;z-index:${unit.zIndex}"><span class="item-contact-shadow"></span><div class="product-art" style="${spriteStyle(productAtlas.products, productAtlas.sheets, unit.productId)};width:${unit.frameWidth}px;height:${unit.frameHeight}px;left:${unit.offsetX}px;top:${unit.offsetY}px"></div></div>`).join('')}</div>`;
}

function paintWorld(type = 'evening', progress = 0, receipt = null) {
  const light = worldAt(type, progress);
  const customer = receipt && data.customers.find(c => c.id === receipt.customerId);
  const paid = receipt?.completed;
  const deepCounter = (worldArt?.layers?.counterTopNormalizedY || .755) < .7;
  const actorHeight = customer ? (customer.age < 13 ? 54 : customer.age < 18 ? 60 : 68) * (deepCounter ? .88 : 1) : 0;
  const backgrounds = `<img class="world-background" src="${worldPath(light.from)}" alt=""><img class="world-background world-background-next" style="opacity:${light.blend}" src="${worldPath(light.to)}" alt="">`;
  world.className = `world ${view === 'play' ? 'world-playing' : 'world-soft'}`;
  world.innerHTML = `<img class="world-ambient" src="${worldPath(light.from)}" alt=""><img class="world-ambient world-ambient-next" style="opacity:${light.blend * .75}" src="${worldPath(light.to)}" alt=""><div class="world-stage">${backgrounds}${customer ? `<div class="scene-actor ${paid ? 'actor-paid' : 'actor-arriving'}" style="--actor-height:${actorHeight}%;bottom:${deepCounter ? 34.5 : 21.5}%">${customerArt(customer.id)}</div>${customer.role === 'dog_walkers' ? `<img class="scene-dog" src="${worldArt?.dogs?.[0]?.src || 'assets/dogs/dog-01.webp'}" style="${deepCounter ? 'left:18%;bottom:26%;width:13%;z-index:5' : 'bottom:29%'}" alt="">` : ''}<div class="speech-bubble ${paid ? 'paid-bubble' : ''}">${paid ? 'Спасибо!' : 'Сколько с меня?'}</div><div class="counter-foreground" style="clip-path:inset(${(worldArt?.layers?.counterTopNormalizedY || .755)*100}% 0 0 0)">${backgrounds}</div>${purchasesMarkup(receipt)}${paid ? '<div class="payment-glow"></div>' : ''}` : ''}</div><div class="world-shade"></div>`;
}

function sound(kind) {
  if (!state.settings.sound) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const start = audio.currentTime;
    const tones = kind === 'paid' ? [[880, 0, .13], [1174.66, .11, .2], [1567.98, .21, .22]] : [[440, 0, .1]];
    for (const [frequency, offset, length] of tones) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(kind === 'paid' ? .07 : .035, start + offset + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + offset + length);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(start + offset); oscillator.stop(start + offset + length + .01);
    }
  } catch { /* Sound is optional; the exercise remains usable. */ }
}

function controlsMarkup() {
  const length = state.settings.length;
  const language = state.settings.receiptLanguage === 'mn' ? 'mn' : state.settings.productLanguage === 'mn' ? 'names_mn' : 'ru';
  return `<section class="settings-panel" aria-label="Настройки смены"><div class="difficulty-heading">${icon('leaf')}<span>Уровень<br>сложности</span></div><div class="length-control"><label for="shift-length">Чеков за смену</label><div class="range-box"><input id="shift-length" type="range" min="10" max="40" step="1" value="${length}" style="--range-fill:${(length - 10) / 30 * 100}%" aria-valuetext="${length} ${plural(length)}"><div class="range-ticks" aria-hidden="true"><span>10</span><span>20</span><span>30</span><span>40</span></div></div><output for="shift-length" id="length-value" class="length-value">${length} ${plural(length)}</output></div><fieldset class="mode-control"><legend>Формат ответа</legend>${['number_only', 'number_and_currency'].map(mode => `<label class="radio-choice"><input type="radio" name="answer-mode" value="${mode}" ${state.settings.mode === mode ? 'checked' : ''}><span class="radio-dot"></span><span>${modeLabel(mode)}</span></label>`).join('')}</fieldset>${data.products.every(p => p.name_mn) ? `<fieldset class="receipt-language-control"><legend>Язык чека</legend>${[['ru','Русский','Обычный чек'],['names_mn','Товары по-монгольски','Только названия покупок'],['mn','Весь чек на монгольском','Заголовки, товары, единицы и итог']].map(([value,title,note]) => `<label class="receipt-language-choice"><input type="radio" name="receipt-language" value="${value}" ${language === value ? 'checked' : ''}><span class="radio-dot"></span><span><strong>${title}</strong><small>${note}</small></span></label>`).join('')}</fieldset>` : ''}</section>`;
}

function renderHome() {
  paintWorld('evening', .2);
  app.innerHTML = `<main class="menu-view"><div class="menu-toolbar"><span class="brand-small">${icon('bag')} <span lang="mn">Монгол дэлгүүр</span></span><div class="toolbar-actions"><button class="small-button" data-action="history">${icon('history')}<span>История смен${state.history.length ? ` · ${state.history.length}` : ''}</span></button>${soundButton()}</div></div><section class="menu-paper paper"><header class="menu-title"><span class="title-leaf">❧</span><div><h1>Выбери смену</h1></div><span class="title-leaf title-leaf-right">❧</span></header>${state.active ? `<div class="resume-banner"><div>${icon('receipt')}<span><strong>Смена ждёт тебя</strong><small>${SHIFTS[state.active.type].label} · ${state.active.completedCount} из ${state.active.target} чеков</small></span></div><button class="button button-small" data-action="resume">Продолжить</button></div>` : ''}<div class="shift-grid">${Object.entries(SHIFTS).map(([type, shift]) => `<button class="shift-card ${type === 'morning' ? 'shift-card-first' : ''}" data-action="start" data-shift="${type}"><img class="shift-card-background" src="${worldPath(shift.world)}" alt="">${customerArt(shift.customer, 'card-customer')}<span class="shift-card-scrim"></span><span class="shift-card-copy"><span class="shift-card-title">${icon(shift.icon)}${shift.short}</span><span class="shift-card-action">${shift.action}${icon('next')}</span></span></button>`).join('')}</div>${controlsMarkup()}<footer class="menu-footnote"><span>${icon('receipt')} Назови сумму словами — покупатель оплатит чек</span><button class="text-button" data-action="help">Как играть</button></footer></section><p class="save-note">${storageAvailable ? 'Прогресс сохраняется в этом браузере' : 'Хранилище браузера недоступно; оставь вкладку открытой, чтобы сохранить текущую смену'}</p></main>`;
}
function soundButton() { return `<button class="icon-button sound-toggle" data-action="sound" aria-label="${state.settings.sound ? 'Выключить звуки кассы' : 'Включить звуки кассы'}" aria-pressed="${state.settings.sound}" title="${state.settings.sound ? 'Выключить звуки кассы' : 'Включить звуки кассы'}">${icon(state.settings.sound ? 'sound' : 'mute')}<span class="sound-label">Звуки кассы</span></button>`; }

function renderPlay() {
  const shift = playedShift();
  if (!shift) return show('home');
  const receipt = currentReceipt(shift);
  const summary = summarizeShift(shift);
  const paid = receipt.completed;
  const wrongAttempts = receipt.attempts.filter(a => !a.correct);
  const copy = receiptCopy(receipt);
  paintWorld(shift.type, summary.total / shift.target, receipt);
  app.innerHTML = `<main class="play-view ${paid ? 'is-paid' : ''}"><header class="play-topbar"><button class="small-button back-button" data-action="${practice ? 'back-review' : 'home'}">${icon('back')}<span>${practice ? 'К разбору' : 'На главную'}</span></button><div class="shift-status"><span class="shift-badge">${icon(SHIFTS[shift.type].icon)}${practice ? `Повторение чека №${receipt.number}` : SHIFTS[shift.type].label}</span>${practice || morningPhase(shift) ? `<span class="phase-label">${practice ? 'Отдельная тренировка' : morningPhase(shift)}</span>` : ''}</div><div class="progress-summary"><span>${icon('receipt')}<strong>${practice ? '1 из 1' : `Чек ${Math.min(shift.index + 1, shift.target)} из ${shift.target}`}</strong></span><div class="progress-track" role="progressbar" aria-label="Завершено чеков" aria-valuemin="0" aria-valuemax="${shift.target}" aria-valuenow="${summary.total}"><span style="width:${summary.total / shift.target * 100}%"></span></div></div>${soundButton()}</header><section class="checkout-card paper" aria-label="Чек и запись суммы"><div class="printed-receipt" lang="${copy.lang}"><header class="receipt-heading"><span class="receipt-seal">${icon('receipt')}</span><div><p class="eyebrow">${copy.store}</p><h1>${copy.receipt} №${receipt.number}</h1></div><span class="receipt-status ${paid ? 'receipt-status-paid' : ''}">${paid ? copy.paid : copy.due}</span></header><div class="receipt-items"><div class="receipt-columns"><span>${copy.purchase}</span><span>${copy.amount}</span></div>${receipt.items.map(item => `<div class="receipt-item"><div><span>${escape(receiptName(item,receipt))}</span><small>${item.quantity} ${escape(receiptUnit(item,receipt))} × ${money(item.price)} ₮</small></div><strong>${money(item.lineTotal)} ₮</strong></div>`).join('')}</div><div class="receipt-total"><span>${copy.total}</span><strong data-testid="receipt-total" data-amount="${receipt.total}">${money(receipt.total)} <span>₮</span></strong></div></div><div class="mode-reminder">${icon('help')}<span>${shift.mode === 'number_only' ? 'Напиши только число словами' : 'Напиши число словами и валюту'}</span></div>${paid ? `<div class="paid-message" role="status">${icon('check')}<div><strong>Верно! Покупка оплачена</strong><span>${escape(receipt.canonical)}</span></div></div><button class="button next-customer" data-action="advance">${practice ? 'Вернуться к разбору' : shift.index === shift.target - 1 ? 'Итоги смены' : 'Следующий покупатель'}${icon('next')}</button>` : `<form id="answer-form" novalidate><label class="answer-label" for="amount-answer">Сумма по-монгольски</label><textarea id="amount-answer" name="amount-answer" rows="2" maxlength="500" spellcheck="false" autocomplete="off" autocapitalize="off" aria-describedby="answer-feedback" ${feedbackKind === 'error' ? 'aria-invalid="true"' : ''} placeholder="Напиши сумму словами…">${escape(shift.draftAnswer || '')}</textarea><div class="input-tools"><span>Монгольские буквы</span><div><button type="button" class="letter-key" data-action="letter" data-letter="ө" aria-label="Вставить букву ө">ө</button><button type="button" class="letter-key" data-action="letter" data-letter="ү" aria-label="Вставить букву ү">ү</button></div></div><div id="answer-feedback" class="answer-feedback ${feedbackKind}" role="status">${feedback ? escape(feedback) : '&nbsp;'}</div><button class="button submit-answer" type="submit">Назвать сумму${icon('next')}</button><div class="answer-secondary"><span>${wrongAttempts.length ? `Попытка ${wrongAttempts.length + 1}` : 'Enter — назвать сумму'}</span>${wrongAttempts.length ? '<button class="text-button" type="button" data-action="hint">Подсказка</button>' : ''}${wrongAttempts.length >= 2 ? '<button class="text-button" type="button" data-action="reveal">Показать ответ</button>' : ''}</div>${revealed ? `<div class="revealed-answer"><small>Попробуй записать самостоятельно</small><strong>${escape(receipt.canonical)}</strong></div>` : ''}</form>`}${practice ? '<footer class="checkout-foot">Тренировка · исходный результат сохранён</footer>' : ''}</section></main>`;
  if (!paid) requestAnimationFrame(() => {
    const field = document.querySelector('#amount-answer');
    if (field && matchMedia('(min-width: 981px)').matches) { field.focus({ preventScroll: true }); field.setSelectionRange(field.value.length, field.value.length); }
  });
  if (paid && !practice) transitionTimer = setTimeout(() => { if (view === 'play' && currentReceipt(state.active)?.id === receipt.id) advance(); }, 1900);
}

function renderResults() {
  const shift = findShift();
  if (!shift) return show('home');
  const score = summarizeShift(shift);
  paintWorld(shift.type, 1);
  const next = SHIFTS[SHIFTS[shift.type].next];
  app.innerHTML = `<main class="center-view"><div class="screen-toolbar"><button class="small-button" data-action="home">${icon('back')}На главную</button>${soundButton()}</div><section class="results-paper paper"><p class="eyebrow">${dateLabel(shift.completedAt)}</p><h1>Смена окончена</h1><p class="results-subtitle">${SHIFTS[shift.type].label}</p><div class="score-grid"><div class="score-card">${icon('receipt')}<span>Всего чеков</span><strong data-testid="score-total">${score.total}</strong></div><div class="score-card score-good">${icon('check')}<span>Чеков без ошибок</span><strong data-testid="score-correct">${score.withoutErrors}</strong></div><div class="score-card score-errors">${icon('error')}<span>Чеков с ошибками</span><strong data-testid="score-errors">${score.withErrors}</strong></div></div>${!score.withErrors ? '<p class="perfect-result">Все чеки без ошибок. Отличная смена!</p>' : ''}<div class="result-actions">${score.withErrors ? `<button class="button" data-action="review" data-id="${shift.id}">Посмотреть ошибки${icon('next')}</button>` : ''}<button class="button ${score.withErrors ? 'button-outline' : ''}" data-action="next-shift" data-shift="${SHIFTS[shift.type].next}">${next.action}${icon(next.icon)}</button></div><button class="text-button choose-another" data-action="home">Выбрать другую смену</button></section></main>`;
}

function attemptMarkup(attempt) {
  const marked = new Set((attempt.differences || []).filter(d => d.type !== 'missing').map(d => d.index));
  let index = 0;
  return escape(attempt.rawAnswer).replace(/\S+/g, token => marked.has(index++) ? `<mark>${token}</mark>` : token);
}
function renderReview() {
  const shift = findShift();
  if (!shift) return show('home');
  const errors = shift.receipts.filter(r => r.completed && r.hasErrors);
  const receipt = errors.find(r => r.id === selectedReceiptId) || errors[0];
  if (!receipt) { show('results'); return; }
  selectedReceiptId = receipt.id;
  const failed = receipt.attempts.filter(a => !a.correct);
  const reason = (failed.at(-1)?.reason || '').replace(/\s*(?:Правильно|Нужная запись):[\s\S]*$/, '').trim();
  paintWorld(shift.type, 1);
  app.innerHTML = `<main class="review-view"><div class="screen-toolbar"><button class="small-button" data-action="results">${icon('back')}К итогам смены</button>${soundButton()}</div><section class="review-paper paper"><header class="review-heading"><h1>Разбор ошибок</h1><p>${SHIFTS[shift.type].label}<span>·</span>${modeLabel(receipt.mode)}</p></header><div class="review-columns"><aside class="error-sidebar" aria-label="Чеки с ошибками"><h2>Чеки с ошибками <span>${errors.length}</span></h2><div class="error-receipt-list">${errors.map(r => `<button class="error-receipt ${r.id === receipt.id ? 'is-selected' : ''}" data-action="select-error" data-id="${r.id}" aria-current="${r.id === receipt.id ? 'true' : 'false'}">${icon('receipt')}<span>№${r.number}</span><strong>${money(r.total)} ₮</strong></button>`).join('')}</div></aside><section class="error-detail"><h2>Чек №${receipt.number}<span>·</span>${money(receipt.total)} ₮</h2><p class="detail-person">${escape(receipt.customerTitle)}</p><h3>Ваши попытки</h3><ol class="failed-attempts">${failed.map(a => `<li><span class="attempt-words">${attemptMarkup(a)}</span></li>`).join('')}</ol><h3>Правильный ответ</h3><div class="correct-answer">${escape(receipt.canonical)}</div><div class="error-explanation">${icon('help')}<p>${escape(reason)}</p></div><div class="review-actions"><button class="button" data-action="practice" data-id="${receipt.id}">${icon('repeat')}Повторить этот чек</button><button class="button button-outline" data-action="${errors.indexOf(receipt) === errors.length - 1 ? 'results' : 'next-error'}">${errors.indexOf(receipt) === errors.length - 1 ? 'К итогам смены' : 'Следующий чек'}${icon('next')}</button></div></section></div><p class="review-footnote">Несколько неверных попыток одного чека считаются одним чеком с ошибками.</p></section></main>`;
}

function renderHistory() {
  paintWorld('evening', .25);
  app.innerHTML = `<main class="history-view"><div class="screen-toolbar"><button class="small-button" data-action="home">${icon('back')}На главную</button>${soundButton()}</div><section class="history-paper paper"><p class="eyebrow">Твои результаты</p><h1>История смен</h1>${state.history.length ? `<div class="history-list">${state.history.map(shift => {
    const score = summarizeShift(shift);
    return `<button class="history-row" data-action="open-result" data-id="${shift.id}"><span class="history-icon">${icon(SHIFTS[shift.type].icon)}</span><span class="history-name"><strong>${SHIFTS[shift.type].label}</strong><small>${dateLabel(shift.completedAt)} · ${modeLabel(shift.mode)}</small></span><span class="history-score"><strong>${score.withoutErrors}<small> без ошибок</small></strong><span>${score.withErrors} с ошибками · ${score.total} всего</span></span>${icon('next')}</button>`;
  }).join('')}</div>` : `<div class="empty-history">${icon('receipt')}<h2>Первая смена впереди</h2><p>Обслужи покупателей — здесь появятся результаты и разбор ошибок.</p><button class="button" data-action="home">Выбрать смену${icon('next')}</button></div>`}<p class="history-note">Последние 40 смен сохраняются в этом браузере.</p></section></main>`;
}

function render() {
  clearTransition();
  document.body.dataset.view = view;
  if (view === 'play') renderPlay();
  else if (view === 'results') renderResults();
  else if (view === 'review') renderReview();
  else if (view === 'history') renderHistory();
  else renderHome();
}

function start(type, force = false) {
  if (!SHIFTS[type]) return;
  if (state.active && !force) {
    openDialog(`<h2>Смена ещё ждёт тебя</h2><p>${SHIFTS[state.active.type].label}: завершено ${state.active.completedCount} из ${state.active.target} чеков.</p><div class="dialog-actions"><button class="button" data-action="resume">Продолжить смену</button><button class="button button-outline" data-action="confirm-start" data-shift="${type}">Начать новую</button></div><button class="text-button" data-action="close-dialog">Вернуться</button>`);
    return;
  }
  closeDialog();
  state.active = createShift(data, state.settings, type, state.visits);
  practice = null;
  save(); show('play');
  announce(`${SHIFTS[type].label}. ${state.active.target} ${plural(state.active.target)}. ${modeLabel(state.active.mode)}.`);
}

function finish() {
  if (!state.active || !summarizeShift(state.active).finished) return;
  const shift = structuredClone(state.active);
  if (!state.history.some(h => h.id === shift.id)) state.history.unshift(shift);
  state.history = state.history.slice(0, 40);
  state.active = null;
  selectedShiftId = shift.id;
  save(); show('results');
  announce(`Смена окончена. Без ошибок ${summarizeShift(shift).withoutErrors}, с ошибками ${summarizeShift(shift).withErrors}.`);
}
function advance() {
  clearTransition();
  if (practice) { practice = null; show('review'); return; }
  if (!state.active) return;
  const next = advanceShift(state.active);
  if (next === 'finished') finish();
  else if (next) { feedback = ''; feedbackKind = ''; revealed = false; save(); render(); }
}
function answer(raw) {
  const shift = playedShift();
  if (!shift) return;
  const result = submitAnswer(shift, raw);
  if (result.status === 'empty') { feedback = 'Напиши сумму словами, затем назови её покупателю.'; feedbackKind = 'error'; renderPlay(); return; }
  if (result.status === 'already-complete') return;
  if (result.status === 'paid') {
    feedback = ''; feedbackKind = '';
    if (!practice) state.visits[result.receipt.customerId] = (Number(state.visits[result.receipt.customerId]) || 0) + 1;
    sound('paid');
    announce('Верно. Покупка оплачена.');
  } else {
    feedback = 'Пока не получилось. Проверь сумму и попробуй ещё раз.';
    feedbackKind = 'error'; sound('incorrect'); announce(feedback);
  }
  if (!practice) save();
  render();
}
function insertLetter(letter) {
  const field = document.querySelector('#amount-answer');
  if (!field) return;
  field.setRangeText(letter, field.selectionStart, field.selectionEnd, 'end');
  playedShift().draftAnswer = field.value;
  if (!practice) save();
  field.focus({ preventScroll: true });
}
function showHint() {
  const receipt = currentReceipt(playedShift());
  const last = receipt.attempts.filter(a => !a.correct).at(-1);
  if (!last) return;
  const differences = last.differences || [];
  const form = differences.find(d => ['мянга', 'мянган', 'зуу', 'зуун'].includes(d.actual) && ['мянга', 'мянган', 'зуу', 'зуун'].includes(d.expected));
  if (form) feedback = receipt.mode === 'number_and_currency' ? 'Проверь форму числительного перед валютой и внутри составной суммы.' : 'Проверь форму последнего слова самостоятельного числа.';
  else if (/\d/.test(last.rawAnswer)) feedback = 'В этом упражнении сумму нужно написать словами.';
  else if (/[a-z]/i.test(last.rawAnswer)) feedback = 'Используй монгольскую кириллицу. Буквы ө и ү есть под полем ответа.';
  else if (receipt.mode === 'number_and_currency' && !last.rawAnswer.toLowerCase().includes('төгрөг')) feedback = 'Добавь название валюты словами и проверь форму числа перед ним.';
  else feedback = 'Раздели сумму на тысячи, сотни, десятки и единицы. Проверь каждую часть.';
  feedbackKind = 'hint'; renderPlay();
}

function openDialog(html) {
  closeDialog();
  const dialog = document.createElement('dialog');
  dialog.className = 'paper game-dialog'; dialog.innerHTML = html;
  app.appendChild(dialog); dialog.addEventListener('cancel', () => dialog.remove(), { once: true }); dialog.showModal();
}
function closeDialog() { const dialog = document.querySelector('dialog'); if (dialog) { dialog.close(); dialog.remove(); } }
function help() {
  openDialog(`<span class="dialog-mark">${icon('receipt')}</span><h2>Твоя смена в магазине</h2><ol class="help-steps"><li>Выбери время суток, 10–40 чеков и формат ответа.</li><li>Посмотри итог чека и напиши сумму по-монгольски.</li><li>После правильного ответа покупатель оплатит покупку.</li><li>В конце смены посмотри результаты и разбери ошибки.</li></ol><p>В режиме «Только число» пиши самостоятельное числительное. В режиме «Число + валюта» добавляй слово төгрөг и используй нужную форму перед ним.</p><button class="button" data-action="close-dialog">Начнём${icon('next')}</button>`);
}

app.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const { action, id, shift, letter } = button.dataset;
  if (action === 'start' || action === 'next-shift') start(shift);
  else if (action === 'confirm-start') start(shift, true);
  else if (action === 'home') { if (state.active && summarizeShift(state.active).finished) finish(); practice = null; show('home'); }
  else if (action === 'resume') { closeDialog(); practice = null; show('play'); }
  else if (action === 'history') show('history');
  else if (action === 'open-result') { selectedShiftId = id; show('results'); }
  else if (action === 'results') { practice = null; show('results'); }
  else if (action === 'review') { selectedShiftId = id; selectedReceiptId = null; show('review'); }
  else if (action === 'back-review') { practice = null; show('review'); }
  else if (action === 'select-error') { selectedReceiptId = id; renderReview(); }
  else if (action === 'next-error') { const errors = findShift()?.receipts.filter(r => r.hasErrors) || []; const index = errors.findIndex(r => r.id === selectedReceiptId); selectedReceiptId = errors[(index + 1) % errors.length]?.id; renderReview(); }
  else if (action === 'practice') { practice = makePractice(findShift(), id); show('play'); }
  else if (action === 'advance') advance();
  else if (action === 'letter') insertLetter(letter);
  else if (action === 'hint') showHint();
  else if (action === 'reveal') { revealed = true; renderPlay(); }
  else if (action === 'help') help();
  else if (action === 'close-dialog') closeDialog();
  else if (action === 'sound') { state.settings.sound = !state.settings.sound; save(); document.querySelectorAll('[data-action="sound"]').forEach(control => { control.setAttribute('aria-pressed', String(state.settings.sound)); control.setAttribute('aria-label', state.settings.sound ? 'Выключить звуки кассы' : 'Включить звуки кассы'); control.title = control.getAttribute('aria-label'); control.innerHTML = icon(state.settings.sound ? 'sound' : 'mute') + '<span class="sound-label">Звуки кассы</span>'; }); }
  else if (action === 'reload') location.reload();
});
app.addEventListener('submit', event => { if (event.target.id === 'answer-form') { event.preventDefault(); answer(document.querySelector('#amount-answer').value); } });
app.addEventListener('keydown', event => { if (event.target.id === 'amount-answer' && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); answer(event.target.value); } });
app.addEventListener('input', event => {
  if (event.target.id === 'shift-length') {
    state.settings.length = Number(event.target.value);
    event.target.style.setProperty('--range-fill', `${(state.settings.length - 10) / 30 * 100}%`);
    event.target.setAttribute('aria-valuetext', `${state.settings.length} ${plural(state.settings.length)}`);
    document.querySelector('#length-value').textContent = `${state.settings.length} ${plural(state.settings.length)}`;
    save();
  }
  if (event.target.id === 'amount-answer') { playedShift().draftAnswer = event.target.value; if (!practice) save(); }
});
app.addEventListener('change', event => { if (event.target.name === 'answer-mode') { state.settings.mode = event.target.value; save(); } if (event.target.name === 'receipt-language') { state.settings.receiptLanguage = event.target.value === 'mn' ? 'mn' : 'ru'; state.settings.productLanguage = event.target.value === 'ru' ? 'ru' : 'mn'; save(); } });
window.addEventListener('beforeunload', save);
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { const shift = playedShift(); if (view === 'play' && shift) paintWorld(shift.type, shift.completedCount / shift.target, currentReceipt(shift)); }, 120);
});

let warmImages = [];
let resumeOnStart = false;
try { resumeOnStart = !!state.active && sessionStorage.getItem('cashier-last-view') === 'play'; } catch {}
const intro = createIntroScreen({ resume: resumeOnStart });
let loadedData = 0;
async function fetchJSON(path) { const response = await fetch(path, { cache: 'no-cache' }); if (!response.ok) throw new Error(`Не удалось загрузить ${path}`); const result = await response.json(); loadedData += 1; intro.progress(loadedData / 4 * 10, 'Готовим чеки и расписание смен…'); return result; }
async function boot() {
  try {
    [data, buyers, productAtlas, worldArt] = await Promise.all([fetchJSON('data.json'), fetchJSON('assets/buyer-atlas.json'), fetchJSON('assets/product-atlas.json'), fetchJSON('assets/world-art.json')]);
    if (data.customers.length !== 100 || Object.keys(buyers.customers).length !== 100) throw new Error('Каталог покупателей загружен не полностью.');
    warmImages = await preloadAssets(collectGameAssets(buyers, productAtlas, worldArt), { onProgress(done, total, url) {
      const label = url.includes('/buyers/') ? 'Встречаем покупателей…' : url.includes('/products/') ? 'Расставляем покупки…' : 'Зажигаем свет в магазине…';
      intro.progress(10 + done / total * 90, label);
    } });
    intro.ready();
    await intro.entered;
    if (state.active && summarizeShift(state.active).finished) finish();
    else {
      try { if (state.active && sessionStorage.getItem('cashier-last-view') === 'play') view = 'play'; } catch {}
      render();
    }
    intro.hide();
  } catch (error) {
    console.error('Game loading failed:', error);
    intro.fail();
  }
}
boot();
