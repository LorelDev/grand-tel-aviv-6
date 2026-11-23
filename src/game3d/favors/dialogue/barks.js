// Barks: the short things people call out when the hero walks past (PURE). Warm, a little funny, never mean.
import { mulberry32 } from '../../rng.js';

const pick = (rnd, a) => a[Math.floor(rnd() * a.length) % a.length];

const GENERAL = ['Boss! My friend!', 'Hey, Boss! Looking good!', 'Boss! Big smile today!', 'Shalom, Boss!', 'There he is!', 'Boss, you always look like you are on a mission!', 'Great chain today, Boss!'];
const MORNING = ['Good morning, Boss! Coffee is on me later.', 'Early bird! Good morning, Boss!'];
const NOON = ['Boss! Have you eaten? Come, there is plenty!', 'Lunchtime, Boss! The falafel is on fire.'];
const EVENING = ['Boss! Beautiful evening, no?', 'Evening, Boss! Look at that sky.'];
const NIGHT = ['Boss! Late night hero!', 'Go home soon, hero! Or not. You are glowing.'];
const FRIENDS = ['Boss! Grab a coffee after?', 'My favourite helper!', 'Boss! You owe me a game, you know.'];
const FAMILY = ['Boss! Call your mother. She is proud already.', 'Boss, motek! Family dinner Friday!'];
const STRANGER = ['Hi! You look like someone who knows the way!', 'Nice day, huh?', 'Hello there! Great glasses!'];

/** One bark for a speaker group. `rel` = 'friends' | 'family' | ... | null, `hour` 0-24. */
export function barkFor({ rel = null, hour = 12, seed = 1 } = {}) {
  const rnd = mulberry32((seed >>> 0) || 1);
  const time = hour < 10 ? MORNING : hour < 15 ? NOON : hour < 20 ? EVENING : NIGHT;
  const pool = [...GENERAL, ...(rel === 'friends' ? FRIENDS : rel === 'family' ? FAMILY : rel === 'strangers' || !rel ? STRANGER : []), ...time];
  return pick(rnd, pool);
}

export const ALL_BARKS = [...GENERAL, ...MORNING, ...NOON, ...EVENING, ...NIGHT, ...FRIENDS, ...FAMILY, ...STRANGER];
