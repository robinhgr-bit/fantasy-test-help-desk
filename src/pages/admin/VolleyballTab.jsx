import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUI } from '../../context/UIContext';
import { calcVolleyballPlayerPoints, calcVolleyballTeamPoints, rollVolleyballTeamToNextGw, VB_LINES, VOLLEYBALL_APPEARANCE_POINTS, VOLLEYBALL_RULES, volleyballLine, volleyballRuleWorthText } from '../../lib/volleyballScoring';
import { getTeamMatchOptions, guessCurrentMatchId } from '../../lib/scheduleGenerator';
import {
  sbDeleteVolleyballPlayer, sbGetAllVolleyballStats, sbGetTeams, sbGetVolleyballAccounts, sbGetVolleyballMatches,
  sbGetVolleyballPlayers, sbGetVolleyballState, sbGetVolleyballStats, sbSaveVolleyballPlayer, sbSetVolleyballState,
  sbSetVolleyballStats, sbSyncVolleyballLeaderboard, sbUpdateAccountField, uid,
} from '../../lib/db';

// Kept minimal on purpose: name, price, team — a player's jersey color comes
// from the team they're assigned to instead of a manual color picker.
// `role` now holds the player's court line, 'front' or 'back', chosen by the
// host (see volleyballScoring.js); country/image_url still ride along on the
// record (older data may have them) but the form doesn't ask for them.
const emptyPlayer = { name: '', price: 8, role: '', team_name: '', country: '', image_url: '', color: '', active: true };

export default function VolleyballTab() {
  const { showToast, openConfirm } = useUI();
  const [view, setView] = useState('players');
  const [players, setPlayers] = useState([]);
  const [teamRows, setTeamRows] = useState([]);
  const [scheduleTeams, setScheduleTeams] = useState([]);
  const [matches, setMatches] = useState([]);
  const [state, setState] = useState({ gw: 1, locked: false });
  const [stats, setStats] = useState({});
  const [allStats, setAllStats] = useState({});
  const [form, setForm] = useState(emptyPlayer);
  const [search, setSearch] = useState('');
  const [statModal, setStatModal] = useState(null); // player being edited
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [playerRows, gameState, teamRowsResult, matchRows] = await Promise.all([
      sbGetVolleyballPlayers(), sbGetVolleyballState(), sbGetTeams('volleyball'), sbGetVolleyballMatches().catch(() => []),
    ]);
    setPlayers(playerRows); setState(gameState); setTeamRows(teamRowsResult); setMatches(matchRows);
    const names = new Set();
    matchRows.forEach((m) => { if (m.home_team) names.add(m.home_team); if (m.away_team) names.add(m.away_team); });
    setScheduleTeams([...names]);
    setStats(await sbGetVolleyballStats(gameState.gw));
    setAllStats(await sbGetAllVolleyballStats());
  }, []);
  useEffect(() => { load().catch((error) => showToast(error.message, 'error')); }, [load, showToast]);
  // The team registry (colors/logos) may not have been touched yet even
  // though the schedule already names real teams — offer those too so the
  // dropdown isn't empty until the host visits the logo/color editor.
  const teams = useMemo(() => {
    const names = new Set([...teamRows.map((t) => t.team_name), ...scheduleTeams]);
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [teamRows, scheduleTeams]);

  const savePlayer = async () => {
    if (!form.name.trim()) return showToast('اكتب اسم اللاعب', 'error');
    if (!form.team_name) return showToast('اختار فريق اللاعب', 'error');
    if (!volleyballLine(form)) return showToast('اختار صف اللاعب: أمامي ولا خلفي', 'error');
    const team = teamRows.find((t) => t.team_name === form.team_name);
    setBusy(true);
    try {
      await sbSaveVolleyballPlayer({ ...form, id: form.id || uid(), name: form.name.trim(), price: Number(form.price) || 0, color: team?.color || '#7148ff' });
      setForm(emptyPlayer); await load(); showToast('تم حفظ اللاعب', 'success');
    } catch (e) { console.error('save volleyball player failed', e); showToast('مقدرش يحفظ اللاعب: ' + String(e.message || e).slice(0, 100), 'error'); }
    finally { setBusy(false); }
  };
  const setLine = async (player, role) => {
    try { await sbSaveVolleyballPlayer({ ...player, role }); await load(); }
    catch (e) { console.error('set volleyball line failed', e); showToast('مقدرش يحفظ الصف: ' + String(e.message || e).slice(0, 100), 'error'); }
  };
  const remove = async (player) => {
    if (!(await openConfirm(`حذف ${player.name}؟`))) return;
    try { await sbDeleteVolleyballPlayer(player.id); await load(); }
    catch (e) { console.error('delete volleyball player failed', e); showToast('مقدرش يحذف: ' + String(e.message || e).slice(0, 100), 'error'); }
  };

  const toggleLock = async () => {
    setBusy(true);
    try { const next = { ...state, locked: !state.locked }; await sbSetVolleyballState(next); setState(next); }
    catch (e) { console.error('toggle volleyball lock failed', e); showToast('مقدرش يغيّر الحالة: ' + String(e.message || e).slice(0, 100), 'error'); }
    finally { setBusy(false); }
  };
  const zeroGW = async () => {
    if (!(await openConfirm(`هترجّع نقط كل اللاعبين في الجولة ${state.gw} لصفر. متأكد؟`))) return;
    setBusy(true);
    try {
      await sbSetVolleyballStats(state.gw, {});
      setStats({}); setAllStats(await sbGetAllVolleyballStats());
      showToast('اتصفّرت', 'success');
    } catch (e) { console.error('zero volleyball gw failed', e); showToast('مقدرتش أصفّرها: ' + String(e.message || e).slice(0, 100), 'error'); }
    finally { setBusy(false); }
  };
  const finalize = async () => {
    if (!(await openConfirm(`اعتماد الجولة ${state.gw} وفتح الجولة التالية؟`))) return;
    setBusy(true);
    try {
      await sbSetVolleyballStats(state.gw, stats);
      const accounts = await sbGetVolleyballAccounts();
      // Every manager's points (chips + transfer hit included) and their
      // next-gameweek squad (Free Hit undone, free transfers banked) are
      // written in parallel rather than one manager at a time.
      const totals = await Promise.all(accounts.map(async (account) => {
        const gwPoints = calcVolleyballTeamPoints(account.volleyball_team, stats, state.gw);
        const nextPoints = { ...(account.volleyball_points || {}), [`gw${state.gw}`]: gwPoints };
        await sbUpdateAccountField(account.username, 'volleyball_points', nextPoints);
        if (account.volleyball_team) await sbUpdateAccountField(account.username, 'volleyball_team', rollVolleyballTeamToNextGw(account.volleyball_team, state.gw));
        return { username: account.username, total_points: Object.values(nextPoints).reduce((sum, value) => sum + (Number(value) || 0), 0) };
      }));
      await sbSyncVolleyballLeaderboard(totals);
      const nextState = { gw: Number(state.gw) + 1, locked: false };
      await sbSetVolleyballState(nextState); await sbSetVolleyballStats(nextState.gw, {});
      setState(nextState); setStats({});
      setAllStats(await sbGetAllVolleyballStats());
      showToast('تم اعتماد الجولة', 'success');
    } catch (e) { console.error('finalize volleyball gw failed', e); showToast('في مشكلة وإحنا بنحسب النقط: ' + String(e.message || e).slice(0, 100), 'error'); }
    finally { setBusy(false); }
  };

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const gwKeys = Object.keys(allStats).filter((k) => /^gw\d+$/.test(k)).sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));

  return <div className="volleyAdmin">
    <div className="adminContentSwitch volleyAdminSwitch"><button className={view === 'players' ? 'active' : ''} onClick={() => setView('players')}>اللاعبون</button><button className={view === 'scoring' ? 'active' : ''} onClick={() => setView('scoring')}>الحكم والنقاط</button></div>

    {view === 'players' && <>
      <p className="hint" style={{ margin: '0 0 10px' }}>مواعيد ونتائج مباريات الفولي، وكمان الفرق ولوجوهاتها وألوانها، بقوا في تبويب "الدوري والجدول" ↑ (دوري الفولي → الفرق ولوجوهاتها) زي الكورة بالظبط. ضيف الفريق هناك الأول عشان يظهر هنا في الاختيار تحت.</p>

      <div className="card">
        <h3 className="disp">{form.id ? 'تعديل اللاعب' : 'لاعب جديد'}</h3>
        <div className="row">
          <div style={{ flex: 2, minWidth: 140 }}><label>الاسم</label><input placeholder="اسم اللاعب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label>السعر (مليون)</label><input type="number" min="0" step="0.5" placeholder="8" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
        </div>
        <div style={{ height: 8 }} />
        <label>الفريق</label>
        <select value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })}>
          <option value="">اختار الفريق</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {!teams.length && <p className="hint">ضيف فريق الأول فوق قبل ما تضيف لاعبين.</p>}
        <div style={{ height: 8 }} />
        <label>الصف (كل فريق لازم يبقى فيه 3 أمامي و3 خلفي)</label>
        <select value={volleyballLine(form) || ''} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="">اختار الصف</option>
          <option value="front">أمامي (عند الشبكة)</option>
          <option value="back">خلفي</option>
        </select>
        <div style={{ height: 10 }} />
        <button className="btn" onClick={savePlayer} disabled={busy}>حفظ اللاعب</button>
        {form.id && <button className="btn ghost" onClick={() => setForm(emptyPlayer)}>إلغاء التعديل</button>}
      </div>

      <div className="card">
        <h3 className="disp">اللاعبون ({players.length})</h3>
        {players.some((player) => !volleyballLine(player)) && <p className="hint" style={{ color: 'var(--red)' }}>في {players.filter((player) => !volleyballLine(player)).length} لاعب لسه ملهمش صف — مش هيظهروا للمستخدمين في التشكيلة الأساسية لحد ما تحدّد صفهم من القايمة تحت.</p>}
        <input placeholder="دوّر باسم لاعب..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="plist" style={{ marginTop: 10 }}>
          {filtered.length === 0 && <p className="hint">لسه معملتش لاعبين</p>}
          {filtered.map((player) => (
            <div className="volleyAdminPlayer" key={player.id}>
              <i style={{ background: player.color }} />
              <strong>{player.name}<small>{player.team_name || 'بدون فريق'} · {player.price}m</small></strong>
              <select className="volleyLineSelect" value={volleyballLine(player) || ''} onChange={(e) => setLine(player, e.target.value)} title="صف اللاعب">
                <option value="" disabled>حدّد الصف</option>
                <option value="front">{VB_LINES.front.arLabel}</option>
                <option value="back">{VB_LINES.back.arLabel}</option>
              </select>
              <button className="btn small ghost" onClick={() => setForm(player)}>تعديل</button>
              <button className="btn small danger" onClick={() => remove(player)}>حذف</button>
            </div>
          ))}
        </div>
      </div>
    </>}

    {view === 'scoring' && <>
      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 10px' }}>التحكم في جولة الفولي</h3>
        <p>الجولة الحالية: <b className="rank1">GW {state.gw}</b> — الحالة: <span className={`statusDot ${state.locked ? 'is-locked' : 'is-open'}`}>{state.locked ? 'قافلة' : 'مفتوحة'}</span></p>

        <div style={{ marginTop: 14 }}>
          <button className="btn ghost" style={{ width: '100%' }} disabled={busy} onClick={toggleLock}>
            {state.locked ? 'افتح التشكيلات تاني' : 'اقفل التشكيلات (الماتش بدأ)'}
          </button>
          <p className="hint">ده بيمنع الناس تعدّل تشكيلتها بس. <b>مش</b> بيبدأ جولة جديدة ومش بيصفّر حاجة.</p>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={finalize}>
            اقفل GW {state.gw} خالص وابدأ GW {state.gw + 1}
          </button>
          <p className="hint">ده بيسجّل نقط كل الناس في GW {state.gw}، وبعدين <b>يصفّر كل اللاعبين</b> ويبدأ GW {state.gw + 1}.</p>
        </div>

        <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <button className="btn ghost" style={{ width: '100%' }} disabled={busy} onClick={zeroGW}>
            صفّر نقط كل اللاعبين في GW {state.gw}
          </button>
          <p className="hint">بيرجّع نقط كل اللاعبين في الجولة الحالية لصفر من غير ما يبدأ جولة جديدة.</p>
        </div>
      </div>

      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 4px' }}>إحصائيات GW {state.gw}</h3>
        <p className="hint">دوس على أي لاعب عشان تسجّل أفعاله في الماتش (نقط، بلوكات، كروت...) وبتتحسب النقط أوتوماتيك.</p>
        <input placeholder="دوّر باسم لاعب..." style={{ marginTop: 10 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {filtered.map((player) => (
            <div className="prow" key={player.id}>
              <div className="info"><span>{player.name}</span></div>
              <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                <span className="hint">نقط GW {state.gw}: <b className="num" style={{ color: 'var(--gold)' }}>{calcVolleyballPlayerPoints(stats[player.id])}</b></span>
                <button className="btn small ghost" onClick={() => setStatModal(player)}>تفاصيل</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {players.length > 0 && gwKeys.length > 0 && (
        <div className="card">
          <h3 className="disp" style={{ margin: '0 0 4px' }}>سجل نقط اللاعبين</h3>
          <p className="hint">نقط كل لاعب في كل جولة. الأرقام دي محفوظة ومش بتتمسح لما تصفّر الجولة الجديدة.</p>
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table className="stTable" style={{ minWidth: 180 + gwKeys.length * 60 }}>
              <thead>
                <tr>
                  <th>اللاعب</th>
                  {gwKeys.map((k) => <th key={k} style={{ textAlign: 'center' }}>GW {k.slice(2)}</th>)}
                  <th style={{ textAlign: 'center' }}>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const perGw = gwKeys.map((k) => calcVolleyballPlayerPoints(allStats[k]?.[p.id]));
                  return (
                    <tr key={p.id}>
                      <td><span className="swatch" style={{ background: p.color || '#7148ff' }} />{p.name}</td>
                      {perGw.map((pts, index) => <td key={gwKeys[index]} style={{ textAlign: 'center' }}>{pts}</td>)}
                      <td className="ptscell" style={{ textAlign: 'center' }}>{perGw.reduce((sum, v) => sum + v, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {statModal && (
        <VolleyballPlayerStatsModal
          player={statModal}
          matches={matches}
          gwKey={'gw' + state.gw}
          existing={stats[statModal.id] || null}
          onClose={() => setStatModal(null)}
          onSaved={async (vals) => {
            const fullGw = { ...stats, [statModal.id]: vals };
            await sbSetVolleyballStats(state.gw, fullGw);
            setStats(fullGw);
            setAllStats(await sbGetAllVolleyballStats());
          }}
        />
      )}
    </>}
  </div>;
}

function VolleyballPlayerStatsModal({ player, matches, gwKey, existing, onClose, onSaved }) {
  const { showToast } = useUI();
  const [vals, setVals] = useState(() => {
    const base = { played: Boolean(existing?.played) };
    VOLLEYBALL_RULES.forEach(([key]) => { base[key] = existing?.[key] || 0; });
    return base;
  });
  const matchOptions = getTeamMatchOptions(player.team_name, matches);
  const [matchId, setMatchId] = useState(() => existing?.matchId || guessCurrentMatchId(player.team_name, matches) || '');
  const [saving, setSaving] = useState(false);

  const total = calcVolleyballPlayerPoints(vals);

  const save = async () => {
    setSaving(true);
    try {
      await onSaved({ ...vals, matchId: matchId || null });
      showToast(`اتحفظت إحصائيات ${player.name}`, 'success');
      onClose();
    } catch (e) {
      console.error('save volleyball player stat failed', e);
      showToast('ماتحفظتش: ' + String(e.message || e).slice(0, 80), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ maxWidth: 380 }}>
        <h3 className="disp" style={{ margin: '0 0 2px' }}>{player.name}</h3>
        <p className="hint" style={{ margin: '0 0 12px' }}>GW {gwKey.replace('gw', '')}</p>
        {player.team_name ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>الماتش</label>
            <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              <option value="">بدون ماتش محدد</option>
              {matchOptions.map((m) => {
                const isHome = (m.home_team || '').trim().toLowerCase() === player.team_name.trim().toLowerCase();
                const opponent = isHome ? m.away_team : m.home_team;
                const dateLabel = Number.isNaN(new Date(m.kickoff_time).getTime()) ? '' : new Date(m.kickoff_time).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
                return <option key={m.id} value={m.id}>{isHome ? 'vs' : '@'} {opponent} · {dateLabel}</option>;
              })}
            </select>
            {!matchOptions.length && <p className="hint">فريق {player.team_name} لسه ملوش ماتشات في الجدول.</p>}
          </div>
        ) : (
          <p className="hint" style={{ color: 'var(--gold)', margin: '0 0 12px' }}>اللاعب ده لسه بدون فريق — عيّنه فريق من فوق.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', paddingBottom: 9, borderBottom: '1px solid var(--line)' }}>
            <label style={{ margin: 0 }}><b>شارك في الماتش</b> <span className="hint">(+{VOLLEYBALL_APPEARANCE_POINTS} أوتوماتيك)</span></label>
            <input type="checkbox" checked={!!vals.played} onChange={(e) => setVals((v) => ({ ...v, played: e.target.checked }))} />
          </div>
          {VOLLEYBALL_RULES.map((rule) => { const [key, label] = rule; return (
            <div className="row" key={key} style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ margin: 0 }}>{label} <span className="hint">({rule[3] ? `+${rule[2]} لكل ${rule[3]}` : `${volleyballRuleWorthText(rule)} لكل مرة`})</span></label>
              <input type="number" min="0" style={{ width: 60, padding: 5, textAlign: 'center' }} value={vals[key]} onChange={(e) => setVals((v) => ({ ...v, [key]: parseInt(e.target.value) || 0 }))} />
            </div>
          ); })}
        </div>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          <span className="hint">الإجمالي</span>
          <span className="num" style={{ fontSize: 20, color: 'var(--gold)' }}>{total}</span>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={onClose} disabled={saving}>إلغاء</button>
          <button className="btn small" style={{ flex: 1 }} onClick={save} disabled={saving}>احفظ</button>
        </div>
      </div>
    </div>
  );
}
