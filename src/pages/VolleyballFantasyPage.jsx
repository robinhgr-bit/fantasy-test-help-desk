import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useUI } from '../context/UIContext';
import { sbGetAccount, sbGetVolleyballAccounts, sbGetVolleyballMatches, sbGetVolleyballPlayers, sbGetVolleyballState, sbGetVolleyballStats, sbUpdateAccountField } from '../lib/db';
import { activeVolleyballChip, calcVolleyballTeamPoints, isVolleyballChipActive, defaultVolleyballTeam, getVolleyballTeamBreakdown, normalizeVolleyballTeam, VB_CHIP_RULES, VB_CHIPS, VB_LINES, VB_SQUAD_RULES, VOLLEYBALL_RULES, volleyballLine, volleyballLineProblems, volleyballRuleWorthText, volleyballSlotLine } from '../lib/volleyballScoring';
import { getUpcomingFixturesForTeam, matchDisplayStatus } from '../lib/scheduleGenerator';
import { MAX_PER_TEAM, teamKeyOf, teamLimitProblems, wouldBreakTeamLimit } from '../lib/squadRules';
import { BrandGlyph } from '../components/Brand';
import FantasyBrandHeader from '../components/FantasyBrandHeader';
import NewsPage from './NewsPage';
import TimeTablePage from './TimeTablePage';
import './FantasyEnhancements.css';
import './VolleyballFantasyPage.css';

const budgetLimit = 100;

const VB_SECTIONS = [
  ['home', 'Home'],
  ['team', 'Team'],
  ['matches', 'Fixtures'],
  ['leagues', 'League'],
  ['news', 'News'],
  ['more', 'More'],
];

// Real indoor-volleyball rotation numbering: front row (near the net) is
// zones 4-3-2 left to right, back row is 5-6-1 — same order shown on a
// referee's rotation card. In FIVB terms zone 1 is back-right (serving),
// 2 front-right, 3 front-center, 4 front-left, 5 back-left, 6 back-center —
// this array just walks the 3x2 grid in that same official order.
const ZONE_LABELS = [4, 3, 2, 5, 6, 1];

// A jersey only ever gets a color assigned by the host (via the team a
// player belongs to) — never a second one — so the trim/collar color is
// derived for contrast rather than stored: dark kits get a white trim,
// light kits get a dark navy one, the same way most real kit designs work.
function trimColorFor(hex) {
  const value = (hex || '').replace('#', '');
  if (value.length !== 6) return '#ffffff';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? '#20124d' : '#ffffff';
}

// A real 2D jersey silhouette (V-neck, short raglan sleeves) instead of a
// flat color swatch — the FPL-style kit icon this whole card is modelled on.
function VolleyballJersey({ color, size = 44 }) {
  const fill = color || '#7148ff';
  const trim = trimColorFor(fill);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className="vb-jersey" aria-hidden="true">
      <path
        d="M26,6 L16,9 L6,24 L20,26 L20,58 L44,58 L44,26 L58,24 L48,9 L38,6 L32,14 Z"
        fill={fill} stroke="rgba(0,0,0,.22)" strokeWidth="1"
      />
      <path d="M26,6 L32,14 L38,6" fill="none" stroke={trim} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M16,9 L6,24" stroke={trim} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M48,9 L58,24" stroke={trim} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function PlayerPhoto({ player, zone }) {
  return <span className="vb-photo-wrap">
    {!player ? (
      <span className="vb-photo-empty">+</span>
    ) : player.image_url ? (
      <img className="vb-photo-img" src={player.image_url} alt="" />
    ) : (
      <VolleyballJersey color={player.color} />
    )}
    {zone != null && <i className="vb-zone">{zone}</i>}
  </span>;
}

function PlayerSlot({ player, captain, vice, zone, points, label, locked, onClick, onCaptain, onVice, onInfo }) {
  return <div className={`vb-slot ${player ? 'filled' : ''}`}>
    <button type="button" className="vb-slot-btn" onClick={onClick} disabled={locked}>
      <PlayerPhoto player={player} zone={zone}/>
      {player ? (
        <span className="vb-slot-tag"><strong>{player.name}</strong><small>{player.country || player.team_name || 'FAG'} · {points !== undefined ? `${points} pts` : `$${player.price}m`}</small></span>
      ) : <span className="vb-slot-tag vb-slot-tag-empty"><strong>{label}</strong></span>}
    </button>
    {player && onCaptain && <><button type="button" className={`vb-badge captain ${captain ? 'active' : ''}`} onClick={onCaptain} disabled={locked}>C</button><button type="button" className={`vb-badge vice ${vice ? 'active' : ''}`} onClick={onVice} disabled={locked}>VC</button></>}
    {player && onInfo && <button type="button" className="vb-badge info" onClick={onInfo} title="Next matches">i</button>}
  </div>;
}

function MatchCard({ match, live = false }) {
  const time = new Date(match.kickoff_time);
  return <article className="vb-match-card"><div><span className={live ? 'live' : ''}>{live ? 'LIVE' : (match.round_label || 'UPCOMING')}</span><small>{Number.isNaN(time.getTime()) ? '' : time.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><section><strong><i>{match.home_country || 'VB'}</i>{match.home_team}</strong><b>{live ? `${match.home_score} - ${match.away_score}` : 'VS'}</b><strong><i>{match.away_country || 'VB'}</i>{match.away_team}</strong></section></article>;
}

export default function VolleyballFantasyPage({ onSwitchSport }) {
  const { user, settings } = useApp();
  const { showToast } = useUI();
  const [section, setSection] = useState('home');
  const [players, setPlayers] = useState([]);
  const [state, setState] = useState({ gw: 1, locked: false });
  const [stats, setStats] = useState({});
  const [team, setTeam] = useState(defaultVolleyballTeam());
  const [points, setPoints] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [matches, setMatches] = useState([]);
  const [picker, setPicker] = useState(null);
  const [detailsPlayer, setDetailsPlayer] = useState(null);
  const [chipSheet, setChipSheet] = useState(null); // key of the chip whose explanation sheet is open
  const [shieldPick, setShieldPick] = useState(''); // player chosen in the Libero Shield sheet
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [playerRows, gameState, accountRows, matchRows, own] = await Promise.all([sbGetVolleyballPlayers(), sbGetVolleyballState(), sbGetVolleyballAccounts(), sbGetVolleyballMatches(), user ? sbGetAccount(user, 'volleyball_team,volleyball_points') : null]);
      setPlayers(playerRows.filter((player) => player.active !== false)); setState(gameState); setAccounts(accountRows); setMatches(matchRows);
      setStats(await sbGetVolleyballStats(gameState.gw)); setTeam(normalizeVolleyballTeam(own?.volleyball_team)); setPoints(own?.volleyball_points || {});
    } catch (loadError) { setError('شغّل ملف supabase-volleyball-fantasy.sql أولًا'); console.error(loadError); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => Object.fromEntries(players.map((player) => [player.id, player])), [players]);
  const selectedIds = [...team.starters, ...team.bench].filter(Boolean);
  const lineProblems = volleyballLineProblems(team, byId);
  const teamProblems = teamLimitProblems(selectedIds, byId, MAX_PER_TEAM.volleyball);
  const spent = selectedIds.reduce((total, id) => total + (byId[id]?.price || 0), 0);
  const livePoints = calcVolleyballTeamPoints(team, stats, state.gw);
  const breakdown = getVolleyballTeamBreakdown(team, stats, state.gw);
  const activeChip = activeVolleyballChip(team, state.gw);
  const sheetChip = VB_CHIPS.find((chip) => chip.key === chipSheet) || null;
  // Wildcard/Free Hit only mean something once transfers are being counted,
  // which starts after the first gameweek close records a full squad.
  const chipStatus = (chip) => {
    const usedIn = team.chips[chip.key];
    if (usedIn != null) return Number(usedIn) === Number(state.gw) ? 'active' : 'used';
    if (activeChip) return 'blocked';
    if ((chip.key === 'wildcard' || chip.key === 'freeHit') && !team.transfers?.start) return 'unavailable';
    return 'available';
  };
  const savedTotal = Object.values(points).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const totalPoints = savedTotal + (points[`gw${state.gw}`] === undefined ? livePoints : 0);
  const ranking = accounts.map((account) => { const saved = account.volleyball_points || {}; const total = Object.values(saved).reduce((sum, value) => sum + (Number(value) || 0), 0); const live = saved[`gw${state.gw}`] === undefined ? calcVolleyballTeamPoints(account.volleyball_team, stats, state.gw) : 0; return { username: account.username, total: total + live, gw: saved[`gw${state.gw}`] ?? live }; }).sort((a,b) => b.total - a.total);
  const myRank = Math.max(1, ranking.findIndex((row) => row.username === user) + 1);
  const gwScores = ranking.map((row) => Number(row.gw) || 0);
  const gwAverage = gwScores.length ? Math.round(gwScores.reduce((sum, value) => sum + value, 0) / gwScores.length) : 0;
  const gwHighest = gwScores.length ? Math.max(...gwScores) : 0;
  const teamName = team?.teamName || team?.name || `${user}'s Team`;
  const liveMatches = matches.filter((match) => matchDisplayStatus(match) === 'live');
  const upcomingMatches = matches.filter((match) => matchDisplayStatus(match) === 'upcoming');
  const topFor = (key) => players.map((player) => ({ player, value: Number(stats[player.id]?.[key]) || 0 })).sort((a,b) => b.value - a.value)[0];

  const choosePlayer = (player) => {
    if (selectedIds.includes(player.id)) return showToast('اللاعب موجود بالفعل', 'error');
    if (spent + player.price > budgetLimit) return showToast('الميزانية لا تكفي', 'error');
    if (wouldBreakTeamLimit(player, selectedIds, byId, MAX_PER_TEAM.volleyball)) return showToast(`مسموح ${MAX_PER_TEAM.volleyball} لاعبين بس من نفس الفريق (${player.team_name})`, 'error');
    if (picker.group === 'starters' && volleyballLine(player) !== volleyballSlotLine(picker.index)) return showToast(`المكان ده لاعب ${VB_LINES[volleyballSlotLine(picker.index)].arLabel} بس`, 'error');
    setTeam((current) => ({ ...current, [picker.group]: current[picker.group].map((id,index) => index === picker.index ? player.id : id) })); setPicker(null);
  };
  const removePlayer = (group,index) => { const removed = team[group][index]; setTeam((current) => ({ ...current, [group]: current[group].map((id,itemIndex) => itemIndex === index ? null : id), captainId: current.captainId === removed ? null : current.captainId, viceCaptainId: current.viceCaptainId === removed ? null : current.viceCaptainId, shieldedId: current.shieldedId === removed ? null : current.shieldedId })); };
  const autoPick = () => {
    const cheapest = (list) => [...list].sort((x, y) => x.price - y.price);
    const perTeam = {};
    const usedIds = new Set();
    const take = (list, count) => {
      const chosen = [];
      for (const player of cheapest(list)) {
        if (chosen.length === count) break;
        const key = teamKeyOf(player);
        if (usedIds.has(player.id) || (key && (perTeam[key] || 0) >= MAX_PER_TEAM.volleyball)) continue;
        if (key) perTeam[key] = (perTeam[key] || 0) + 1;
        usedIds.add(player.id);
        chosen.push(player);
      }
      return chosen;
    };
    const front = take(players.filter((player) => volleyballLine(player) === 'front'), 3);
    const back = take(players.filter((player) => volleyballLine(player) === 'back'), 3);
    if (front.length < 3 || back.length < 3) return showToast('محتاج 3 لاعبين أمامي و3 خلفي على الأقل (الهوست لسه ماحدّدش الصفوف، أو الفرق قليلة)', 'error');
    const bench = take(players, 4);
    if (bench.length < 4 || [...front, ...back, ...bench].reduce((sum, player) => sum + player.price, 0) > budgetLimit) return showToast('مش قادر أكوّن 10 لاعبين بالميزانية والحد المسموح من نفس الفريق', 'error');
    setTeam((current) => ({ ...current, starters: [...front, ...back].map((player) => player.id), bench: bench.map((player) => player.id), captainId: front[0].id, viceCaptainId: front[1].id, shieldedId: back.some((player) => player.id === current.shieldedId) ? current.shieldedId : null }));
  };
  const save = async () => { if (team.starters.some((id) => !id) || team.bench.some((id) => !id)) return showToast('اختار 6 أساسي و4 دكة', 'error'); if (!team.captainId || !team.viceCaptainId || team.captainId === team.viceCaptainId) return showToast('اختار Captain وVice Captain مختلفين', 'error'); if (teamProblems.length) return showToast(`مسموح ${MAX_PER_TEAM.volleyball} لاعبين بس من نفس الفريق (${teamProblems[0].team} عنده ${teamProblems[0].count})`, 'error'); if (lineProblems.length) return showToast(`${byId[lineProblems[0].id]?.name || 'لاعب'} مش في الصف الصح (المطلوب: ${VB_LINES[lineProblems[0].need].arLabel})`, 'error'); await sbUpdateAccountField(user,'volleyball_team',team); showToast('تم حفظ الفريق','success'); };
  const sheetStatus = sheetChip ? chipStatus(sheetChip) : null;
  // Activating/cancelling a chip saves right away, on top of whatever is
  // already saved — not the unsaved draft squad on screen — so playing a chip
  // can never accidentally save a half-edited team.
  // `targetId` is the protected player for Libero Shield; `keepActive` swaps
  // that player while the chip stays on.
  const toggleChip = async (chip, { targetId = '', keepActive = false } = {}) => {
    if (state.locked) return showToast('الجيم ويك مقفول', 'error');
    const status = chipStatus(chip);
    if (keepActive ? status !== 'active' : status !== 'available' && status !== 'active') return;
    const activating = keepActive || status === 'available';
    if (chip.needsTarget && activating && !targetId) return showToast('اختار اللاعب الأول', 'error');
    try {
      const own = await sbGetAccount(user, 'volleyball_team');
      const saved = normalizeVolleyballTeam(own?.volleyball_team);
      if (chip.needsTarget && activating && volleyballLine(byId[targetId]) !== 'back') return showToast('الدرع شغال مع لاعبين الصف الخلفي بس', 'error');
      if (chip.needsTarget && activating && !saved.starters.includes(targetId)) return showToast('اللاعب ده مش في تشكيلتك المحفوظة، دوس Save Team الأول', 'error');
      saved.chips = { ...saved.chips, [chip.key]: activating ? Number(state.gw) : null };
      if (chip.needsTarget) saved.shieldedId = activating ? targetId : null;
      await sbUpdateAccountField(user, 'volleyball_team', saved);
      setTeam((current) => ({ ...current, chips: saved.chips, shieldedId: saved.shieldedId }));
      showToast(keepActive ? 'اتغيّر اللاعب' : activating ? `اتفعّل ${chip.arName} للجيم ويك ${state.gw}` : `اتلغى ${chip.arName}`, 'success');
    } catch (e) { console.error('volleyball chip toggle failed', e); showToast('مقدرش يحفظ الـ chip: ' + String(e.message || e).slice(0, 80), 'error'); }
  };
  const openChip = (chip) => { setShieldPick(team.shieldedId || ''); setChipSheet(chip.key); };

  if (loading) return <main className="vb-page"><FantasyBrandHeader sport="volleyball" onSwitchSport={onSwitchSport} /><div className="vb-state"><span className="fpl-state-spinner" /><strong>Loading Volleyball</strong><small>Getting your squad and gameweek state...</small></div></main>;
  if (error) return <main className="vb-page"><FantasyBrandHeader sport="volleyball" onSwitchSport={onSwitchSport} /><div className="vb-state"><strong>{error}</strong><button onClick={load}>إعادة المحاولة</button></div></main>;

  return <main className="vb-page">
    <FantasyBrandHeader sport="volleyball" onSwitchSport={onSwitchSport} />

    <nav className="vb-section-nav" aria-label="Volleyball sections">
      {VB_SECTIONS.map(([id, label]) => <button key={id} type="button" className={section === id ? 'active' : ''} onClick={() => setSection(id)}>{label}</button>)}
    </nav>

    {section === 'home' && <div className="vb-screen">
      {/* Same hero-card layout as Football Fantasy's home screen, just fed
          volleyball data, so both sports feel like one product. */}
      <section className="fpl-home-page">
        <section className="fpl-home-hero">
          <button type="button" className="fpl-home-manager" onClick={() => setSection('team')}>
            <span className="fpl-home-logo"><BrandGlyph logoUrl={settings?.fantasyLogoUrl || settings?.logoUrl} /></span>
            <span><strong>{teamName}</strong><small>{user}</small></span>
            <b aria-hidden="true">→</b>
          </button>

          <div className="fpl-home-divider" />
          <button type="button" className="fpl-home-score" onClick={() => setSection('team')}>
            <span className="fpl-home-gw">Gameweek {state.gw}</span>
            <span className="fpl-home-score-grid">
              <span><b>{gwAverage}</b><small>Average</small></span>
              <span className="main"><b>{points[`gw${state.gw}`] ?? livePoints}</b><small>Points →</small></span>
              <span><b>{gwHighest}</b><small>Highest</small></span>
            </span>
          </button>

          <div className="fpl-home-divider short" />
          <div className="fpl-home-rank-row">
            <span><small>Fagalla rank</small><strong>#{myRank}</strong></span>
            <span><small>Overall points</small><strong>{totalPoints}</strong></span>
            <span><small>Squad</small><strong>{selectedIds.length}/10</strong></span>
          </div>

          <div className="fpl-home-status">Gameweek {state.gw} · {state.locked ? 'Team locked' : 'Open for changes'}</div>
          <div className="fpl-home-actions">
            <button type="button" onClick={() => setSection('team')}><span>🏐</span>Pick Team</button>
            <button type="button" onClick={() => setSection('matches')}><span>📅</span>Fixtures</button>
          </div>
        </section>

        <section className="fpl-home-links">
          <button type="button" onClick={() => setSection('leagues')}><span><strong>Fagalla League</strong><small>See your position and every manager</small></span><b>›</b></button>
          <button type="button" onClick={() => setSection('team')}><span><strong>Gameweek points</strong><small>Open your scoring team on the court</small></span><b>›</b></button>
          <button type="button" onClick={() => setSection('more')}><span><strong>Scoring & top performers</strong><small>Rules and matchweek highlights</small></span><b>›</b></button>
        </section>
      </section>

      <div className="vb-title"><h2><i />Live Now</h2><span>{liveMatches.length} matches live</span></div>
      <div className="vb-match-scroll">{liveMatches.length ? liveMatches.map((match) => <MatchCard key={match.id} match={match} live/>) : <div className="vb-empty">No live matches</div>}</div>
      <div className="vb-title"><h2>Upcoming Matches</h2></div>
      <div className="vb-match-scroll">{upcomingMatches.length ? upcomingMatches.map((match) => <MatchCard key={match.id} match={match}/>) : <div className="vb-empty">Host will add upcoming matches</div>}</div>
    </div>}

    {section === 'team' && <div className="vb-screen">
      <div className="vb-heading"><h1>My Team</h1><span>3 front · 3 back · 4 bench</span></div>
      <div className="vb-team-values">
        <span>Budget Remaining <b>${(budgetLimit-spent).toFixed(1)}m</b></span>
        <span>Team Value <b>${spent.toFixed(1)}m</b></span>
      </div>
      {!!lineProblems.length && <div className="vb-line-warning">⚠ {lineProblems.map((problem) => `${byId[problem.id]?.name || 'لاعب'} (لازم ${VB_LINES[problem.need].arLabel})`).join('، ')} — مش في الصف الصح. غيّرهم واحفظ التشكيلة.</div>}
      {!!teamProblems.length && <div className="vb-line-warning">⚠ عندك {teamProblems.map((problem) => `${problem.count} من ${problem.team}`).join('، ')} — المسموح ${MAX_PER_TEAM.volleyball} بس من نفس الفريق. غيّر واحد واحفظ.</div>}
      {activeChip && <div className="vb-chip-banner"><span>{activeChip.icon}</span><div><strong>{activeChip.name} · {activeChip.arName}</strong><small>مفعّل في الجيم ويك {state.gw}{activeChip.needsTarget ? ` · على ${byId[team.shieldedId]?.name || 'لسه محدّدتش لاعب'}` : ''}</small></div></div>}
      <section className="vb-court">
        <div className="vb-court-floor">
          <div className="vb-net" />
          <div className="vb-six">{team.starters.map((id,index) => <PlayerSlot key={index} player={byId[id]} zone={ZONE_LABELS[index]} captain={id === team.captainId} vice={id === team.viceCaptainId} label={index < 3 ? `Front ${index+1}` : `Back ${index-2}`} locked={state.locked} onClick={() => id ? removePlayer('starters',index) : setPicker({group:'starters',index})} onCaptain={id ? () => setTeam((current) => ({...current,captainId:id,viceCaptainId:current.viceCaptainId === id ? null : current.viceCaptainId})) : null} onVice={id ? () => setTeam((current) => ({...current,viceCaptainId:id,captainId:current.captainId === id ? null : current.captainId})) : null} onInfo={id ? (event) => { event.stopPropagation(); setDetailsPlayer(byId[id]); } : null}/>)}</div>
        </div>
      </section>
      <section className="vb-bench">
        <h2>Bench (4/4)</h2>
        <div>{team.bench.map((id,index) => <PlayerSlot key={index} player={byId[id]} label={`Sub ${index+1}`} locked={state.locked} onClick={() => id ? removePlayer('bench',index) : setPicker({group:'bench',index})} onInfo={id ? (event) => { event.stopPropagation(); setDetailsPlayer(byId[id]); } : null}/>)}</div>
      </section>
      {!state.locked && <div className="vb-team-buttons"><button onClick={autoPick}>Auto Pick</button><button onClick={save}>Save Team</button></div>}

      <section className="vb-chips-bar">
        <div className="vb-chips-head"><strong>Chips</strong><small>اضغط على أي chip للشرح والتفعيل</small></div>
        <div className="vb-chips-row">
          {VB_CHIPS.map((chip) => {
            const status = chipStatus(chip);
            return (
              <button key={chip.key} type="button" className={`vb-chip-tile ${status}`} onClick={() => openChip(chip)} title={chip.name}>
                <span>{chip.icon}</span><small>{chip.arName}</small>{status === 'active' && <i>✓</i>}
              </button>
            );
          })}
        </div>
        <p className="vb-transfers-line">
          {isVolleyballChipActive(team, 'wildcard', state.gw) || isVolleyballChipActive(team, 'freeHit', state.gw) ? (
            <>تحويلات <b>مفتوحة</b> من غير خصم في الجيم ويك ده</>
          ) : !team.transfers?.start ? (
            <>أول تشكيلة ببلاش. التحويلات بتتحسب بعد أول جيم ويك</>
          ) : (
            <>تحويلات <b>{breakdown.transfersMade}</b> · مجاني <b>{breakdown.freeTransfers}</b>{breakdown.hit > 0 ? <> · خصم <b className="minus">{breakdown.hit} نقطة</b></> : <> · مفيش خصم</>}</>
          )}
        </p>
      </section>
    </div>}

    {section === 'matches' && <div className="vb-screen">
      <div className="vb-heading"><h1>مواعيد الفولي</h1><span>Live scores, fixtures and league table</span></div>
      <TimeTablePage sport="volleyball" embedded />
    </div>}

    {section === 'leagues' && <div className="vb-screen">
      <div className="vb-heading"><h1>Leagues</h1><span>Bigger community. Higher stakes.</span></div>
      <section className="fpl-league-table-wrap vb-league">
        <header><strong>Fagalla Players League</strong><span>One Game. One Community.</span></header>
        <div className="vb-league-rows">
          {ranking.map((row,index) => <div className={`vb-rank ${row.username === user ? 'mine' : ''}`} key={row.username}><b>{index+1}</b><strong>{row.username === user ? 'You' : row.username}</strong><span>{row.total}</span><i>{index % 2 ? '▼ 1' : '▲ 2'}</i></div>)}
        </div>
      </section>
      <div className="vb-title"><h2>Matchweek Highlights</h2></div>
      <section className="vb-highlights">
        {[['point_won','Top Scorer','pts'],['block','Most Blocks','blocks'],['ace_serve','Most Aces','aces']].map(([key,label,unit]) => { const top=topFor(key); return <div key={key}><small>{label}</small><PlayerPhoto player={top?.player}/><strong>{top?.player?.name || '-'}</strong><b>{top?.value || 0} {unit}</b></div>; })}
      </section>
    </div>}

    {section === 'news' && <div className="vb-screen vb-news-screen"><NewsPage /></div>}

    {section === 'more' && <div className="vb-screen">
      <div className="vb-heading"><h1>More</h1><span>Play. Predict. Dominate.</span></div>
      <section className="vb-rules">
        <h2>Scoring System</h2>
        {VOLLEYBALL_RULES.map((rule) => <div key={rule[0]}><span>{rule[1]}</span><b className={rule[2]<0?'minus':''}>{volleyballRuleWorthText(rule)}</b></div>)}
      </section>
      <section className="vb-chip-guide">
        <h2>قواعد التشكيلة · Squad</h2>
        <ul>{VB_SQUAD_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </section>
      <section className="vb-chip-guide">
        <h2>Chips · الأدوات الخاصة</h2>
        <p className="vb-chip-guide-intro">أدوات بتقلب الجيم ويك لصالحك. بتفعّلها من تبويب Team قبل القفل.</p>
        {VB_CHIPS.map((chip) => (
          <article key={chip.key}>
            <header><span>{chip.icon}</span><strong>{chip.name}</strong><em>{chip.arName}</em></header>
            <p>{chip.how}</p>
            <p className="vb-chip-example">مثال: {chip.example}</p>
          </article>
        ))}
        <h3>القواعد</h3>
        <ul>{VB_CHIP_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </section>
      <div className="vb-exclusive">حصريًا في كنيسة العذراء مريم بالفجالة<small>Volleyball brings us closer.</small></div>
    </div>}

    {sheetChip && <div className="vb-picker" onClick={() => setChipSheet(null)}>
      <div onClick={(event) => event.stopPropagation()}>
        <header><h2>{sheetChip.icon} {sheetChip.name}</h2><button onClick={() => setChipSheet(null)}>×</button></header>
        <div className="vb-chip-sheet">
          <em>{sheetChip.arName}</em>
          <p>{sheetChip.how}</p>
          <p className="vb-chip-example">مثال: {sheetChip.example}</p>
          {sheetChip.needsTarget && ['available', 'active'].includes(sheetStatus) && (
            <label className="vb-chip-target">اختار اللاعب (من الصف الخلفي)
              <select value={shieldPick} onChange={(event) => setShieldPick(event.target.value)}>
                <option value="">— اختار لاعب —</option>
                {team.starters.filter((id) => id && volleyballLine(byId[id]) === 'back').map((id) => <option key={id} value={id}>{byId[id]?.name || id}</option>)}
              </select>
            </label>
          )}
          <div>
            {sheetChip.needsTarget && sheetStatus === 'active' && (
              <button type="button" className="vb-chip-action" disabled={state.locked || !shieldPick || shieldPick === team.shieldedId} onClick={async () => { await toggleChip(sheetChip, { targetId: shieldPick, keepActive: true }); setChipSheet(null); }}>تغيير اللاعب</button>
            )}
            <button type="button" className={`vb-chip-action${sheetChip.needsTarget && sheetStatus === 'active' ? ' secondary' : ''}`} disabled={state.locked || !['available', 'active'].includes(sheetStatus) || (sheetChip.needsTarget && sheetStatus === 'available' && !shieldPick)} onClick={async () => { await toggleChip(sheetChip, { targetId: shieldPick }); setChipSheet(null); }}>
              {state.locked ? 'الجيم ويك مقفول' : sheetStatus === 'active' ? 'إلغاء التفعيل' : sheetStatus === 'used' ? `اتستخدم في GW${team.chips[sheetChip.key]}` : sheetStatus === 'blocked' ? 'فيه chip تاني مفعّل الجيم ويك ده' : sheetStatus === 'unavailable' ? 'بيتفتح بعد أول جيم ويك' : 'فعّل دلوقتي'}
            </button>
          </div>
        </div>
      </div>
    </div>}

    {picker && (() => {
      const need = picker.group === 'starters' ? volleyballSlotLine(picker.index) : null;
      const options = need ? players.filter((player) => volleyballLine(player) === need) : players;
      return <div className="vb-picker" onClick={() => setPicker(null)}><div onClick={(event) => event.stopPropagation()}>
        <header><h2>{need ? `Choose ${VB_LINES[need].label.toLowerCase()} player · ${VB_LINES[need].arLabel}` : 'Choose bench player'}</h2><button onClick={() => setPicker(null)}>×</button></header>
        {!options.length && <p className="vb-picker-empty">مفيش لاعبين {need ? VB_LINES[need].arLabel : ''} متاحين — الهوست لسه ماحدّدش صفوف اللاعبين.</p>}
        {options.map((player) => { const next = getUpcomingFixturesForTeam(player.team_name, matches, 1)[0]; const line = volleyballLine(player); const teamFull = wouldBreakTeamLimit(player, selectedIds, byId, MAX_PER_TEAM.volleyball); return <button key={player.id} disabled={selectedIds.includes(player.id)||spent+player.price>budgetLimit||teamFull} onClick={() => choosePlayer(player)}><PlayerPhoto player={player}/><strong>{player.name}<small>{player.team_name || player.country || 'Fagalla'}{line ? ` · ${VB_LINES[line].arLabel}` : ''}{teamFull ? ' · وصلت الحد من الفريق ده' : ''}{next ? ` · Next: ${next.venue} vs ${next.opponent}` : ''}</small></strong><b>${player.price}m</b></button>; })}
      </div></div>;
    })()}

    {detailsPlayer && <div className="vb-picker" onClick={() => setDetailsPlayer(null)}>
      <div onClick={(event) => event.stopPropagation()}>
        <header><h2>{detailsPlayer.name}</h2><button onClick={() => setDetailsPlayer(null)}>×</button></header>
        <div className="vb-player-detail">
          <PlayerPhoto player={detailsPlayer} />
          <strong>{detailsPlayer.team_name || 'Fagalla'}<small>${detailsPlayer.price}m</small></strong>
        </div>
        <div className="vb-title" style={{ margin: '4px 14px' }}><h2>Next 5 matches</h2></div>
        <div className="vb-fixture-list">
          {getUpcomingFixturesForTeam(detailsPlayer.team_name, matches, 5).map((f) => (
            <div className="vb-fixture-row" key={f.id}>
              <b>{f.gw ? `GW${f.gw}` : '—'}</b>
              <span>{f.venue} vs {f.opponent}</span>
              <small>{Number.isNaN(new Date(f.kickoff_time).getTime()) ? '' : new Date(f.kickoff_time).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small>
            </div>
          ))}
          {!getUpcomingFixturesForTeam(detailsPlayer.team_name, matches, 5).length && <div className="vb-empty" style={{ margin: 14 }}>No upcoming matches found for this team yet.</div>}
        </div>
      </div>
    </div>}
  </main>;
}