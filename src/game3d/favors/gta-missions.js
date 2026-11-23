// Grand Tel Aviv 6 — המשימות: עמודי אור צהובים ליד מקומות בעיר; נכנסים לעמוד והמשימה מתחילה.
//   steal    — "הזמנה מעוזי": לגנוב רכב מסוג מסוים ולהביא אותו למוסך לפני שהזמן נגמר.
//   getaway  — "נהג מילוט": המשטרה כבר בעקבותיך (3 כוכבים); להתחמק בלי להיעצר.
//   delivery — "משלוח דחוף": לעבור בסדרת נקודות בעיר נגד השעון.
// המודול לא מכיר את game.js: הוא מקבל מצב בכל פריים ומודיע החוצה דרך callbacks.
import * as THREE from 'three';

const KIND_NAME = { hatch: "האצ'בק", sedan: 'סדאן', van: 'ואן מסחרי' };
const GIVERS = [
  { id: 'steal', place: 'workshop', title: 'הזמנה מעוזי', color: 0xffc928, blurb: 'עוזי צריך רכב. לא שואל מאיפה.' },
  { id: 'getaway', place: 'kiosk', title: 'נהג מילוט', color: 0xff5a4f, blurb: 'מישהו הלשין. תיעלם מהמשטרה.' },
  { id: 'delivery', place: 'cafe', title: 'משלוח דחוף', color: 0x39d98a, blurb: 'חבילות. לא לפתוח. לא לאחר.' },
];
const DROP_PLACES = ['home', 'mum', 'auntie', 'cityhall', 'perach', 'studio', 'startup', 'sidegig', 'busstop', 'park', 'court', 'workshop', 'kiosk'];
const TRIGGER_R = 3.4;
const fmtTime = (s) => { const n = Math.max(0, Math.ceil(s)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
const money = (n) => `₪${Math.round(n).toLocaleString('en-US')}`;

export function createGtaMissions({ scene, map, overlay, sfx, toast, earn, setStars, takeCar, banner }) {
  /** הנקודה על הכביש מול הדלת של מקום. */
  const spot = (pid) => { const d = map.places[pid].door; return { x: d.x + d.nx * 5.6, z: d.z + d.nz * 5.6, place: pid }; };
  const done = { steal: 0, getaway: 0, delivery: 0 };
  let active = null; // { id, title, stage, t, limit, target, ... }
  let cooldown = 0;
  let t = 0;
  let shown = '';

  // ── עמודי האור ──
  const discGeo = new THREE.CylinderGeometry(2.6, 2.6, 0.5, 28, 1, true);
  const beamGeo = new THREE.CylinderGeometry(0.42, 0.42, 34, 10, 1, true);
  function makeMarker(color, label) {
    const g = new THREE.Group();
    const m1 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const m2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const disc = new THREE.Mesh(discGeo, m1); disc.position.y = 0.3;
    const beam = new THREE.Mesh(beamGeo, m2); beam.position.y = 17;
    g.add(disc, beam);
    let sp = null; let tex = null;
    if (label) {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
      const x = cv.getContext('2d');
      x.fillStyle = 'rgba(14,16,26,0.88)'; x.beginPath(); x.roundRect(16, 20, 480, 112, 56); x.fill();
      x.strokeStyle = `#${new THREE.Color(color).getHexString()}`; x.lineWidth = 6; x.stroke();
      x.fillStyle = '#fff'; x.font = '800 58px Rubik, Heebo, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl';
      x.fillText(label, 256, 80);
      tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
      sp.scale.set(6.4, 2, 1); sp.position.y = 4.4; sp.renderOrder = 998;
      g.add(sp);
    }
    scene.add(g);
    return {
      group: g, disc,
      at(p) { g.position.set(p.x, 0, p.z); },
      dispose() { scene.remove(g); m1.dispose(); m2.dispose(); if (sp) { sp.material.dispose(); tex.dispose(); } },
    };
  }
  const givers = GIVERS.map((def) => { const p = spot(def.place); const mk = makeMarker(def.color, def.title); mk.at(p); return { def, p, mk }; });
  const target = makeMarker(0x4fc3ff, null);
  target.group.visible = false;

  // ── הכרטיס ──
  const card = document.createElement('div');
  card.className = 'gta-mission';
  card.hidden = true;
  card.innerHTML = '<div class="gm-title"></div><div class="gm-obj"></div><div class="gm-row"><span class="gm-arrow">▲</span><span class="gm-dist"></span><span class="gm-time"></span></div>';
  overlay.append(card);
  const el = (c) => card.querySelector(c);

  function setTarget(p) { active.target = p; if (p) { target.at(p); target.group.visible = true; } else target.group.visible = false; }
  function start(def) {
    const base = { id: def.id, title: def.title, t: 0, stage: 0 };
    if (def.id === 'steal') {
      const kinds = Object.keys(KIND_NAME);
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      active = { ...base, kind, limit: 150, reward: 350 + 60 * Math.min(5, done.steal), obj: `גנוב ${KIND_NAME[kind]} (F ליד רכב)` };
      setTarget(null);
    } else if (def.id === 'getaway') {
      active = { ...base, limit: 0, reward: 500 + 80 * Math.min(5, done.getaway), obj: 'תתחמק מהמשטרה — אל תיתפס!' };
      setTarget(null);
      setStars(3);
    } else {
      const n = 3 + Math.min(2, done.delivery);
      const pool = DROP_PLACES.filter((id) => map.places[id]);
      const stops = [];
      let from = spot(def.place);
      let total = 0;
      while (stops.length < n && pool.length) {
        const i = Math.floor(Math.random() * pool.length);
        const s = spot(pool.splice(i, 1)[0]);
        const d = Math.abs(s.x - from.x) + Math.abs(s.z - from.z);
        if (d < 40) continue;
        total += d; stops.push(s); from = s;
      }
      active = { ...base, stops, limit: Math.round(35 + total / 7.5), reward: 110 * stops.length, obj: '' };
      setTarget(stops[0]);
    }
    for (const g of givers) g.mk.group.visible = false;
    card.hidden = false;
    banner(def.title, def.blurb, 'done', 2600);
    try { sfx.ding(); } catch { /* אין קול */ }
  }
  function finish(ok, why = '') {
    const m = active;
    active = null;
    cooldown = 6;
    target.group.visible = false;
    card.hidden = true;
    shown = '';
    if (ok) {
      done[m.id]++;
      let pay = m.reward;
      if (m.limit) pay += Math.round(Math.max(0, m.limit - m.t) * 2); // בונוס על זמן שנשאר
      earn(pay);
      banner('משימה הושלמה!', `+${money(pay)}`, 'done', 3400);
      try { sfx.ding(); } catch { /* אין קול */ }
    } else {
      banner('המשימה נכשלה', why, 'failed', 3000);
    }
  }

  const api = {
    get active() { return active; },
    givers,
    /** אירועים מהמשטרה: 'busted' | 'evaded'. */
    notify(ev) {
      if (!active) return;
      if (ev === 'busted') finish(false, 'נעצרת');
      else if (ev === 'evaded' && active.id === 'getaway') finish(true);
    },
    /** נקודות למפה הקטנה. */
    points() {
      if (active) return active.target ? [{ x: active.target.x, z: active.target.z, color: '#4fc3ff', label: '', ring: true }] : [];
      return cooldown > 0 ? [] : givers.map((g) => ({ x: g.p.x, z: g.p.z, color: `#${new THREE.Color(g.def.color).getHexString()}`, label: '', ring: false }));
    },
    /**
     * @param {number} dt
     * @param {{ player: {x:number,z:number,speed:number}, car: {kind:string, mine:boolean}|null, camYaw: number, enabled: boolean }} s
     */
    update(dt, { player, car, camYaw, enabled }) {
      t += dt;
      const pulse = 1 + Math.sin(t * 3.2) * 0.08;
      for (const g of givers) g.mk.disc.scale.set(pulse, 1, pulse);
      target.disc.scale.set(pulse, 1, pulse);
      if (!enabled) return;
      if (!active) {
        if (cooldown > 0) { cooldown -= dt; if (cooldown <= 0) for (const g of givers) g.mk.group.visible = true; return; }
        for (const g of givers) if (Math.hypot(g.p.x - player.x, g.p.z - player.z) < TRIGGER_R && player.speed < 9) { start(g.def); break; }
        return;
      }
      const m = active;
      m.t += dt;
      if (m.limit && m.t >= m.limit) { finish(false, 'נגמר הזמן'); return; }
      const near = (p, r = TRIGGER_R + 0.8) => Math.hypot(p.x - player.x, p.z - player.z) < r;
      if (m.id === 'steal') {
        const has = !!(car && !car.mine && car.kind === m.kind);
        if (has && m.stage === 0) { m.stage = 1; m.obj = 'הבא את הרכב למוסך של עוזי'; setTarget(spot('workshop')); toast('יש רכב! עכשיו למוסך של עוזי', 2600); }
        else if (!has && m.stage === 1) { m.stage = 0; m.obj = `גנוב ${KIND_NAME[m.kind]} (F ליד רכב)`; setTarget(null); }
        else if (has && m.stage === 1 && near(m.target, 5) && player.speed < 7) { takeCar(); finish(true); return; }
      } else if (m.id === 'delivery') {
        m.obj = `משלוח ${m.stage + 1} מתוך ${m.stops.length}`;
        if (near(m.target, 4.6)) {
          m.stage++;
          try { sfx.ding(); } catch { /* אין קול */ }
          if (m.stage >= m.stops.length) { finish(true); return; }
          setTarget(m.stops[m.stage]);
        }
      }
      // הכרטיס
      const key = `${m.obj}|${Math.ceil(m.limit ? m.limit - m.t : 0)}|${m.target ? Math.round(Math.hypot(m.target.x - player.x, m.target.z - player.z)) : -1}`;
      if (key !== shown) {
        shown = key;
        el('.gm-title').textContent = m.title;
        el('.gm-obj').textContent = m.obj;
        el('.gm-time').textContent = m.limit ? fmtTime(m.limit - m.t) : '';
        el('.gm-time').classList.toggle('low', !!m.limit && m.limit - m.t < 15);
        el('.gm-dist').textContent = m.target ? `${Math.round(Math.hypot(m.target.x - player.x, m.target.z - player.z))} מ'` : '';
        el('.gm-arrow').style.visibility = m.target ? 'visible' : 'hidden';
      }
      if (m.target) { // החץ: הכיוון ליעד ביחס למבט המצלמה
        const want = Math.atan2(m.target.x - player.x, m.target.z - player.z);
        el('.gm-arrow').style.transform = `rotate(${(camYaw - want).toFixed(3)}rad)`;
      }
    },
    state() { return { active: active ? { id: active.id, stage: active.stage, obj: active.obj, left: active.limit ? Math.round(active.limit - active.t) : null, target: active.target ? { x: active.target.x, z: active.target.z } : null, kind: active.kind || null } : null, done: { ...done }, cooldown: Math.round(cooldown * 10) / 10, givers: givers.map((g) => ({ id: g.def.id, x: g.p.x, z: g.p.z })) }; },
    dispose() { for (const g of givers) g.mk.dispose(); target.dispose(); discGeo.dispose(); beamGeo.dispose(); card.remove(); },
  };
  return api;
}
