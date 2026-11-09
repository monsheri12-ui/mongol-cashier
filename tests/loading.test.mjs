import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectGameAssets, preloadAssets } from '../dist/loading.js';

test('loading covers every real sheet, world and dog once, including the current banana asset', async () => {
  const manifests = await Promise.all(['buyer-atlas.json','product-atlas.json','world-art.json'].map(name => readFile(new URL(`../dist/assets/${name}`, import.meta.url), 'utf8').then(JSON.parse)));
  const urls = collectGameAssets(...manifests);
  assert.equal(urls.length, 27);
  assert.equal(new Set(urls).size, 27);
  assert.ok(urls.includes('assets/products/banana-bunch-v3.webp'));
  assert.equal(urls.filter(url => url.includes('/buyers/')).length, 17);
  for (const url of urls) assert.ok((await readFile(new URL(`../dist/${url}`, import.meta.url))).length > 0, url);
});

test('asset progress counts real completions with bounded parallelism and preserved result order', async () => {
  let active = 0, maximum = 0;
  const progress = [];
  const urls = ['slow','fast','third','fourth','slow'];
  const result = await preloadAssets(urls, { concurrency: 2, load: async url => {
    active += 1; maximum = Math.max(maximum,active);
    await new Promise(resolve => setTimeout(resolve,url === 'slow' ? 15 : 1));
    active -= 1; return `loaded:${url}`;
  }, onProgress(done,total,url) { progress.push({done,total,url}); } });
  assert.equal(maximum, 2);
  assert.deepEqual(result, ['loaded:slow','loaded:fast','loaded:third','loaded:fourth']);
  assert.deepEqual(progress.map(item => item.done), [1,2,3,4]);
  assert.ok(progress.every(item => item.total === 4));
  assert.equal(progress[0].url, 'fast', 'progress must follow the actual completion, not URL order');
});

test('a missing image rejects loading and never reports a completed game', async () => {
  const progress = [];
  await assert.rejects(preloadAssets(['good','missing','unstarted'], { concurrency: 1,
    load: async url => { if (url === 'missing') throw Error('offline'); return url; },
    onProgress(done,total,url) { progress.push({done,total,url}); },
  }), /offline/);
  assert.deepEqual(progress, [{done:1,total:3,url:'good'}]);
});

test('empty and duplicate warm-cache lists do not invent progress events or repeat a download', async () => {
  let count = 0;
  assert.deepEqual(await preloadAssets([], { load: async () => { count++; } }), []);
  const images = await preloadAssets(['cached','cached'], { load: async () => { count++; return 'image'; } });
  assert.equal(count, 1);
  assert.deepEqual(images, ['image']);
});
