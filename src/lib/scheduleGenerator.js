import { uid } from './db';

function shuffle(items) {
  const list = [...items];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

export function generateLeagueSchedule({ teams, gamesPerWeek, duration, gap, weekdays, startDate, startTime, meetingsPerPair }) {
  const names = shuffle([...new Set(teams.map((name) => name.trim()).filter(Boolean))]);
  if (names.length < 2) throw new Error('أدخل فريقين على الأقل');
  if (names.length % 2) names.push(null);
  const fixed = names[0];
  let rotating = names.slice(1);
  const baseRounds = [];
  for (let round = 0; round < names.length - 1; round += 1) {
    const order = [fixed, ...rotating];
    const fixtures = [];
    for (let index = 0; index < order.length / 2; index += 1) {
      const first = order[index];
      const second = order[order.length - 1 - index];
      if (first && second) fixtures.push(round % 2 ? [second, first] : [first, second]);
    }
    baseRounds.push(fixtures);
    rotating = [rotating.at(-1), ...rotating.slice(0, -1)];
  }
  // Host picks how many times each pair of teams faces off (1 = single
  // round-robin, 2 = home & away like before, higher = a longer league).
  // Every other cycle swaps home/away so it stays fair across repeats.
  const meetings = Math.max(1, Math.min(12, Number(meetingsPerPair) || 1));
  const rounds = [];
  for (let cycle = 0; cycle < meetings; cycle += 1) {
    const reversed = cycle % 2 === 1;
    rounds.push(...baseRounds.map((fixtures) => (reversed ? fixtures.map(([home, away]) => [away, home]) : fixtures)));
  }
  const allowedDays = weekdays.map(Number);
  if (!allowedDays.length) throw new Error('اختار يوم لعب واحد على الأقل');
  const roundsEachWeek = Math.max(1, Math.min(Number(gamesPerWeek) || 1, allowedDays.length));
  const selectedDays = allowedDays.slice(0, roundsEachWeek);
  const cursor = new Date(`${startDate}T${startTime || '18:00'}`);
  const output = [];
  let roundIndex = 0;
  while (roundIndex < rounds.length) {
    if (selectedDays.includes(cursor.getDay())) {
      rounds[roundIndex].forEach(([home_team, away_team], matchIndex) => {
        const kickoff = new Date(cursor.getTime() + matchIndex * (Number(duration) + Number(gap || 0)) * 60000);
        output.push({ id: uid(), home_team, away_team, kickoff_time: kickoff.toISOString(), duration_minutes: Number(duration), home_score: 0, away_score: 0, status: 'upcoming', gw: roundIndex + 1, note: `Round ${roundIndex + 1}` });
      });
      roundIndex += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return output;
}

export function matchDisplayStatus(match, now = Date.now()) {
  if (match.status === 'finished') return 'finished';
  const start = new Date(match.kickoff_time).getTime();
  const end = start + (Number(match.duration_minutes) || 60) * 60000;
  if (now >= start && now < end) return 'live';
  if (now >= end) return 'waiting';
  return 'upcoming';
}

// Compact "who do they play next" lookup shared by both sports' player
// pickers/lists — a lighter sibling of football's own getNextFixtures
// (TeamPage.jsx), used where showing 5 full stat columns would be too much
// (a buy-time row) rather than a dedicated stats screen.
export function getUpcomingFixturesForTeam(teamName, matches, count = 5, now = Date.now()) {
  const name = (teamName || '').trim().toLowerCase();
  if (!name || !Array.isArray(matches)) return [];
  return matches
    .filter((match) => {
      const home = (match.home_team || '').trim().toLowerCase();
      const away = (match.away_team || '').trim().toLowerCase();
      return (home === name || away === name) && matchDisplayStatus(match, now) !== 'finished';
    })
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime())
    .slice(0, count)
    .map((match) => {
      const isHome = (match.home_team || '').trim().toLowerCase() === name;
      return { id: match.id, gw: match.gw, opponent: isHome ? match.away_team : match.home_team, venue: isHome ? 'H' : 'A', kickoff_time: match.kickoff_time };
    });
}

// Derives a football match's score from individual player goal stats
// instead of a manually-typed result — the host enters player goals once,
// for fantasy scoring, and the league table reads the same numbers rather
// than asking for them twice.
//
// Each stat entry carries an explicit `matchId` (picked by the host when
// entering that player's stats — see PlayerStatsModal) rather than being
// matched up by gameweek number. The fantasy "gameweek" counter the host
// advances manually and the schedule's own per-match gameweek number are
// two independent sequences that drift apart in practice, and a team can
// legitimately play more than once in a single fantasy gameweek (a
// postponed fixture, etc.) — matching by number silently attached goals to
// the wrong match, or couldn't tell two matches apart at all. An explicit
// link has neither problem.
//
// Status is computed purely from kickoff time + duration, so none of this
// needs a stored status/score column on the matches table.
export function applyFootballStatsToMatches(matches, players, stats, now = Date.now()) {
  const teamOf = new Map(players.map((p) => [p.id, (p.team_name || '').trim().toLowerCase()]));
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const goalsByMatch = new Map(); // matchId -> { home, away }
  Object.values(stats).forEach((gwStats) => {
    Object.entries(gwStats || {}).forEach(([playerId, playerStat]) => {
      const matchId = playerStat?.matchId;
      const goals = Number(playerStat?.goals) || 0;
      if (!matchId || !goals) return;
      const match = matchById.get(matchId);
      if (!match) return;
      const home = (match.home_team || '').trim().toLowerCase();
      const away = (match.away_team || '').trim().toLowerCase();
      const team = teamOf.get(playerId);
      const bucket = goalsByMatch.get(matchId) || { home: 0, away: 0 };
      if (team === home) bucket.home += goals;
      else if (team === away) bucket.away += goals;
      goalsByMatch.set(matchId, bucket);
    });
  });

  return matches.map((match) => {
    const bucket = goalsByMatch.get(match.id) || { home: 0, away: 0 };
    const start = new Date(match.kickoff_time).getTime();
    const end = start + (Number(match.duration_minutes) || 60) * 60000;
    const status = now < start ? 'upcoming' : now < end ? 'live' : 'finished';
    return { ...match, home_score: bucket.home, away_score: bucket.away, status };
  });
}

// A team's fixtures sorted by kickoff time, for the match-picker in the
// stats modal — and to guess a sensible default (the fixture closest to
// "now", since that's almost always the one the host is entering just after
// it happened).
export function getTeamMatchOptions(teamName, matches) {
  const name = (teamName || '').trim().toLowerCase();
  if (!name) return [];
  return matches
    .filter((m) => (m.home_team || '').trim().toLowerCase() === name || (m.away_team || '').trim().toLowerCase() === name)
    .slice()
    .sort((a, b) => new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime());
}

export function guessCurrentMatchId(teamName, matches, now = Date.now()) {
  const options = getTeamMatchOptions(teamName, matches);
  if (!options.length) return null;
  const past = options.filter((m) => new Date(m.kickoff_time).getTime() <= now);
  return (past.length ? past[past.length - 1] : options[0]).id;
}

// Splits a squad into the two rosters facing off in one match, for the Host
// Dashboard's match statistics table — same team-name matching convention as
// getUpcomingFixturesForTeam/applyFootballStatsToMatches above.
export function getMatchTeamPlayers(players, match) {
  const home = (match?.home_team || '').trim().toLowerCase();
  const away = (match?.away_team || '').trim().toLowerCase();
  return {
    home: home ? players.filter((p) => (p.team_name || '').trim().toLowerCase() === home) : [],
    away: away ? players.filter((p) => (p.team_name || '').trim().toLowerCase() === away) : [],
  };
}

// Player stats live in one gw-bucket per fantasy gameweek (see sbGetStats),
// each entry carrying an explicit matchId. Reopening a match's stats screen
// needs to find whichever bucket already holds that matchId's numbers —
// rather than always assuming "the currently active gameweek" — so
// corrections to an older, already-finalized match land back on the same
// entries instead of creating a duplicate under today's gameweek. Falls back
// to fallbackGwKey (the current gw) for a match never scored yet.
export function findMatchStatsGwKey(stats, playerIds, matchId, fallbackGwKey) {
  const idSet = new Set(playerIds);
  let found = null;
  Object.keys(stats || {}).forEach((gwKey) => {
    const bucket = stats[gwKey] || {};
    Object.keys(bucket).forEach((pid) => {
      if (!idSet.has(pid) || bucket[pid]?.matchId !== matchId) return;
      const num = parseInt(String(gwKey).replace('gw', ''), 10);
      if (!found || num > found.num) found = { key: gwKey, num };
    });
  });
  return found ? found.key : fallbackGwKey;
}

// Who scored a football match's goals, split by side — same matchId-linking
// convention as applyFootballStatsToMatches above, so it always agrees with
// the score shown next to it. Returns display-ready strings, e.g.
// "Mikha adel، Bolbol ×2" — empty string for a side with no recorded scorers.
export function getMatchScorers(match, players, stats) {
  const home = (match?.home_team || '').trim().toLowerCase();
  const away = (match?.away_team || '').trim().toLowerCase();
  const playerById = new Map(players.map((p) => [p.id, p]));
  const homeGoals = new Map(); // player name -> goals
  const awayGoals = new Map();
  Object.values(stats || {}).forEach((gwStats) => {
    Object.entries(gwStats || {}).forEach(([playerId, stat]) => {
      const goals = Number(stat?.goals) || 0;
      if (!goals || stat?.matchId !== match.id) return;
      const player = playerById.get(playerId);
      const team = (player?.team_name || '').trim().toLowerCase();
      const bucket = team === home ? homeGoals : team === away ? awayGoals : null;
      if (!bucket || !player) return;
      bucket.set(player.name, (bucket.get(player.name) || 0) + goals);
    });
  });
  const format = (map) => [...map.entries()].map(([name, goals]) => (goals > 1 ? `${name} ×${goals}` : name)).join('، ');
  return { home: format(homeGoals), away: format(awayGoals) };
}

export function buildLeagueTable(matches, sport = 'football') {
  const rows = {};
  const get = (name) => rows[name] ||= { team: name, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, points: 0 };
  matches.filter((match) => match.status === 'finished').forEach((match) => {
    const home = get(match.home_team); const away = get(match.away_team);
    const hs = Number(match.home_score) || 0; const as = Number(match.away_score) || 0;
    home.played += 1; away.played += 1; home.scored += hs; home.conceded += as; away.scored += as; away.conceded += hs;
    if (hs === as) { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
    else if (hs > as) { home.won += 1; away.lost += 1; home.points += sport === 'volleyball' ? 2 : 3; }
    else { away.won += 1; home.lost += 1; away.points += sport === 'volleyball' ? 2 : 3; }
  });
  matches.forEach((match) => { get(match.home_team); get(match.away_team); });
  return Object.values(rows).sort((a,b) => b.points-a.points || (b.scored-b.conceded)-(a.scored-a.conceded) || b.scored-a.scored);
}
