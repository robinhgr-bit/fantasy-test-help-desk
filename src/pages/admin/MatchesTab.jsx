import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUI } from '../../context/UIContext';
import { sbAutoFinishOverdueMatches, sbClearTeamLogo, sbDeleteMatch, sbDeleteTeam, sbDeleteVolleyballMatch, sbGetMatches, sbGetPlayers, sbGetStats, sbGetTeams, sbGetVolleyballMatches, sbReplaceSchedule, sbSetTeamColor, sbSetTeamLogo, sbUpdateScheduledMatch, sbUploadImage } from '../../lib/db';
import { applyFootballStatsToMatches, generateLeagueSchedule, matchDisplayStatus } from '../../lib/scheduleGenerator';
import ImageCropModal from '../../components/ImageCropModal';
import MatchStatsPanel from './MatchStatsPanel';

// One registry per sport: a logo for the Time Table's badges, and a color
// every player on that team inherits automatically (both football and
// volleyball players pick a team instead of a manual jersey color).
function TeamLogosEditor({ sport, matches }) {
  const { showToast, openConfirm } = useUI();
  const [teams, setTeams] = useState({});
  const [loading, setLoading] = useState(true);
  const [newTeam, setNewTeam] = useState('');
  const [busyTeam, setBusyTeam] = useState(null);
  const [cropTarget, setCropTarget] = useState(null); // { teamName, file }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sbGetTeams(sport);
      setTeams(Object.fromEntries(rows.map((r) => [r.team_name, { logo_url: r.logo_url || '', color: r.color || '' }])));
    } catch (e) { console.error('load teams failed', e); }
    setLoading(false);
  }, [sport]);
  useEffect(() => { load(); }, [load]);

  const teamNames = useMemo(() => {
    const names = new Set();
    matches.forEach((m) => { if (m.home_team) names.add(m.home_team); if (m.away_team) names.add(m.away_team); });
    Object.keys(teams).forEach((name) => names.add(name));
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [matches, teams]);

  const uploadFor = async (teamName, file) => {
    if (!file) return;
    setBusyTeam(teamName);
    try {
      const url = await sbUploadImage(file, `team-logos/${sport}`);
      await sbSetTeamLogo(sport, teamName, url);
      setTeams((current) => ({ ...current, [teamName]: { ...(current[teamName] || {}), logo_url: url } }));
      showToast('اتحفظ لوجو الفريق', 'success');
    } catch (e) {
      showToast('مقدرش يرفع اللوجو: ' + String(e.message || e).slice(0, 80), 'error');
    } finally { setBusyTeam(null); }
  };

  const removeLogo = async (teamName) => {
    setBusyTeam(teamName);
    try { await sbClearTeamLogo(sport, teamName); setTeams((current) => ({ ...current, [teamName]: { ...(current[teamName] || {}), logo_url: '' } })); }
    catch (e) { showToast('مقدرش يشيل اللوجو: ' + String(e.message || e).slice(0, 80), 'error'); }
    finally { setBusyTeam(null); }
  };

  const setColor = async (teamName, color) => {
    setTeams((current) => ({ ...current, [teamName]: { ...(current[teamName] || {}), color } }));
    try { await sbSetTeamColor(sport, teamName, color); }
    catch (e) { showToast('مقدرش يحفظ لون الفريق: ' + String(e.message || e).slice(0, 80), 'error'); }
  };

  const addTeam = () => {
    const name = newTeam.trim();
    if (!name) return;
    setTeams((current) => (name in current ? current : { ...current, [name]: { logo_url: '', color: '' } }));
    setNewTeam('');
  };

  const deleteTeam = async (teamName) => {
    const usedInSchedule = matches.some((m) => m.home_team === teamName || m.away_team === teamName);
    const msg = usedInSchedule
      ? `الفريق "${teamName}" لسه ليه ماتشات في الجدول المنشور — حذفه هيشيل بس اللوجو واللون، والاسم هيفضل ظاهر هنا لحد ما تمسحه من الجدول. تكمل؟`
      : `حذف فريق "${teamName}"؟`;
    if (!(await openConfirm(msg))) return;
    setBusyTeam(teamName);
    try {
      await sbDeleteTeam(sport, teamName);
      setTeams((current) => { const next = { ...current }; delete next[teamName]; return next; });
      showToast('اتمسح الفريق', 'success');
    } catch (e) { showToast('مقدرش يمسح الفريق: ' + String(e.message || e).slice(0, 80), 'error'); }
    finally { setBusyTeam(null); }
  };

  return (
    <div className="card teamLogosCard">
      <h3 className="disp">الفرق ولوجوهاتها</h3>
      <p className="hint">لوجو وكمان لون كل فريق — اللاعبين بتاعين الفريق ده بياخدوا نفس اللون تلقائي بدل ما تختاره لكل لاعب لوحده.</p>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <input placeholder="اسم فريق (لو مش في الجدول لسه)" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
        <button type="button" className="btn small ghost" onClick={addTeam}>ضيف فريق</button>
      </div>
      {loading ? <p className="hint">بيتحمل...</p> : !teamNames.length ? (
        <p className="hint">لسه مفيش فرق — انشر الجدول الأول أو ضيف اسم فريق فوق.</p>
      ) : (
        <div className="teamLogoList">
          {teamNames.map((teamName) => {
            const t = teams[teamName] || {};
            return (
              <div className="teamLogoRow" key={teamName}>
                <span className="teamLogoPreview" style={{ background: t.color || '#7148ff' }}>{t.logo_url ? <img src={t.logo_url} alt="" /> : teamName.slice(0, 1)}</span>
                <strong>{teamName}</strong>
                <input type="color" className="colorpick" value={t.color || '#7148ff'} title="لون الفريق" onChange={(e) => setColor(teamName, e.target.value)} />
                <label className="btn small ghost teamLogoUpload">
                  {busyTeam === teamName ? '...' : (t.logo_url ? 'غيّر اللوجو' : 'ضيف لوجو')}
                  <input type="file" accept="image/*" hidden disabled={busyTeam === teamName} onChange={(e) => { const file = e.target.files?.[0]; if (file) setCropTarget({ teamName, file }); e.target.value = ''; }} />
                </label>
                <button type="button" className="btn small danger" disabled={busyTeam === teamName || !t.logo_url} onClick={() => removeLogo(teamName)}>شيل اللوجو</button>
                <button type="button" className="btn small danger" disabled={busyTeam === teamName} onClick={() => deleteTeam(teamName)}>حذف الفريق</button>
              </div>
            );
          })}
        </div>
      )}

      {cropTarget && (
        <ImageCropModal
          file={cropTarget.file}
          shape="circle"
          title={`لوجو ${cropTarget.teamName}`}
          onCancel={() => setCropTarget(null)}
          onCropped={(croppedFile) => { const { teamName } = cropTarget; setCropTarget(null); uploadFor(teamName, croppedFile); }}
        />
      )}
    </div>
  );
}

const DAYS = [['6','السبت'],['0','الأحد'],['1','الإثنين'],['2','الثلاثاء'],['3','الأربعاء'],['4','الخميس'],['5','الجمعة']];
const today = new Date().toISOString().slice(0,10);
// datetime-local inputs read/write local wall-clock digits, not UTC — using
// toISOString() here would silently shift the displayed time by the host's
// UTC offset every time they open the reschedule field.
const toLocalDatetimeValue = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function MatchesTab() {
  const { showToast, openConfirm } = useUI();
  const { players, stats, setStats, gwState } = useApp();
  const [sport,setSport] = useState('football');
  const [matches,setMatches] = useState([]);
  const [preview,setPreview] = useState([]);
  const [statsMatch, setStatsMatch] = useState(null);
  const [form,setForm] = useState({ teams:'', gamesPerWeek:2, duration:60, gap:15, weekdays:['5','6'], startDate:today, startTime:'18:00', meetingsPerPair:2 });
  const table = sport === 'football' ? 'matches' : 'volleyball_matches';
  const load = useCallback(async () => {
    if (sport === 'football') {
      // Football scores/status are computed from player goal stats + kickoff
      // time (see TimeTablePage) rather than typed in here — see them the
      // same way here so the schedule list matches what players see.
      const [rows, players, stats] = await Promise.all([sbGetMatches(), sbGetPlayers(), sbGetStats()]);
      setMatches(applyFootballStatsToMatches(rows, players, stats));
    } else {
      const rows = await sbGetVolleyballMatches();
      setMatches(await sbAutoFinishOverdueMatches(table, rows));
    }
  }, [sport, table]);
  useEffect(() => { load().catch((error) => showToast(error.message,'error')); },[load,showToast]);
  const toggleDay = (day) => setForm((current) => ({...current,weekdays:current.weekdays.includes(day)?current.weekdays.filter((item)=>item!==day):[...current.weekdays,day]}));
  const generate = () => { try { setPreview(generateLeagueSchedule({...form,teams:form.teams.split(/\n|,/)})); } catch(error) { showToast(error.message,'error'); } };
  const publish = async () => {
    if (!preview.length) return showToast('اعمل توليد للجدول الأول','error');
    if (matches.length && !(await openConfirm(`استبدال جدول ${sport === 'football'?'الكورة':'الفولي'} الحالي؟`))) return;
    try {
      await sbReplaceSchedule(table, preview);
      setPreview([]); await load();
      showToast('تم نشر الدوري والجدول','success');
    } catch (error) { console.error('Publish schedule failed:', error); showToast('فشل النشر: ' + (error.message || 'خطأ'),'error'); }
  };
  const updateLocal = (id,field,value) => setMatches((current)=>current.map((match)=>match.id===id?{...match,[field]:value}:match));
  const updateSet = (id, index, side, value) => setMatches((current) => current.map((match) => {
    if (match.id !== id) return match;
    const sets = Array.from({ length: 3 }, (_, i) => match.sets?.[i] || { home: '', away: '' });
    sets[index] = { ...sets[index], [side]: value };
    return { ...match, sets };
  }));
  const saveReschedule = async (match) => {
    try {
      await sbUpdateScheduledMatch(table, match.id, { kickoff_time: new Date(match.kickoff_time).toISOString() });
      showToast('اتحفظ الميعاد الجديد','success');
    } catch (error) { console.error('Reschedule failed:', error); showToast('فشل الحفظ: ' + (error.message || 'خطأ'),'error'); }
  };
  const saveResult = async (match) => {
    try {
      const sets = (match.sets || []).map((s) => ({ home: Number(s?.home) || 0, away: Number(s?.away) || 0 }));
      await sbUpdateScheduledMatch(table, match.id, { sets, status: match.status, kickoff_time: new Date(match.kickoff_time).toISOString() });
      showToast('تم تحديث المباراة','success');
    } catch (error) { console.error('Score update failed:', error); showToast('فشل حفظ النتيجة: ' + (error.message || 'خطأ'),'error'); }
  };
  const remove = async (match) => {
    if (!(await openConfirm('حذف المباراة؟'))) return;
    try {
      await (sport === 'football' ? sbDeleteMatch(match.id) : sbDeleteVolleyballMatch(match.id));
      await load();
    } catch (error) { console.error('Delete match failed:', error); showToast('فشل الحذف: ' + (error.message || 'خطأ'),'error'); }
  };
  const clearAll = async () => {
    if (!(await openConfirm(`مسح كل جدول ${sport === 'football' ? 'الكورة' : 'الفولي'} (${matches.length} مباراة)؟ الإجراء ده مش هينفع يترجع.`))) return;
    try {
      await sbReplaceSchedule(table, []);
      await load();
      showToast('اتمسح الجدول كله', 'success');
    } catch (error) { console.error('Clear schedule failed:', error); showToast('فشل المسح: ' + (error.message || 'خطأ'),'error'); }
  };
  if (statsMatch) {
    return <div className="scheduleAdmin">
      <MatchStatsPanel match={statsMatch} players={players} stats={stats} setStats={setStats} gwState={gwState} onClose={() => setStatsMatch(null)} />
    </div>;
  }

  return <div className="scheduleAdmin">
    <div className="adminContentSwitch"><button className={sport==='football'?'active':''} onClick={()=>{setSport('football');setPreview([]);setStatsMatch(null)}}>دوري الكورة</button><button className={sport==='volleyball'?'active':''} onClick={()=>{setSport('volleyball');setPreview([]);setStatsMatch(null)}}>دوري الفولي</button></div>
    <div className="card scheduleBuilder"><h3 className="disp">مولّد الدوري العشوائي</h3><p className="hint">اكتب كل فريق في سطر. كل ضغطة توليد تغيّر ترتيب المواجهات، والنظام يضمن أن كل فريق يقابل باقي الفرق.</p><label>أسماء الفرق</label><textarea rows="6" placeholder={'فريق النور\nفريق الرجاء\nفريق السلام\nفريق المحبة'} value={form.teams} onChange={(event)=>setForm({...form,teams:event.target.value})}/><div className="row"><label>مباريات كل فريق أسبوعيًا<input type="number" min="1" max="7" value={form.gamesPerWeek} onChange={(event)=>setForm({...form,gamesPerWeek:event.target.value})}/></label><label>مدة المباراة بالدقائق<input type="number" min="10" value={form.duration} onChange={(event)=>setForm({...form,duration:event.target.value})}/></label><label>فاصل بين المباريات<input type="number" min="0" value={form.gap} onChange={(event)=>setForm({...form,gap:event.target.value})}/></label></div><label>أيام اللعب</label><div className="scheduleDays">{DAYS.map(([value,label])=><button type="button" key={value} className={form.weekdays.includes(value)?'active':''} onClick={()=>toggleDay(value)}>{label}</button>)}</div><div className="row"><label>بداية الدوري<input type="date" value={form.startDate} onChange={(event)=>setForm({...form,startDate:event.target.value})}/></label><label>أول مباراة الساعة<input type="time" value={form.startTime} onChange={(event)=>setForm({...form,startTime:event.target.value})}/></label></div><label>كل فريق يقابل الفريق التاني كام مرة؟<input type="number" min="1" max="12" value={form.meetingsPerPair} onChange={(event)=>setForm({...form,meetingsPerPair:event.target.value})}/></label><p className="hint" style={{marginTop:-6}}>1 = كل الفرق تتقابل مرة واحدة بس، 2 = ذهاب وعودة (زي الافتراضي)، وهكذا.</p><div className="row"><button className="btn ghost" onClick={generate}>توليد عشوائي</button><button className="btn" onClick={publish} disabled={!preview.length}>نشر الجدول ({preview.length})</button></div></div>
    {!!preview.length&&<div className="card"><h3>معاينة قبل النشر</h3>{preview.map((match)=><div className="schedulePreview" key={match.id}><b>GW {match.gw}</b><span>{match.home_team} × {match.away_team}</span><small>{new Date(match.kickoff_time).toLocaleString('ar-EG')}</small></div>)}</div>}
    <TeamLogosEditor sport={sport} matches={matches} />
    <div className="card">
      <div className="row" style={{justifyContent:'space-between',alignItems:'center'}}><h3 className="disp">الجدول المنشور ({matches.length})</h3>{!!matches.length && <button className="btn small danger" onClick={clearAll}>امسح الجدول كله</button>}</div>
      {sport === 'football' && <p className="hint">نتيجة كل ماتش بتتحسب أوتوماتيك من جون كل لاعب مربوط بالماتش ده بالظبط (تختاره وانت بتسجّل إحصائيات اللاعب في "الجيم ويك") — لو لسه محدش ربط جون بالماتش ده، هتفضل 0-0. تقدر بس تغيّر ميعاد الماتش من هنا.</p>}
      {matches.map((match)=><div className="scheduleMatchEdit" key={match.id}>
        <div><b>{match.home_team} × {match.away_team}</b><small>{match.duration_minutes||60} دقيقة · {matchDisplayStatus(match)}</small></div>
        <div className="scheduleReschedule"><label>ميعاد المباراة<input type="datetime-local" value={toLocalDatetimeValue(match.kickoff_time)} onChange={(event)=>updateLocal(match.id,'kickoff_time',event.target.value)}/></label></div>
        {sport === 'football' ? (
          <div className="scheduleScore scheduleScoreReadonly">
            <b>{match.home_score}</b><span>-</span><b>{match.away_score}</b>
            <span className="hint" style={{gridColumn:'span 1'}}>محسوبة من الإحصائيات</span>
            <button className="btn small" onClick={()=>setStatsMatch(match)}>الإحصائيات</button>
            <button className="btn small" onClick={()=>saveReschedule(match)}>احفظ الميعاد</button>
            <button className="btn small danger" onClick={()=>remove(match)}>حذف</button>
          </div>
        ) : (
          <div className="scheduleSets">
            {[0, 1, 2].map((index) => {
              const set = match.sets?.[index] || { home: '', away: '' };
              return (
                <div className="scheduleSetRow" key={index}>
                  <span>الشوط {index + 1}</span>
                  <input type="number" min="0" placeholder="0" value={set.home} onChange={(event) => updateSet(match.id, index, 'home', event.target.value)} />
                  <span>-</span>
                  <input type="number" min="0" placeholder="0" value={set.away} onChange={(event) => updateSet(match.id, index, 'away', event.target.value)} />
                </div>
              );
            })}
            <p className="hint" style={{ margin: '4px 0 0' }}>سيب أي شوط ملوش لعب فاضي (0-0) عشان ميتحسبش في الجدول.</p>
            <div className="scheduleScore scheduleScoreCompact">
              <select value={match.status} onChange={(event)=>updateLocal(match.id,'status',event.target.value)}><option value="upcoming">قادمة</option><option value="live">Live يدوي</option><option value="finished">انتهت</option></select>
              <button className="btn small" onClick={()=>saveResult(match)}>حفظ</button>
              <button className="btn small danger" onClick={()=>remove(match)}>حذف</button>
            </div>
          </div>
        )}
      </div>)}
    </div>
  </div>;
}
