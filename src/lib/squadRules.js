// Squad rule shared by both fantasy games: a manager can only hold so many
// players from the same real team — at most 2 in football, 3 in volleyball.
// Players with no team set aren't limited.
export const MAX_PER_TEAM = { football: 2, volleyball: 3 };

export const teamKeyOf = (player) => String(player?.team_name ?? player?.teamName ?? '').trim().toLowerCase();

// { [String(id)]: player } — so callers can look squad members up by id.
export function indexPlayers(players) {
  return Object.fromEntries((players || []).map((player) => [String(player.id), player]));
}

// How many of `ids` already play for the same real team as `candidate`
// (the candidate itself never counts against itself).
export function teamCountWith(candidate, ids, index) {
  const key = teamKeyOf(candidate);
  if (!key) return 0;
  return ids.filter((id) => String(id) !== String(candidate.id) && teamKeyOf(index[String(id)]) === key).length;
}

export function wouldBreakTeamLimit(candidate, otherIds, index, limit) {
  return teamCountWith(candidate, otherIds, index) >= limit;
}

// Teams that already have more players in `ids` than the limit allows.
export function teamLimitProblems(ids, index, limit) {
  const counts = {};
  ids.filter(Boolean).forEach((id) => {
    const key = teamKeyOf(index[String(id)]);
    if (!key) return;
    counts[key] = { team: index[String(id)].team_name, count: (counts[key]?.count || 0) + 1 };
  });
  return Object.values(counts).filter((entry) => entry.count > limit);
}

// Buckets players under their real team (players are never mixed between
// teams), each team's players sorted by name, teams sorted alphabetically —
// with players who have no team yet pushed into a trailing "unassigned"
// group instead of being dropped. Used everywhere a player list needs to
// read as "Team A: ..., Team B: ..." rather than one flat alphabetical list.
export function groupPlayersByTeam(players, unassignedLabel = 'بدون فريق') {
  const byTeam = new Map();
  (players || []).forEach((player) => {
    const key = teamKeyOf(player);
    const label = key ? (player.team_name ?? player.teamName) : unassignedLabel;
    if (!byTeam.has(key)) byTeam.set(key, { key, team: label, players: [] });
    byTeam.get(key).players.push(player);
  });
  const groups = [...byTeam.values()];
  groups.forEach((group) => group.players.sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar')));
  groups.sort((a, b) => {
    if (!a.key && b.key) return 1;   // unassigned last
    if (a.key && !b.key) return -1;
    return String(a.team).localeCompare(String(b.team), 'ar');
  });
  return groups;
}
