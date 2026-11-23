// בדיקת עשן למשימות: משלוח, גניבה לפי הזמנה, נהג מילוט (כישלון במעצר). דורש שרת פיתוח רץ.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5196/?quick=1');
await page.waitForFunction(() => window.__gta?.game3d.state()?.phase === 'play', null, { timeout: 60000 });
await page.waitForTimeout(800);
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => { const s = window.__gta.game3d.state(); return { jobs: s.jobs, gta: s.gta, money: s.peaches, driving: s.driving }; });
const tp = (p) => page.evaluate((q) => { window.__gta.game3d.game.teleport(q); }, p);
const giver = async (id) => (await st()).jobs.givers.find((g) => g.id === id);
const r = {};

// 1) משלוח
const m0 = (await st()).money;
await tp(await giver('delivery')); await wait(400);
r.deliveryStart = (await st()).jobs.active;
await page.screenshot({ path: 'shots/06-mission-card.png' });
for (let i = 0; i < 6; i++) { const a = (await st()).jobs.active; if (!a) break; await tp(a.target); await wait(350); }
r.delivery = { done: (await st()).jobs.done, earned: (await st()).money - m0 };
await page.screenshot({ path: 'shots/07-mission-done.png' });
await wait(6800);

// 2) גניבה לפי הזמנה
await tp(await giver('steal')); await wait(400);
const want = (await st()).jobs.active;
r.stealStart = want;
const got = await page.evaluate((kind) => {
  const g = window.__gta.game3d.game;
  for (let tries = 0; tries < 40; tries++) {
    for (const x of [-95, -15, 65]) for (let z = -120; z <= 120; z += 6) {
      g.teleport({ x: x + 4.5, z });
      if (g.jackNearest()) { if (g.jobs.active && g.jobs.active.stage === 0) { /* wait for update */ } return true; }
    }
  }
  return false;
}, want.kind);
await wait(300);
// חוטפים עד שמתקבל הסוג הנכון (יוצאים מהרכב ומנסים שוב)
for (let k = 0; k < 30 && (await st()).jobs.active?.stage === 0; k++) {
  await page.keyboard.press('KeyF'); await wait(150);
  await page.evaluate(() => { const g = window.__gta.game3d.game; g.gta.clear(); for (const x of [-95, -15, 65]) for (let z = -120; z <= 120; z += 6) { g.teleport({ x: x + 4.5, z }); if (g.jackNearest()) return; } });
  await wait(250);
}
r.stealStage = (await st()).jobs.active;
await page.evaluate(() => { const g = window.__gta.game3d.game; g.gta.clear(); const t = g.jobs.active.target; g.placeCar(t.x, t.z, 0); });
await wait(500);
r.steal = { done: (await st()).jobs.done, driving: (await st()).driving, gotCar: got };
await wait(6800);

// 3) נהג מילוט: מתחיל עם 3 כוכבים; עומדים במקום עד מעצר → נכשל
await page.evaluate(() => window.__gta.game3d.game.gta.clear());
await tp(await giver('getaway')); await wait(500);
r.getawayStart = { active: (await st()).jobs.active?.id, stars: (await st()).gta.stars };
await page.screenshot({ path: 'shots/08-getaway.png' });
for (let k = 0; k < 40 && (await st()).jobs.active; k++) await wait(1000);
r.getawayEnd = { active: (await st()).jobs.active, gta: (await st()).gta };
console.log(JSON.stringify({ r, errors }, null, 1));
await browser.close();
process.exit(errors.length ? 1 : 0);
