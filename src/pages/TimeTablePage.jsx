import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { sbAutoFinishOverdueMatches, sbGetMatches, sbGetPlayers, sbGetStats, sbGetTeamLogos, sbGetVolleyballMatches } from '../lib/db';
import { applyFootballStatsToMatches, buildLeagueTable, matchDisplayStatus } from '../lib/scheduleGenerator';
import { buildVolleyballSetStandings, formatSigned, setsWonInMatch } from '../lib/volleyballScoring';
import './TimeTablePage.css';

function TeamBadge({ name, logo }) {
  return <span className="teamBadge">{logo ? <img src={logo} alt="" /> : <i>{(name || '?').trim().slice(0, 1)}</i>}</span>;
}

export default function TimeTablePage({ sport = 'football', embedded = false }) {
  // Embedded use (inside the Volleyball Fantasy "Fixtures" tab) stays locked
  // to whichever sport it was given. The standalone "Time Table" menu item
  // manages its own tab so both schedules live under one shared menu entry.
  const [activeSport, setActiveSport] = useState(sport);
  useEffect(() => { if (embedded) setActiveSport(sport); }, [sport, embedded]);

  const [football, setFootball] = useState([]);
  const [volleyball, setVolleyball] = useState([]);
  const [logos, setLogos] = useState({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    setLoading(true);
    let [fb, vb, players, stats] = await Promise.all([
      sbGetMatches().catch(() => []), sbGetVolleyballMatches().catch(() => []),
      sbGetPlayers().catch(() => []), sbGetStats().catch(() => ({})),
    ]);
    // Football scores/status come entirely from the player goal stats the
    // host already enters for fantasy points, plus kickoff time — no stored
    // score or "mark as finished" step needed here at all.
    fb = applyFootballStatsToMatches(fb, players, stats);
    // Volleyball stays manual: whoever opens the Time Table first after a
    // match's kickoff + duration has passed flips it to "finished" so the
    // host doesn't have to close out every match by hand for it to count.
    vb = await sbAutoFinishOverdueMatches('volleyball_matches', vb).catch(() => vb);
    setFootball(fb); setVolleyball(vb); setLoading(false);
  }, []);
  useEffect(() => { load(); const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, [load]);
  // Logos are fetched per sport (own table row per team) so switching the
  // tab doesn't need to wait on the shared matches reload above.
  useEffect(() => { sbGetTeamLogos(activeSport).then(setLogos).catch(() => setLogos({})); }, [activeSport]);

  const matches = activeSport === 'football' ? football : volleyball;
  // Football keeps the classic played/won/drawn/lost/points table; volleyball
  // ranks purely on sets (won, then set ratio, then point ratio) — a real
  // volleyball standings table has no notion of match points at all.
  const table = useMemo(
    () => (activeSport === 'football' ? buildLeagueTable(football, 'football') : buildVolleyballSetStandings(volleyball)),
    [football, volleyball, activeSport]
  );
  const header = embedded ? null : (
    <header>
      <small>FAGALLA LEAGUES</small>
      <h1>{activeSport === 'football' ? 'مواعيد الكورة والترتيب' : 'مواعيد الفولي والترتيب'}</h1>
      <p>مباريات ونتائج وترتيب {activeSport === 'football' ? 'دوري الكورة' : 'دوري الفولي'} مباشر</p>
    </header>
  );
  const switcher = embedded ? null : (
    <div className="leagueSportSwitch">
      <button type="button" className={activeSport === 'football' ? 'active' : ''} onClick={() => setActiveSport('football')}>⚽ الكورة</button>
      <button type="button" className={activeSport === 'volleyball' ? 'active' : ''} onClick={() => setActiveSport('volleyball')}>🏐 الفولي</button>
    </div>
  );

  return (
    <main className={`leaguePage${embedded ? ' embedded' : ''}`}>
      {header}
      {switcher}
      {loading ? <div className="leagueEmpty">جاري تحميل الجدول...</div> : <>
        <section className="leagueBlock">
          <h2>جدول الدوري</h2>
          <div className="leagueTableScroll">
            {activeSport === 'football' ? (
              <div className="leagueTableInner">
                <div className="leagueTableHead"><span>#</span><span>الفريق</span><span>لعب</span><span>فوز</span><span>تعادل</span><span>خسارة</span><span>له</span><span>عليه</span><span>ف.أ</span><span>نقط</span></div>
                {table.map((row, index) => {
                  const diff = row.scored - row.conceded;
                  return (
                    <div className="leagueTableRow" key={row.team}>
                      <div className="leagueTableMain">
                        <b>{index + 1}</b>
                        <strong><TeamBadge name={row.team} logo={logos[row.team]} /><span className="teamNameText">{row.team}</span></strong>
                        <span>{row.played}</span>
                        <span>{row.won}</span>
                        <span>{row.drawn}</span>
                        <span>{row.lost}</span>
                        <span>{row.scored}</span>
                        <span>{row.conceded}</span>
                        <span className={diff > 0 ? 'diffPositive' : diff < 0 ? 'diffNegative' : ''}>{diff > 0 ? `+${diff}` : diff}</span>
                        <b>{row.points}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="leagueTableInner leagueTableInnerVb">
                <div className="leagueTableHead vbHead">
                  <span>#</span><span>الفريق</span><span>لعب</span><span>فوز</span><span>خسارة</span>
                  <span>له</span><span>عليه</span><span>ف.أ</span>
                  <span>نقاط له</span><span>نقاط عليه</span><span>ف.ن</span>
                  <span>نقط</span>
                </div>
                {table.map((row, index) => (
                  <div className="leagueTableRow" key={row.team}>
                    <div className="leagueTableMain vbMain">
                      <b>{index + 1}</b>
                      <strong><TeamBadge name={row.team} logo={logos[row.team]} /><span className="teamNameText">{row.team}</span></strong>
                      <span>{row.played}</span>
                      <span>{row.matchesWon}</span>
                      <span>{row.matchesLost}</span>
                      <span>{row.setsWon}</span>
                      <span>{row.setsLost}</span>
                      <span className={row.setDiff > 0 ? 'diffPositive' : row.setDiff < 0 ? 'diffNegative' : ''}>{formatSigned(row.setDiff)}</span>
                      <span>{row.pointsFor}</span>
                      <span>{row.pointsAgainst}</span>
                      <span className={row.pointDiff > 0 ? 'diffPositive' : row.pointDiff < 0 ? 'diffNegative' : ''}>{formatSigned(row.pointDiff)}</span>
                      <b>{row.points}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!table.length && <div className="leagueEmpty">الهوست لسه ما نشرش الدوري</div>}
        </section>

        <section className="leagueBlock">
          <h2>المباريات</h2>
          {matches.map((match, index) => {
            const status = matchDisplayStatus(match, now);
            const statusLabel = status === 'live' ? 'يلعب الآن' : status === 'finished' ? 'انتهت' : status === 'waiting' ? 'بانتظار النتيجة' : 'قادمة';
            const vbSets = activeSport === 'volleyball' ? setsWonInMatch(match.sets) : null;
            const playedSets = activeSport === 'volleyball' ? (match.sets || []).filter((s) => Number(s?.home) || Number(s?.away)) : [];
            // Matches are already sorted by kickoff time — a day header
            // between groups makes it obvious at a glance which matches are
            // today vs. the next matchday, instead of reading every date.
            const kickoff = new Date(match.kickoff_time);
            const dayKey = kickoff.toDateString();
            const prevDayKey = index > 0 ? new Date(matches[index - 1].kickoff_time).toDateString() : null;
            const isNewDay = dayKey !== prevDayKey;
            const dayLabel = Number.isNaN(kickoff.getTime()) ? '' : kickoff.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
            return (
              <Fragment key={match.id}>
                {isNewDay && <div className="leagueDayDivider"><span>{dayLabel}</span></div>}
                <article className={`leagueFixture ${status}`}>
                  <div>
                    <small>GW {match.gw || '-'} · {kickoff.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</small>
                    <b>{statusLabel}</b>
                  </div>
                  <section>
                    <div className="fixtureTeam">
                      <TeamBadge name={match.home_team} logo={logos[match.home_team]} />
                      <strong>{match.home_team}</strong>
                    </div>
                    {activeSport === 'volleyball' ? (
                      <span className="fixtureScore">
                        {status === 'upcoming' ? 'VS' : !playedSets.length ? '—' : `${vbSets.home}-${vbSets.away}`}
                        {!!playedSets.length && <small className="fixtureSets">{playedSets.map((s, i) => <span key={i}>{s.home}-{s.away}</span>)}</small>}
                      </span>
                    ) : (
                      <span className="fixtureScore">{status === 'upcoming' ? 'VS' : `${match.home_score} - ${match.away_score}`}</span>
                    )}
                    <div className="fixtureTeam">
                      <TeamBadge name={match.away_team} logo={logos[match.away_team]} />
                      <strong>{match.away_team}</strong>
                    </div>
                  </section>
                  <footer>مدة المباراة {match.duration_minutes || 60} دقيقة</footer>
                </article>
              </Fragment>
            );
          })}
          {!matches.length && <div className="leagueEmpty">لا توجد مباريات منشورة بعد</div>}
        </section>
      </>}
    </main>
  );
}
