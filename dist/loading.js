/** All game pictures are warmed before a shift can begin. */
export function collectGameAssets(buyers, products, world) {
  return [...new Set([
    ...world.variants.map(item => item.src),
    ...products.sheets.map(item => item.src),
    ...buyers.sheets.map(item => item.src),
    ...(world.dogs || []).map(item => item.src),
  ])];
}

export function loadImage(url, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const picture = new Image();
    const timer = setTimeout(() => { picture.onload = null; picture.onerror = null; reject(new Error(`Image timed out: ${url}`)); }, timeoutMs);
    picture.onload = async () => {
      try { if (picture.decode) await picture.decode(); clearTimeout(timer); resolve(picture); }
      catch (error) { clearTimeout(timer); reject(error); }
    };
    picture.onerror = () => { clearTimeout(timer); reject(new Error(`Image unavailable: ${url}`)); };
    picture.src = url;
  });
}

export async function preloadAssets(urls, { concurrency = 4, load = loadImage, onProgress = () => {} } = {}) {
  const unique = [...new Set(urls)];
  const loaded = new Array(unique.length);
  let cursor = 0, completed = 0, failed = false;
  async function worker() {
    while (cursor < unique.length && !failed) {
      const index = cursor++;
      try {
        loaded[index] = await load(unique[index]);
        if (failed) return;
        completed += 1;
        onProgress(completed, unique.length, unique[index]);
      } catch (error) { failed = true; throw error; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(unique.length, Math.max(1, Math.floor(concurrency) || 1)) }, worker));
  return loaded;
}

export function createIntroScreen({ resume = false } = {}) {
  const root = document.querySelector('#game-intro');
  const start = root.querySelector('[data-intro-start]');
  const welcome = root.querySelector('.intro-welcome');
  const loading = root.querySelector('.intro-loading');
  const bar = root.querySelector('[role=progressbar]');
  const fill = root.querySelector('.intro-progress-fill');
  const percent = root.querySelector('.intro-percent');
  const status = root.querySelector('.intro-load-status');
  const readyNote = root.querySelector('.intro-ready-note');
  let progress = 0;
  let resolveStart;
  const entered = new Promise(resolve => { resolveStart = resolve; });
  if (resume) start.querySelector('span').textContent = 'Продолжить игру';
  start.disabled = false;
  start.addEventListener('click', () => {
    welcome.hidden = true; loading.hidden = false;
    document.body.dataset.loading = 'true';
    resolveStart();
  }, { once: true });
  return {
    entered,
    progress(value, text) {
      progress = Math.max(progress, Math.min(100, Math.floor(value)));
      bar.setAttribute('aria-valuenow', String(progress));
      fill.style.width = `${progress}%`;
      percent.textContent = `${progress}%`;
      if (text) status.textContent = text;
    },
    ready() { readyNote.textContent = 'Магазин готов — можно начинать'; this.progress(100, 'Всё готово. Открываем магазин…'); },
    fail() {
      welcome.hidden = true; loading.hidden = false;
      root.classList.add('intro-failed');
      root.querySelector('.intro-loading h2').textContent = 'Не удалось открыть магазин';
      status.textContent = 'Проверь подключение к интернету и попробуй ещё раз.';
      root.querySelector('.intro-retry').hidden = false;
      root.querySelector('.intro-retry').addEventListener('click', () => location.reload(), { once: true });
    },
    hide() {
      document.body.classList.remove('is-booting');
      delete document.body.dataset.loading;
      root.classList.add('intro-leaving');
      root.setAttribute('aria-hidden', 'true');
      root.inert = true;
      setTimeout(() => root.remove(), 400);
    },
  };
}
