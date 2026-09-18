// [key, label, points, per?] — `per` (optional) means the points are only
// awarded for every `per` occurrences, e.g. 2 receptions = 1 point.
export const VOLLEYBALL_RULES = [
  ['best_player', 'Best player', 5],
  ['best_hitter', 'Best hitter', 3],
  ['best_blocker', 'Best blocker', 3],
  ['best_libero', 'Best libero', 7],
  ['best_setter', 'Best setter', 5],
  ['point_won', 'Player won the point', 1],
  ['reception', 'Receptions (every 2)', 1, 2],
  ['reception_error', 'Reception error', -1],
  ['attack_error', 'Attack error', -1],
  ['serve_error', 'Serve error', -1],
  ['block_error', 'Block error', -1],
  ['block', 'Block', 2],
  ['ace_serve', 'Ace serve', 3],
  ['net', 'Net fault', -1],
  ['carry', 'Carry / double', -1],
  ['yellow_card', 'Yellow card', -2],
  ['red_card', 'Red card', -5],
];

// How a rule's worth reads on screen: "+1", "+1 / 2" (per-N rules), "-5".
export function volleyballRuleWorthText([, , value, per]) {
  return `${value > 0 ? '+' : ''}${value}${per ? ` / ${per}` : ''}`;
}

// ---------------- front / back line ----------------
// The court has two rows of three: starters[0..2] are the front row (at the
// net) and starters[3..5] the back row. The host decides which line each
// player belongs to (stored in the player's `role` column as 'front' or
// 'back'; anything else — e.g. the old default 'Player' — means "not set
// yet"), and a manager's six starters must be three of each. The bench can be
// anyone.
export const VB_LINES = { front: { arLabel: 'أمامي', label: 'Front' }, back: { arLabel: 'خلفي', label: 'Back' } };
export const VB_FRONT_SLOTS = 3;

export function volleyballLine(player) {
  const role = String(player?.role || '').toLowerCase();
  return role === 'front' || role === 'back' ? role : null;
}

export const volleyballSlotLine = (index) => (index < VB_FRONT_SLOTS ? 'front' : 'back');

// Starters sitting in the wrong row (or with no line set at all).
export function volleyballLineProblems(team, playersById) {
  const problems = [];
  (team?.starters || []).forEach((id, index) => {
    if (!id) return;
    const need = volleyballSlotLine(index);
    if (volleyballLine(playersById[id]) !== need) problems.push({ id, index, need });
  });
  return problems;
}

export const VB_SQUAD_RULES = [
  '6 لاعبين أساسي: 3 في الصف الأمامي (عند الشبكة) و3 في الصف الخلفي.',
  'الهوست هو اللي بيحدد كل لاعب أمامي ولا خلفي.',
  'الدكة 4 لاعبين من أي صف.',
  'مسموح 3 لاعبين بس من نفس الفريق.',
  'الميزانية 100 مليون.',
];

// ---------------- chips ----------------
// One-shot power-ups. Each is used at most once a season and only one can be
// active in a given gameweek; a chip's value on the team is the gameweek
// number it was played in (null = still unused). `name`/`arName`/`short`/
// `how`/`example` are the explanations shown to managers in the app, kept
// here next to the rules so the text and the behaviour can't drift apart.
export const VB_ACE_RAIN_VALUE = 6; // an ace is normally +3
// Safe Hands cancels the cards and the two referee faults; the four play
// errors (reception/attack/serve/block) still cost points.
export const VB_SAFE_HANDS_KEYS = ['net', 'carry', 'yellow_card', 'red_card'];
// Every rule that costs points — what Libero Shield cancels for its one player.
export const VB_PENALTY_KEYS = VOLLEYBALL_RULES.filter(([, , value]) => value < 0).map(([key]) => key);
export const VB_TRANSFER_HIT = 4;
export const VB_MAX_FREE_TRANSFERS = 5;

export const VB_CHIPS = [
  {
    key: 'doubleCaptain', icon: '👑', name: 'Double Captain', arName: 'كابتنين',
    short: 'الكابتن والنائب الاتنين نقطهم بتتضاعف في الجيم ويك ده.',
    how: 'عادةً الكابتن بس هو اللي نقطه بتتضاعف. لما تفعّل الـ chip ده، النائب (VC) كمان نقطه بتتضاعف، فبتاخد ضعف نقط لاعبين مش لاعب واحد. الاتنين لازم يكونوا في التشكيلة الأساسية.',
    example: 'الكابتن جاب 10 نقط والنائب جاب 8. عادةً بتاخد 28 نقطة، ومعاه بتاخد 36 نقطة (20 للكابتن و16 للنائب).',
  },
  {
    key: 'wildcard', icon: '🃏', name: 'Wildcard', arName: 'وايلد كارد',
    short: 'غيّر أي عدد لاعبين ببلاش في الجيم ويك ده، والتشكيلة الجديدة بتفضل معاك.',
    how: 'كل جيم ويك ليك تحويل مجاني واحد (اللي مش بتستخدمه بيتراكم لحد 5)، وكل تحويل زيادة بيتخصم منه 4 نقط. بالوايلد كارد بتعيد بناء تشكيلتك براحتك من غير أي خصم، وبتكمّل بالتشكيلة الجديدة في الجيم ويكات الجاية. بيتفتح بعد ما تكمل أول جيم ويك (أول تشكيلة بتتبني ببلاش).',
    example: 'عايز تغيّر 5 لاعبين؟ عادةً هيتخصم منك 16 نقطة (4 تحويلات زيادة، كل واحد بـ4 نقط). بالوايلد كارد مفيش أي خصم.',
  },
  {
    key: 'freeHit', icon: '⚡', name: 'Free Hit', arName: 'فري هيت',
    short: 'غيّر التشكيلة براحتك ببلاش لجيم ويك واحد بس، وبعده تشكيلتك القديمة بترجع.',
    how: 'زي الوايلد كارد بس مؤقت: بتبني فريق تجريبي للجيم ويك ده، ولما الجيم ويك يخلص فريقك الأصلي بيرجع زي ما كان. مناسب لجيم ويك مش عاجبك فيه فريقك (مثلاً لاعبينك مش بيلعبوا). بيتفتح بعد ما تكمل أول جيم ويك.',
    example: 'لاعبينك التلاتة مش بيلعبوا الأسبوع ده؟ فعّل الـ Free Hit، ابني فريق مناسب للأسبوع ده بس، وفي الجيم ويك اللي بعده فريقك القديم يرجع لوحده.',
  },
  {
    key: 'safeHands', icon: '🧤', name: 'Safe Hands', arName: 'بدون مخاطرة',
    short: 'الكروت وأخطاء الشبكة والحمل ماتتخصمش منك في الجيم ويك ده.',
    how: 'الكارت الأصفر والأحمر وخطأ الشبكة وخطأ الحمل بيتلغوا خالص لكل لاعبينك في الجيم ويك اللي بتفعّل فيه الـ chip. أخطاء الاستقبال والهجوم والإرسال والصد لسه بتتخصم عادي.',
    example: 'لاعب جاب كارت أحمر وخطأ شبكة؟ بدل ما يتخصم منه 6 نقط، الخصم بيتلغي.',
  },
  {
    key: 'aceRain', icon: '🔥', name: 'Ace Rain', arName: 'مطر الإيسات',
    short: 'الإيس (الإرسال الساحق) بيتحسب 6 نقط بدل 3.',
    how: 'أي إيس يسجله لاعب في تشكيلتك الأساسية بيتحسب ضعف النقط في الجيم ويك اللي بتفعّل فيه الـ chip. مناسب لما يكون عندك لاعبين إرسالهم قوي.',
    example: '3 إيسات بيدّوك 18 نقطة بدل 9 نقط.',
  },
  {
    key: 'liberoShield', icon: '🛡️', name: 'Libero Shield', arName: 'درع الليبرو', needsTarget: true,
    short: 'اختار لاعب واحد من الصف الخلفي وأي نقط بتتخصم منه بتتلغي.',
    how: 'بتختار لاعب واحد من لاعبين الصف الخلفي بتوعك (الأفضل الليبرو، لأنه بيستقبل كتير فبيحتمل يغلط أكتر)، وكل النقط اللي بتتخصم منه في الجيم ويك ده بتتلغي: أخطاء الاستقبال والهجوم والإرسال والصد، والشبكة والحمل، والكروت. نقطه الإيجابية بتفضل زي ما هي، وباقي لاعبينك بيتحسبوا عادي. مش شغال مع لاعبين الصف الأمامي.',
    example: 'الليبرو عمل 3 أخطاء استقبال وجاب كارت أصفر؟ بدل ما يتخصم منه 5 نقط، الخصم بيتلغي.',
  },
];

export const VB_CHIP_RULES = [
  'كل chip بتستخدمه مرة واحدة بس في الموسم كله.',
  'chip واحد بس في الجيم ويك الواحد.',
  'بتفعّله قبل ما الجيم ويك يتقفل، وتقدر تلغيه قبل القفل لو غيّرت رأيك.',
  'التحويلات: تحويل مجاني واحد كل جيم ويك (اللي مش بتستخدمه بيتراكم لحد 5)، وكل تحويل زيادة بيخصم 4 نقط.',
  'أول تشكيلة بتبنيها ببلاش، والتحويلات بتتحسب من بعد أول جيم ويك.',
];

const emptyChips = () => ({ doubleCaptain: null, wildcard: null, freeHit: null, safeHands: null, aceRain: null, liberoShield: null });

export const defaultVolleyballTeam = () => ({ starters: Array(6).fill(null), bench: Array(4).fill(null), captainId: null, viceCaptainId: null, chips: emptyChips(), shieldedId: null, transfers: null });

export function normalizeVolleyballTeam(team) {
  const clean = team || {};
  return {
    starters: Array.from({ length: 6 }, (_, index) => clean.starters?.[index] || null),
    bench: Array.from({ length: 4 }, (_, index) => clean.bench?.[index] || null),
    captainId: clean.captainId || null,
    viceCaptainId: clean.viceCaptainId || null,
    chips: { ...emptyChips(), ...(clean.chips || {}) },
    // the player Libero Shield protects (only meaningful while that chip is active)
    shieldedId: clean.shieldedId || null,
    // { gw, free, start } — `start` is the squad as it stood when this
    // gameweek opened (null until the manager has a complete squad at a
    // gameweek close); transfers are counted against it.
    transfers: clean.transfers || null,
  };
}

export function isVolleyballChipActive(team, key, gw) {
  const played = team?.chips?.[key];
  return played != null && gw != null && Number(played) === Number(gw);
}

export function activeVolleyballChip(team, gw) {
  return VB_CHIPS.find((chip) => isVolleyballChipActive(team, chip.key, gw)) || null;
}

// Same "just for turning up" bonus as football (see APPEARANCE_POINTS in
// scoring.js) — kept as its own constant since the two sports' scoring
// modules don't otherwise share anything.
export const VOLLEYBALL_APPEARANCE_POINTS = 2;

export function calcVolleyballPlayerPoints(stat = {}, { safeHands = false, aceRain = false, shield = false } = {}) {
  const base = stat.played ? VOLLEYBALL_APPEARANCE_POINTS : 0;
  return VOLLEYBALL_RULES.reduce((total, [key, , value, per]) => {
    if (safeHands && VB_SAFE_HANDS_KEYS.includes(key)) return total;
    if (shield && VB_PENALTY_KEYS.includes(key)) return total;
    const worth = aceRain && key === 'ace_serve' ? VB_ACE_RAIN_VALUE : value;
    const count = Number(stat[key]) || 0;
    return total + (per ? Math.floor(count / per) : count) * worth;
  }, base);
}

// ---------------- transfers ----------------
function squadIdsOf(team) {
  return [...team.starters, ...team.bench].filter(Boolean);
}

// How many players in the current squad weren't in the squad this gameweek
// opened with. Before a manager's first full squad is on record there is no
// baseline, so building it is free.
export function countVolleyballTransfers(team) {
  const normalized = normalizeVolleyballTeam(team);
  const start = normalized.transfers?.start;
  const startIds = new Set([...(start?.starters || []), ...(start?.bench || [])].filter(Boolean));
  if (!startIds.size) return 0;
  return squadIdsOf(normalized).filter((id) => !startIds.has(id)).length;
}

export function volleyballFreeTransfers(team) {
  const free = Number(normalizeVolleyballTeam(team).transfers?.free);
  return Number.isFinite(free) ? free : 1;
}

export function volleyballTransferHit(team, gw) {
  const normalized = normalizeVolleyballTeam(team);
  if (isVolleyballChipActive(normalized, 'wildcard', gw) || isVolleyballChipActive(normalized, 'freeHit', gw)) return 0;
  return Math.max(0, countVolleyballTransfers(normalized) - volleyballFreeTransfers(normalized)) * VB_TRANSFER_HIT;
}

export function getVolleyballTeamBreakdown(team, stats = {}, gw) {
  const normalized = normalizeVolleyballTeam(team);
  const opts = {
    safeHands: isVolleyballChipActive(normalized, 'safeHands', gw),
    aceRain: isVolleyballChipActive(normalized, 'aceRain', gw),
  };
  const doubleCaptain = isVolleyballChipActive(normalized, 'doubleCaptain', gw);
  const shieldedId = isVolleyballChipActive(normalized, 'liberoShield', gw) ? normalized.shieldedId : null;
  const playerPoints = normalized.starters.reduce((total, id) => {
    if (!id) return total;
    const points = calcVolleyballPlayerPoints(stats[id], id === shieldedId ? { ...opts, shield: true } : opts);
    const doubled = id === normalized.captainId || (doubleCaptain && id === normalized.viceCaptainId);
    return total + points + (doubled ? points : 0);
  }, 0);
  const hit = volleyballTransferHit(normalized, gw);
  return { playerPoints, hit, total: playerPoints - hit, transfersMade: countVolleyballTransfers(normalized), freeTransfers: volleyballFreeTransfers(normalized) };
}

export function calcVolleyballTeamPoints(team, stats = {}, gw) {
  return getVolleyballTeamBreakdown(team, stats, gw).total;
}

// Run once per manager when a gameweek closes: undo a Free Hit, bank unused
// free transfers (capped), and snapshot the squad the next gameweek starts
// from. A squad that isn't complete yet gets no baseline, so it stays free
// to build.
export function rollVolleyballTeamToNextGw(rawTeam, closingGw) {
  const gw = Number(closingGw);
  let team = normalizeVolleyballTeam(rawTeam);
  const free = volleyballFreeTransfers(team);
  const protectedGw = isVolleyballChipActive(team, 'wildcard', gw) || isVolleyballChipActive(team, 'freeHit', gw);
  const nextFree = protectedGw ? free : Math.min(VB_MAX_FREE_TRANSFERS, Math.max(0, free - countVolleyballTransfers(team)) + 1);
  const start = team.transfers?.start;
  if (isVolleyballChipActive(team, 'freeHit', gw) && start) {
    team = { ...team, starters: [...start.starters], bench: [...start.bench], captainId: start.captainId ?? null, viceCaptainId: start.viceCaptainId ?? null };
  }
  const complete = team.starters.every(Boolean) && team.bench.every(Boolean);
  return {
    ...team,
    shieldedId: null,
    transfers: {
      gw: gw + 1,
      free: nextFree,
      start: complete ? { starters: [...team.starters], bench: [...team.bench], captainId: team.captainId, viceCaptainId: team.viceCaptainId } : null,
    },
  };
}

// ---------------- real-league (set-based) standings ----------------
// Volleyball standings here run entirely on sets, not on a football-style
// match-points table — a match is best-of-3, 15 points a set. A set only
// counts once the host has entered a real score for it (a 0-0 pair is
// treated as "not played yet", so a 2-0 sweep can leave set 3 blank).
export function setsWonInMatch(sets = []) {
  let home = 0;
  let away = 0;
  let pointsHome = 0;
  let pointsAway = 0;
  (sets || []).forEach((set) => {
    const h = Number(set?.home);
    const a = Number(set?.away);
    if (!Number.isFinite(h) || !Number.isFinite(a) || (h === 0 && a === 0)) return;
    pointsHome += h; pointsAway += a;
    if (h > a) home += 1; else if (a > h) away += 1;
  });
  return { home, away, pointsHome, pointsAway };
}

// League points for one match, from the final set score: a clean 2-0 sweep
// is worth more than a hard-fought 2-1, the standard scoring used by real
// set-based leagues (and exactly why standings rank on points first, not
// raw sets won — two 2-1 wins should not outrank one 2-0 sweep).
export function matchPointsFor(homeSets, awaySets) {
  if (homeSets === 2 && awaySets === 0) return { home: 3, away: 0 };
  if (homeSets === 0 && awaySets === 2) return { home: 0, away: 3 };
  if (homeSets === 2 && awaySets === 1) return { home: 2, away: 1 };
  if (homeSets === 1 && awaySets === 2) return { home: 1, away: 2 };
  return { home: 0, away: 0 }; // match not finished (no team has reached 2 sets yet)
}

// Ranking, in order: 1) league points (3/0 for a 2-0, 2/1 for a 2-1),
// 2) set difference (sets won − sets lost), 3) point difference (small
// points scored − conceded, across every set). Matches won/lost, sets
// won/lost and raw points for/against are all tracked and shown as their
// own columns too — the differences above are just the tiebreakers.
export function buildVolleyballSetStandings(matches) {
  const rows = {};
  const get = (name) => (rows[name] ||= {
    team: name, played: 0, matchesWon: 0, matchesLost: 0,
    points: 0, setsWon: 0, setsLost: 0, pointsFor: 0, pointsAgainst: 0,
  });
  matches.forEach((match) => {
    const { home, away, pointsHome, pointsAway } = setsWonInMatch(match.sets);
    if (!home && !away) return; // no sets recorded yet — not counted as played
    const homeRow = get(match.home_team);
    const awayRow = get(match.away_team);
    homeRow.played += 1; awayRow.played += 1;
    homeRow.setsWon += home; homeRow.setsLost += away;
    awayRow.setsWon += away; awayRow.setsLost += home;
    homeRow.pointsFor += pointsHome; homeRow.pointsAgainst += pointsAway;
    awayRow.pointsFor += pointsAway; awayRow.pointsAgainst += pointsHome;
    if (home > away) { homeRow.matchesWon += 1; awayRow.matchesLost += 1; }
    else if (away > home) { awayRow.matchesWon += 1; homeRow.matchesLost += 1; }
    const awarded = matchPointsFor(home, away);
    homeRow.points += awarded.home; awayRow.points += awarded.away;
  });
  matches.forEach((match) => { if (match.home_team) get(match.home_team); if (match.away_team) get(match.away_team); });
  return Object.values(rows)
    .map((row) => ({
      ...row,
      setDiff: row.setsWon - row.setsLost,
      pointDiff: row.pointsFor - row.pointsAgainst,
    }))
    .sort((a, b) => b.points - a.points || b.setDiff - a.setDiff || b.pointDiff - a.pointDiff);
}

export function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}
