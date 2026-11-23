// Grand Tel Aviv 6 — נקודת הכניסה. מסך פתיחה → מפעיל את המשחק במסך מלא דרך ה-host של game3d.
import { initGame3D, launchGame3D, prewarmGame3D, game3dDebug } from './game3d/host.js';
import { storage } from './core/storage.js';
import './title.css';

const prefs = { volume: storage.get('gta:volume', 0.7), reduceMotion: storage.get('gta:reduceMotion', false) };
const listeners = new Map();
const bus = {
  on(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
  emit(name, data) { (listeners.get(name) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
};

initGame3D({
  storage,
  emit: (n, d) => bus.emit(n, d),
  isMuted: () => prefs.volume <= 0,
  volume: () => prefs.volume,
  reduceMotion: () => !!prefs.reduceMotion,
  setVolume: (v) => { prefs.volume = Math.max(0, Math.min(1, +v || 0)); storage.set('gta:volume', prefs.volume); },
  setReduceMotion: (b) => { prefs.reduceMotion = !!b; storage.set('gta:reduceMotion', prefs.reduceMotion); },
});

const title = document.getElementById('title');
const startBtn = document.getElementById('start');
const q = new URLSearchParams(window.location.search);

function start(opts = {}) {
  title.classList.add('gone');
  launchGame3D('favors', opts);
}
bus.on('game3d:closed', () => { title.classList.remove('gone'); startBtn.focus(); });
startBtn.addEventListener('click', () => start());
window.addEventListener('keydown', (e) => { if (e.code === 'Enter' && !game3dDebug.overlayOpen) start(); });

// בניית הדמויות ברקע בזמן שמסך הפתיחה מוצג
(window.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => prewarmGame3D('favors'));

// כלי פיתוח/בדיקות: window.__gta.game3d ; ?quick=1 נכנס ישר למשחק
window.__gta = { game3d: game3dDebug, start, bus };
window.__ori = window.__gta;
if (q.has('quick')) start({ quick: true });
