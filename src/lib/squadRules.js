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
