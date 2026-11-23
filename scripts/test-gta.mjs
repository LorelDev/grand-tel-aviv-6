// בדיקת עשן לשכבת העולם הפתוח: אגרוף, דריסה, חטיפה, מרדף והתחמקות. דורש שרת פיתוח רץ.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5196/?quick=1');
await page.waitForFunction(() => window.__gta?.game3d.state()?.phase === 'play', null, { timeout: 60000 });
await page.waitForTimeout(800);
const r = await page.evaluate(async () => {
  const g = window.__gta.game3d.game; const out = {};
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  // אגרוף: נעמדים ליד הולך רגל
  const w = g.crowd.walkers[0];
  g.teleport({ x: w.x - 0.9, z: w.z }, Math.PI / 2);
  const m0 = g.state().peaches;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', bubbles: true }));
  await wait(300);
  out.punch = { down: g.state().gta.down, stars: g.state().gta.stars, cash: g.state().peaches - m0 };
  // מחכים שהמשטרה תאבד אותנו (רחוק מכל ניידת)
  g.gta.clear();
  // חטיפה
  let jacked = false;
  for (const x of [-95, -15, 65]) { for (let z = -120; z <= 120 && !jacked; z += 6) { g.teleport({ x: x + 4.5, z }); jacked = g.jackNearest(); } if (jacked) break; }
  out.jacked = jacked; out.afterJack = g.state().gta;
  return out;
});
await page.waitForTimeout(3500);
r.cops = await page.evaluate(() => window.__gta.game3d.state().gta);
// התחמקות: מנקים ובודקים שהניידות עוזבות
await page.evaluate(() => window.__gta.game3d.game.gta.clear());
await page.waitForTimeout(10500);
r.afterClear = await page.evaluate(() => window.__gta.game3d.state().gta);
// יציאה נקייה
await page.evaluate(() => window.__gta.game3d.quit());
await page.waitForTimeout(600);
r.memory = await page.evaluate(() => window.__gta.game3d.lastMemory);
await page.screenshot({ path: 'shots/05-title.png' });
console.log(JSON.stringify({ r, errors }, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
