// Grand Tel Aviv 6 — שכבת העולם הפתוח: רמת מבוקשות (כוכבים), ניידות משטרה שרודפות, הולכי רגל שנפגעים/בורחים, ו-HUD של כוכבים וכסף.
// המודול לא מכיר את game.js: הוא מקבל את העולם ואת מצב השחקן בכל פריים, ומודיע החוצה דרך callbacks (onBusted, onEvade).
import * as THREE from 'three';
import { createVehicle } from './vehicle.js';
import { ROAD_X, ROAD_Z, BOUNDS } from './map.js';
import { wrapPi } from '../rng.js';
import './gta.css';

const MAX_STARS = 5;
const CAR_OFFS = [-1.35, 0, 1.35];
const CAR_R = 0.95;
const SEE = 42; // מטרים: ניידת קרובה מזה "רואה" את השחקן
const BUST_R = 5.2;
const BUST_T = 1.7;
/** כמה "חום" מוסיף כל פשע, ועד איזו רמה הוא לבדו יכול להעלות. */
const CRIMES = {
  crash: { heat: 0.34, cap: 2, cool: 1.2 },
  jack: { heat: 1, cap: 3, cool: 0 },
  punch: { heat: 0.7, cap: 2, cool: 0 },
  ped: { heat: 1.1, cap: 4, cool: 0.4 },
  ramcop: { heat: 0.8, cap: 5, cool: 1.5 },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createGta({ scene, map, props, crowd, overlay, sfx, isMuted, volume, getMoney, onBusted, onEvade, toast }) {
  let heat = 0; // 0..5 (רציף); הכוכבים = עיגול כלפי מעלה
  let lost = 0; // שניות בלי ניידת בטווח ראייה
  let bust = 0;
  let spawnIn = 0;
  let frozen = 0; // אחרי מעצר: שקט לכמה שניות
  let t = 0;
  let shownMoney = -1;
  let shownStars = -1;
  const cool = {};
  const cops = [];
  const stats = { busted: 0, evaded: 0, peds: 0, jacks: 0 };
  const stars = () => Math.min(MAX_STARS, Math.ceil(heat - 1e-6));

  // ── HUD ──
  const root = document.createElement('div');
  root.className = 'gta-hud';
  root.innerHTML = '<div class="gta-stars" aria-label="רמת מבוקשות"></div><div class="gta-cash" aria-label="כסף"></div>';
  const starsEl = root.querySelector('.gta-stars');
  const cashEl = root.querySelector('.gta-cash');
  for (let i = 0; i < MAX_STARS; i++) { const s = document.createElement('i'); s.textContent = '★'; starsEl.append(s); }
  const banner = document.createElement('div');
  banner.className = 'gta-banner';
  banner.hidden = true;
  overlay.append(root, banner);
  let bannerTimer = 0;
  function showBanner(text, sub, kind, ms = 3200) {
    banner.className = `gta-banner ${kind}`;
    banner.innerHTML = `<b>${text}</b><span>${sub || ''}</span>`;
    banner.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
  }
  function syncHud() {
    const n = stars();
    const hiding = n > 0 && lost > 1.5;
    if (n !== shownStars) { shownStars = n; [...starsEl.children].forEach((el, i) => el.classList.toggle('on', i < n)); starsEl.classList.toggle('any', n > 0); }
    starsEl.classList.toggle('hiding', hiding);
    const m = Math.round(getMoney());
    if (m !== shownMoney) { shownMoney = m; cashEl.textContent = `₪${m.toLocaleString('en-US')}`; }
  }

  // ── סירנה (מסונתזת) ──
  let actx = null; let sirenGain = null; let sirenOsc = null; let sirenLfo = null;
  function siren(level) {
    const vol = isMuted && isMuted() ? 0 : (volume ? volume() : 1) * level * 0.06;
    if (!actx) {
      if (vol <= 0) return;
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      sirenGain = actx.createGain(); sirenGain.gain.value = 0; sirenGain.connect(actx.destination);
      sirenOsc = actx.createOscillator(); sirenOsc.type = 'sawtooth'; sirenOsc.frequency.value = 760;
      const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
      sirenLfo = actx.createOscillator(); sirenLfo.frequency.value = 1.6;
      const lg = actx.createGain(); lg.gain.value = 190;
      sirenLfo.connect(lg); lg.connect(sirenOsc.frequency);
      sirenOsc.connect(lp); lp.connect(sirenGain);
      sirenOsc.start(); sirenLfo.start();
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    sirenGain.gain.setTargetAtTime(vol, actx.currentTime, 0.15);
  }

  // ── ניידות ──
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.5);
  const stripeGeo = new THREE.BoxGeometry(3.3, 0.2, 1.7);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0x1d4fd8 });
  function makeCop(x, z, heading) {
    const mesh = props.makeCar('sedan', 0xf3f5f9);
    const red = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff2030 }));
    const blue = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
    red.position.set(-0.2, 1.5, -0.32); blue.position.set(-0.2, 1.5, 0.32);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(-0.1, 0.62, 0);
    mesh.group.add(red, blue, stripe);
    const veh = createVehicle(map.world, { x, z, heading, top: 20, accel: 15, reverse: 9, maxSteer: 0.8, grip: 2.2 });
    const c = { veh, mesh, red, blue, stuck: 0, rev: 0, revSteer: 1, plan: 0, tx: x, tz: z, leaving: 0, age: 0 };
    cops.push(c);
    placeCop(c);
    return c;
  }
  function placeCop(c) {
    const s = c.veh.state;
    c.mesh.group.position.set(s.x, 0, s.z);
    c.mesh.group.rotation.set(0, s.heading - Math.PI / 2, 0);
  }
  function removeCop(c) {
    const i = cops.indexOf(c);
    if (i >= 0) cops.splice(i, 1);
    c.mesh.group.remove(c.red, c.blue);
    c.red.material.dispose(); c.blue.material.dispose();
    c.mesh.dispose();
  }
  /** נקודה על כביש במרחק 48-85 מ' מהשחקן, פנויה, ורצוי לא מול העיניים. */
  function spawnPoint(p) {
    let best = null; let bs = -1;
    for (let k = 0; k < 14; k++) {
      const onX = Math.random() < 0.5; // כביש מזרח-מערב (z קבוע) או צפון-דרום
      const line = onX ? ROAD_Z[Math.floor(Math.random() * ROAD_Z.length)] : ROAD_X[Math.floor(Math.random() * ROAD_X.length)];
      const along = (onX ? p.x : p.z) + (Math.random() < 0.5 ? -1 : 1) * (48 + Math.random() * 37);
      const x = onX ? clamp(along, BOUNDS.x0 + 8, BOUNDS.x1 - 8) : line + (Math.random() < 0.5 ? -1.7 : 1.7);
      const z = onX ? line + (Math.random() < 0.5 ? -1.7 : 1.7) : clamp(along, BOUNDS.z0 + 8, BOUNDS.z1 - 8);
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < 42 || map.world.blocked(x, z, 1.3)) continue;
      if (cops.some((c) => Math.hypot(c.veh.state.x - x, c.veh.state.z - z) < 8)) continue;
      const score = 200 - Math.abs(d - 60) + Math.random() * 10;
      if (score > bs) { bs = score; best = { x, z, heading: Math.atan2(p.x - x, p.z - z) }; }
    }
    return best;
  }
  const clearLine = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 3));
    for (let i = 1; i <= n; i++) { const u = i / n; if (map.world.blocked(ax + (bx - ax) * u, az + (bz - az) * u, 0.9)) return false; }
    return true;
  };
  /** לאן לכוון: ישר לשחקן אם הדרך פנויה, אחרת לצומת שמקרב אליו (העיר היא רשת). */
  function planCop(c, p) {
    const s = c.veh.state;
    if (clearLine(s.x, s.z, p.x, p.z)) { c.tx = p.x; c.tz = p.z; c.direct = true; return; }
    c.direct = false;
    let best = null; let bc = Infinity;
    for (const ix of ROAD_X) for (const iz of ROAD_Z) {
      const d0 = Math.hypot(ix - s.x, iz - s.z);
      if (d0 < 6) continue;
      const cost = d0 + Math.hypot(ix - p.x, iz - p.z) * 1.15;
      if (cost < bc && clearLine(s.x, s.z, ix, iz)) { bc = cost; best = [ix, iz]; }
    }
    if (!best) { // לא רואים צומת: חוזרים לציר הכביש הקרוב
      let bd = Infinity;
      for (const ix of ROAD_X) { const d = Math.abs(ix - s.x); if (d < bd) { bd = d; best = [ix, s.z + Math.sign(p.z - s.z || 1) * 6]; } }
      for (const iz of ROAD_Z) { const d = Math.abs(iz - s.z); if (d < bd) { bd = d; best = [s.x + Math.sign(p.x - s.x || 1) * 6, iz]; } }
    }
    c.tx = best[0]; c.tz = best[1];
  }
  function stepCop(c, dt, p, pSpeed, chasing) {
    const s = c.veh.state;
    c.age += dt;
    c.plan -= dt;
    if (chasing && c.plan <= 0) { c.plan = 0.35; planCop(c, p); }
    const dx = c.tx - s.x; const dz = c.tz - s.z;
    const dist = Math.hypot(dx, dz);
    const dP = Math.hypot(p.x - s.x, p.z - s.z);
    const err = wrapPi(Math.atan2(dx, dz) - s.heading);
    let steer = clamp(-err * 2.4, -1, 1);
    let throttle = Math.abs(err) > 1.2 ? 0.45 : 1;
    let brake = false;
    if (!chasing) { throttle = 0; brake = true; steer = 0; } // המרדף נגמר: עוצרים בצד ונעלמים
    else if (c.rev > 0) { c.rev -= dt; throttle = -1; steer = c.revSteer; }
    else {
      if (c.direct && dP < 7) { throttle = s.speed < pSpeed ? 0.6 : 0; brake = s.speed > pSpeed + 1.5; } // צמודים: חוסמים, לא עוברים דרכו
      else if (!c.direct && dist < 9) throttle = 0.5; // מאטים לפני פנייה בצומת
      const wantsToMove = throttle > 0.3;
      if (wantsToMove && Math.abs(s.speed) < 0.9) { c.stuck += dt; if (c.stuck > 1.1) { c.stuck = 0; c.rev = 0.9 + Math.random() * 0.5; c.revSteer = err > 0 ? 1 : -1; } } else c.stuck = Math.max(0, c.stuck - dt);
    }
    c.veh.update(dt, { throttle, steer, brake });
    // אורות: אדום/כחול מתחלפים
    const on = chasing && Math.floor(t * 5.5) % 2 === 0;
    c.red.material.color.setHex(chasing ? (on ? 0xff2030 : 0x40060a) : 0x40060a);
    c.blue.material.color.setHex(chasing ? (on ? 0x0a1640 : 0x2a6bff) : 0x0a1640);
    return dP;
  }
  /** שני רכבים (שלושה עיגולים כל אחד): דוחף אותם זה מזה, מחזיר את עוצמת המכה. */
  function collide(a, b, aMass = 0.5) {
    const af = { x: Math.sin(a.heading), z: Math.cos(a.heading) }; const bf = { x: Math.sin(b.heading), z: Math.cos(b.heading) };
    let best = null;
    for (const oa of CAR_OFFS) for (const ob of CAR_OFFS) {
      const ax = a.x + af.x * oa; const az = a.z + af.z * oa; const bx = b.x + bf.x * ob; const bz = b.z + bf.z * ob;
      const d = Math.hypot(bx - ax, bz - az);
      if (d < 2 * CAR_R && (!best || 2 * CAR_R - d > best.over)) best = { nx: d > 1e-4 ? (bx - ax) / d : af.x, nz: d > 1e-4 ? (bz - az) / d : af.z, over: 2 * CAR_R - d };
    }
    if (!best) return 0;
    const rel = Math.abs((a.vx - b.vx) * best.nx + (a.vz - b.vz) * best.nz);
    a.x -= best.nx * best.over * (1 - aMass); a.z -= best.nz * best.over * (1 - aMass);
    b.x += best.nx * best.over * aMass; b.z += best.nz * best.over * aMass;
    a.speed *= 0.72; b.speed *= 0.72;
    return rel;
  }

  // ── הולכי רגל ──
  function panic(x, z, r = 16) {
    for (const w of crowd.walkers) {
      if (w.down > 0) continue;
      if (Math.hypot(w.x - x, w.z - z) < r) { if (w.speed0 == null) w.speed0 = w.speed; w.panic = 5 + Math.random() * 3; w.speed = w.speed0 * 3.1; w.stop = 0; }
    }
  }
  function knock(w, dirX, dirZ, force) {
    w.down = 6 + Math.random() * 4;
    w.stop = w.down;
    w.x += dirX * force; w.z += dirZ * force;
    w.fallYaw = Math.atan2(dirX, dirZ);
    w.panic = 0;
    if (w.speed0 != null) w.speed = w.speed0;
  }

  function crime(kind, at) {
    const def = CRIMES[kind];
    if (!def || frozen > 0) return false;
    if ((cool[kind] || 0) > 0) return false;
    cool[kind] = def.cool;
    const before = stars();
    if (heat < def.cap) heat = Math.min(def.cap, heat + def.heat);
    lost = 0;
    if (at) panic(at.x, at.z);
    const now = stars();
    if (now > before) { if (before === 0) { spawnIn = 1.4; toast('המשטרה בדרך אליך!', 2600); } try { sfx.pop(); } catch { /* אין קול */ } }
    return true;
  }
  function clearWanted() { heat = 0; lost = 0; bust = 0; }

  const api = {
    get stars() { return stars(); },
    get cops() { return cops; },
    stats,
    crime,
    clear: clearWanted,
    /** משימה שמתחילה עם משטרה על הזנב. */
    setStars(n) { heat = Math.max(heat, clamp(n, 0, MAX_STARS)); lost = 0; if (!cops.length) spawnIn = 0.8; },
    banner: showBanner,
    /** מכשולים לתנועה הרגילה (שתעצור מאחורי ניידת). */
    obstacles() { return cops.map((c) => ({ x: c.veh.state.x, z: c.veh.state.z, r: 1.4 })); },
    /** אגרוף ברחוב: מפיל את מי שעומד מולו. מחזיר את מי שנפגע (או null). */
    punch(p) {
      const fx = Math.sin(p.heading); const fz = Math.cos(p.heading);
      let best = null; let bd = 1.9;
      for (const w of crowd.walkers) {
        if (w.down > 0) continue;
        const dx = w.x - p.x; const dz = w.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < bd && (d < 0.7 || (dx * fx + dz * fz) / d > 0.35)) { bd = d; best = w; }
      }
      if (!best) return null;
      knock(best, fx, fz, 0.9);
      stats.peds++;
      crime('punch', p);
      return best;
    },
    /**
     * @param {number} dt
     * @param {{ player: object, veh: object|null, active: boolean }} o player = מצב ההליכה (x, z, heading, speed); veh = מצב הרכב כשנוהגים
     */
    update(dt, { player, veh, active }) {
      t += dt;
      for (const k in cool) if (cool[k] > 0) cool[k] -= dt;
      if (frozen > 0) frozen -= dt;
      const p = veh || player;
      const pSpeed = veh ? veh.speed : player.speed;

      // הולכי רגל: מי ששוכב קם בסוף; מי שנבהל נרגע; רכב מהיר מפיל
      for (const w of crowd.walkers) {
        if (w.down > 0) { w.down -= dt; if (w.down <= 0) w.down = 0; continue; }
        if (w.panic > 0) { w.panic -= dt; if (w.panic <= 0 && w.speed0 != null) w.speed = w.speed0; }
        if (veh && active && Math.abs(veh.speed) > 4.5) {
          const fx = Math.sin(veh.heading); const fz = Math.cos(veh.heading);
          for (const o of CAR_OFFS) {
            if (Math.hypot(w.x - (veh.x + fx * o), w.z - (veh.z + fz * o)) < 1.3) {
              const sgn = Math.sign(veh.speed);
              knock(w, fx * sgn, fz * sgn, 1.2 + Math.abs(veh.speed) * 0.12);
              veh.speed *= 0.9;
              stats.peds++;
              crime('ped', veh);
              try { sfx.pop(); } catch { /* אין קול */ }
              break;
            }
          }
        }
      }

      // ניידות
      const n = stars();
      const chasing = n > 0 && active;
      if (chasing && cops.filter((c) => !c.leaving).length < n) {
        spawnIn -= dt;
        if (spawnIn <= 0) { const sp = spawnPoint(p); if (sp) makeCop(sp.x, sp.z, sp.heading); spawnIn = 2.2; }
      }
      let nearest = Infinity;
      for (const c of [...cops]) {
        if (!chasing && !c.leaving) c.leaving = 0.01;
        const d = stepCop(c, dt, p, Math.max(0, pSpeed), chasing && !c.leaving);
        if (c.leaving) { c.leaving += dt; if (c.leaving > 9 || d > 60) { removeCop(c); continue; } } else if (d > 150) { removeCop(c); continue; } else nearest = Math.min(nearest, d);
      }
      // התנגשויות: ניידת מול הרכב של השחקן, ניידת מול ניידת, והולך רגל שנדחף מהדרך
      for (let i = 0; i < cops.length; i++) {
        const cs = cops[i].veh.state;
        if (veh) { const hit = collide(veh, cs, 0.5); if (hit > 0) { veh.hit = Math.max(veh.hit, hit); if (hit > 6 && !cops[i].leaving) crime('ramcop'); } }
        else {
          const fx = Math.sin(cs.heading); const fz = Math.cos(cs.heading);
          for (const o of CAR_OFFS) { const dx = player.x - (cs.x + fx * o); const dz = player.z - (cs.z + fz * o); const d = Math.hypot(dx, dz); if (d < 1.45 && d > 1e-4) { player.x += (dx / d) * (1.45 - d); player.z += (dz / d) * (1.45 - d); } }
        }
        for (let j = i + 1; j < cops.length; j++) collide(cs, cops[j].veh.state, 0.5);
        placeCop(cops[i]);
      }

      // מעצר / התחמקות
      if (chasing) {
        if (nearest < SEE) lost = 0; else lost += dt;
        const slow = veh ? Math.abs(veh.speed) < 2.6 : player.speed < 5;
        if (nearest < BUST_R && slow) bust += dt; else bust = Math.max(0, bust - dt * 1.5);
        if (bust > BUST_T) {
          const had = n;
          clearWanted(); frozen = 4; stats.busted++;
          const fine = onBusted(had);
          showBanner('נעצרת!', fine > 0 ? `קנס: ₪${fine.toLocaleString('en-US')}` : 'שוחררת באזהרה', 'busted');
        } else if (lost > 9 + n * 3) {
          const had = n;
          clearWanted(); stats.evaded++;
          const bonus = onEvade ? onEvade(had) : 0;
          showBanner('התחמקת!', bonus > 0 ? `+₪${bonus}` : '', 'evaded', 2400);
        }
      }
      siren(chasing && nearest < 90 ? clamp(1.15 - nearest / 90, 0.15, 1) : 0);
      root.classList.toggle('busting', bust > 0.25);
      syncHud();
    },
    state() { return { stars: stars(), heat: Math.round(heat * 100) / 100, cops: cops.length, lost: Math.round(lost * 10) / 10, bust: Math.round(bust * 100) / 100, ...stats, down: crowd.walkers.filter((w) => w.down > 0).length }; },
    dispose() {
      clearTimeout(bannerTimer);
      for (const c of [...cops]) removeCop(c);
      lightGeo.dispose(); stripeGeo.dispose(); stripeMat.dispose();
      for (const w of crowd.walkers) { w.down = 0; w.panic = 0; if (w.speed0 != null) w.speed = w.speed0; }
      if (actx) { try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* כבר נעצר */ } actx.close().catch(() => {}); actx = null; }
      root.remove(); banner.remove();
    },
  };
  syncHud();
  return api;
}
