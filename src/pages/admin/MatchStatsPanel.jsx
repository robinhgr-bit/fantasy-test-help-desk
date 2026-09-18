import { useEffect, useMemo, useRef, useState } from 'react';
import { useUI } from '../../context/UIContext';
import { sbSetStatsForGW } from '../../lib/db';
import { SCORING, APPEARANCE_POINTS, emptyPlayerStat, calcPlayerPoints } from '../../lib/scoring';
import { getMatchTeamPlayers, findMatchStatsGwKey } from '../../lib/scheduleGenerator';

// Builds the initial per-player row state for this match's stats table: a
// player already scored for THIS match keeps their numbers, a fresh player
// starts at zero. A player who already has a *different* match's numbers
// sitting in this same gw-bucket (the "team plays twice in one gameweek"
// edge case — each player only has one stat slot per gameweek) is kept out
// of the editable set entirely instead of risking either showing the wrong
// match's numbers here or silently overwriting them on save.
function buildInitialRows(bucket, allPlayers, matchId) {
  const rows = {};
  const conflicts = new Set();
  allPlayers.forEach((player) => {
    const existing = bucket[player.id];
    if (existing && existing.matchId && existing.matchId !== matchId) {
      conflicts.add(player.id);
      return;
    }
    const base = emptyPlayerStat();
    if (existing) {
      if (existing.played !== undefined) base.played = Boolean(existing.played);
      Object.keys(SCORING).forEach((key) => { if (key in existing) base[key] = existing[key]; });
    }
    rows[player.id] = base;
  });
  return { rows, conflicts };
}

export default function MatchStatsPanel({ match, players, stats, setStats, gwState, onClose }) {
  const { showToast } = useUI();
  const { home, away } = useMemo(() => getMatchTeamPlayers(players, match), [players, match]);
  const allPlayers = useMemo(() => [...home, ...away], [home, away]);
  const allIds = useMemo(() => allPlayers.map((p) => p.id), [allPlayers]);
  const fallbackGwKey = 'gw' + (Number(gwState.gw) || 1);

  // Resolved once when the panel opens for this match — not on every stats
  // refresh — so mid-edit re-renders never jump the panel to a different
  // bucket out from under the host.
  const [gwKey] = useState(() => findMatchStatsGwKey(stats, allIds, match.id, fallbackGwKey));

  const [{ rows, conflicts }, setRowState] = useState(() => buildInitialRows(stats[gwKey] || {}, allPlayers, match.id));
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  // The full per-player table is collapsed by default — the host now mostly
  // needs this screen open just to check/correct something, not stare at
  // every column every time. It still holds all the underlying data (goals,
  // matchId links, etc.) that scores/fantasy points/prices depend on.
  const [expanded, setExpanded] = useState(false);

  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const dirtyRef = useRef(false);
  const flushingRef = useRef(false);
  const timerRef = useRef(null);
  const statsRef = useRef(stats);
  useEffect(() => { statsRef.current = stats; }, [stats]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Fire-and-forget a final save on close so a quick click-then-leave
    // never loses the last debounced change.
    if (dirtyRef.current) flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flush() {
    if (flushingRef.current) return;
    if (!dirtyRef.current) return;
    flushingRef.current = true;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      const merged = { ...(statsRef.current[gwKey] || {}) };
      Object.entries(rowsRef.current).forEach(([pid, value]) => {
        merged[pid] = { ...value, matchId: match.id };
      });
      await sbSetStatsForGW(gwKey, merged);
      statsRef.current = { ...statsRef.current, [gwKey]: merged };
      setStats((current) => ({ ...current, [gwKey]: merged }));
      setSaveState('saved');
    } catch (e) {
      console.error('match stats save failed', e);
      dirtyRef.current = true;
      setSaveState('error');
      showToast('مقدرش يحفظ الإحصائيات، هيحاول تاني: ' + String(e.message || e).slice(0, 80), 'error');
    } finally {
      flushingRef.current = false;
      if (dirtyRef.current) flush();
    }
  }

  function scheduleSave() {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 450);
  }

  function updateStat(playerId, key, updater) {
    setRowState((current) => ({
      ...current,
      rows: {
        ...current.rows,
        [playerId]: { ...current.rows[playerId], [key]: updater(current.rows[playerId]?.[key]) },
      },
    }));
    scheduleSave();
  }

  const saveLabel = { idle: '', saving: 'بيحفظ...', saved: 'اتحفظ ✓', error: 'فشل الحفظ' }[saveState];

  const allStatsForSummary = useMemo(() => {
    const merged = { ...rows };
    conflicts.forEach((pid) => { merged[pid] = stats[gwKey]?.[pid] || {}; });
    return merged;
  }, [rows, conflicts, stats, gwKey]);
  const enteredCount = allPlayers.filter((p) => allStatsForSummary[p.id]?.played).length;
  const goalsCount = allPlayers.reduce((sum, p) => sum + (Number(allStatsForSummary[p.id]?.goals) || 0), 0);

  return (
    <div className="matchStatsPanel">
      <div className="matchStatsHead">
        <button type="button" className="btn ghost small" onClick={() => { if (dirtyRef.current) flush(); onClose(); }}>← رجوع للجدول</button>
        <div className="matchStatsTitle"><b>{match.home_team}</b><span>×</span><b>{match.away_team}</b></div>
        <span className={`matchStatsSaveTag ${saveState}`}>{saveLabel}</span>
      </div>

      {!allPlayers.length ? (
        <p className="hint" style={{ padding: '14px 4px' }}>لسه مفيش لاعبين متعينلهم فريق {match.home_team} أو {match.away_team} — عيّن فريق كل لاعب من تبويب "اللاعبين" الأول.</p>
      ) : !expanded ? (
        <div className="matchStatsSummary">
          <p className="hint">{enteredCount} لاعب شارك · {goalsCount} جول متسجل</p>
          <button type="button" className="btn small" onClick={() => setExpanded(true)}>عرض / تعديل تفاصيل اللاعبين</button>
        </div>
      ) : (
        <>
          <div className="matchStatsSummary">
            <button type="button" className="btn ghost small" onClick={() => setExpanded(false)}>إخفاء التفاصيل</button>
          </div>
          {!!conflicts.size && (
            <p className="hint matchStatsWarning">
              في {conflicts.size} لاعب{conflicts.size > 1 ? 'ين' : ''} إحصائياته محفوظة دلوقتي لماتش تاني في نفس الـ GW (مبين بعلامة ⚠) — مش قابل للتعديل من هنا عشان مايتمسحش، لازم تغيّر الجيم ويك الحالي الأول لو الفريق لعب مرتين في نفس الـ GW.
            </p>
          )}
          <div className="matchStatsScroll">
            <table className="matchStatsTable">
              <thead>
                <tr>
                  <th className="statPlayerCol">اللاعب</th>
                  <th>شارك</th>
                  {Object.entries(SCORING).map(([key, def]) => <th key={key}>{def.label}</th>)}
                  <th>النقط</th>
                </tr>
              </thead>
              <tbody>
                {[['home', match.home_team, home], ['away', match.away_team, away]].map(([groupKey, teamName, groupPlayers]) => (
                  <FragmentGroup key={groupKey} groupKey={groupKey} teamName={teamName} groupPlayers={groupPlayers} conflicts={conflicts} rows={rows} stats={stats} gwKey={gwKey} updateStat={updateStat} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function FragmentGroup({ groupKey, teamName, groupPlayers, conflicts, rows, stats, gwKey, updateStat }) {
  return (
    <>
      <tr className="teamDivider"><td colSpan={13}>{teamName || (groupKey === 'home' ? 'الفريق المضيف' : 'الفريق الضيف')}</td></tr>
      {!groupPlayers.length && (
        <tr><td colSpan={13} className="hint">مفيش لاعبين للفريق ده لسه.</td></tr>
      )}
      {groupPlayers.map((player) => {
        const isConflict = conflicts.has(player.id);
        const rowStats = isConflict ? (stats[gwKey]?.[player.id] || {}) : (rows[player.id] || emptyPlayerStat());
        return (
          <tr key={player.id} className={isConflict ? 'matchStatsConflictRow' : ''}>
            <td className="statPlayerCol">{isConflict && <span title="الإحصائيات دي لماتش تاني في نفس الـ GW">⚠ </span>}{player.name}</td>
            <td>
              <button
                type="button"
                className={`statToggle ${rowStats.played ? 'on' : ''}`}
                disabled={isConflict}
                onClick={() => updateStat(player.id, 'played', (v) => !v)}
                title={`+${APPEARANCE_POINTS} أوتوماتيك لما يشارك`}
              >{rowStats.played ? '✓' : ''}</button>
            </td>
            {Object.entries(SCORING).map(([key, def]) => (
              <td key={key}>
                {def.kind === 'bool' ? (
                  <button type="button" className={`statToggle ${rowStats[key] ? 'on' : ''}`} disabled={isConflict} onClick={() => updateStat(player.id, key, (v) => !v)}>
                    {rowStats[key] ? '✓' : ''}
                  </button>
                ) : (
                  <div className="statCounter">
                    <button type="button" disabled={isConflict || !Number(rowStats[key])} onClick={() => updateStat(player.id, key, (v) => Math.max(0, (Number(v) || 0) - 1))}>−</button>
                    <b>{Number(rowStats[key]) || 0}</b>
                    <button type="button" disabled={isConflict} onClick={() => updateStat(player.id, key, (v) => (Number(v) || 0) + 1)}>+</button>
                  </div>
                )}
              </td>
            ))}
            <td className="statPointsCol">{calcPlayerPoints(player.id, isConflict ? (stats[gwKey] || {}) : rows)}</td>
          </tr>
        );
      })}
    </>
  );
}
