export const VOLLEYBALL_RULES = [
  ['best_player', 'Best player', 5],
  ['best_hitter', 'Best hitter', 5],
  ['best_blocker', 'Best blocker', 5],
  ['best_libero', 'Best libero', 5],
  ['best_setter', 'Best setter', 5],
  ['point_won', 'Player won point', 1],
  ['point_lost', 'Player lost point', -1],
  ['ace_serve', 'Ace serve', 3],
  ['won_serve', 'Won serve', 1],
  ['net', 'Net fault', -1],
  ['carry', 'Carry', -1],
  ['yellow_card', 'Yellow card', -2],
  ['red_card', 'Red card', -5],
];

export const defaultVolleyballTeam = () => ({ starters: Array(6).fill(null), bench: Array(4).fill(null), captainId: null, viceCaptainId: null });

export function normalizeVolleyballTeam(team) {
  const clean = team || {};
  return {
    starters: Array.from({ length: 6 }, (_, index) => clean.starters?.[index] || null),
    bench: Array.from({ length: 4 }, (_, index) => clean.bench?.[index] || null),
    captainId: clean.captainId || null,
    viceCaptainId: clean.viceCaptainId || null,
  };
}

// Same "just for turning up" bonus as football (see APPEARANCE_POINTS in
// scoring.js) — kept as its own constant since the two sports' scoring
// modules don't otherwise share anything.
export const VOLLEYBALL_APPEARANCE_POINTS = 2;

export function calcVolleyballPlayerPoints(stat = {}) {
  const base = stat.played ? VOLLEYBALL_APPEARANCE_POINTS : 0;
  return VOLLEYBALL_RULES.reduce((total, [key, , value]) => total + (Number(stat[key]) || 0) * value, base);
}

export function calcVolleyballTeamPoints(team, stats = {}) {
  const normalized = normalizeVolleyballTeam(team);
  return normalized.starters.reduce((total, id) => {
    if (!id) return total;
    const points = calcVolleyballPlayerPoints(stats[id]);
    return total + points + (id === normalized.captainId ? points : 0);
  }, 0);
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
