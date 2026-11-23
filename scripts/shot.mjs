// צילומי מסך של המשחק דרך Chrome המותקן (playwright-core): node scripts/shot.mjs  → shots/*.png
// דורש שרת פיתוח רץ (npm run dev).
import { chromium } from 'playwright-core';

const URL = process.env.URL || 'http://localhost:5196/?quick=1';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__gta && window.__gta.game3d.state() && window.__gta.game3d.state().phase === 'play', null, { timeout: 60000 });
await page.waitForTimeout(1500);
const shot = (name) => page.screenshot({ path: `shots/${name}.png` });
await shot('01-start');

// חטיפת רכב + מרדף
const jacked = await page.evaluate(() => {
  const g = window.__gta.game3d.game;
  for (const x of [-95, -15, 65]) for (let z = -120; z <= 120; z += 6) { g.teleport({ x: x + 4.5, z }); if (g.jackNearest()) return true; }
  return false;
});
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await shot('02-jacked');
await page.waitForTimeout(5000);
await page.keyboard.up('KeyW');
await shot('03-chase');
await page.waitForTimeout(4500);
await shot('04-busted');
const state = await page.evaluate(() => window.__gta.game3d.state().gta);
console.log(JSON.stringify({ jacked, state, errors }, null, 1));
await browser.close();
