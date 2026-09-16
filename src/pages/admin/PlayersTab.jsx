import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUI } from '../../context/UIContext';
import { sbGetMatches, sbGetTeams, sbSetPlayers, sbSetPlayerLocked, uid } from '../../lib/db';

export default function PlayersTab() {
  const { players, setPlayers } = useApp();
  const { showToast, openConfirm } = useUI();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamRows, setTeamRows] = useState([]);
  const [scheduleTeams, setScheduleTeams] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    sbGetTeams('football').then(setTeamRows).catch((e) => console.error('load teams failed', e));
    // The team registry (logos/colors) may not have been touched yet even
    // though the schedule already names real teams — offer those too so the
    // dropdown isn't empty until the host visits the logo/color editor.
    sbGetMatches().then((matches) => {
      const names = new Set();
      matches.forEach((m) => { if (m.home_team) names.add(m.home_team); if (m.away_team) names.add(m.away_team); });
      setScheduleTeams([...names]);
    }).catch((e) => console.error('load schedule teams failed', e));
  }, []);
  const teams = useMemo(() => {
    const names = new Set([...teamRows.map((t) => t.team_name), ...scheduleTeams]);
    return [...names].sort((a, b) => a.localeCompare(b, 'ar'));
  }, [teamRows, scheduleTeams]);
  const colorFor = (name) => teamRows.find((t) => t.team_name === name)?.color || '#3C7A4F';

  const addPlayer = async () => {
    const n = name.trim();
    const pr = parseFloat(price);
    if (!n || Number.isNaN(pr)) { showToast('اكتب اسم وسعر صحيح', 'error'); return; }
    const next = [...players, { id: uid(), name: n, price: pr, team_name: teamName || null, color: colorFor(teamName), locked: false }];
    setPlayers(next);
    try { await sbSetPlayers(next); setName(''); setPrice(''); setTeamName(''); }
    catch (e) { console.error('save player failed', e); showToast('مقدرش يحفظ اللاعب: ' + String(e.message || e).slice(0, 100), 'error'); }
  };

  const updatePlayer = async (id, patch) => {
    const next = players.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setPlayers(next);
    try { await sbSetPlayers(next); }
    catch (e) { console.error('save player failed', e); showToast('مقدرش يحفظ: ' + String(e.message || e).slice(0, 100), 'error'); }
  };
  const setPlayerTeam = (id, nextTeamName) => updatePlayer(id, { team_name: nextTeamName || null, color: colorFor(nextTeamName) });

  const toggleLock = async (p) => {
    const next = !p.locked;
    try {
      await sbSetPlayerLocked(p.id, next);
      setPlayers(players.map((x) => (x.id === p.id ? { ...x, locked: next } : x)));
      showToast(next ? `${p.name} اتقفل` : `${p.name} اتفتح`, 'success');
    } catch (e) {
      console.error('toggle player lock failed', e);
      showToast('مقدرتش أغيّر القفل: ' + String(e.message || e).slice(0, 80), 'error');
    }
  };

  const deletePlayer = async (p) => {
    if (!(await openConfirm(`حذف ${p.name}؟`))) return;
    const next = players.filter((x) => x.id !== p.id);
    setPlayers(next);
    try { await sbSetPlayers(next); }
    catch (e) { console.error('delete player failed', e); showToast('مقدرش يحذف: ' + String(e.message || e).slice(0, 100), 'error'); }
  };

  const filtered = players.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div>
      <p className="hint" style={{ margin: '0 0 10px' }}>الفرق ولوجوهاتها وألوانها بتتضاف من تبويب "الدوري والجدول" → الفرق ولوجوهاتها. لون التيشيرت بياخده اللاعب تلقائي من فريقه.</p>
      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 10px' }}>إضافة لاعب</h3>
        <div className="row">
          <div style={{ flex: 2, minWidth: 140 }}><label>الاسم</label><input placeholder="اسم اللاعب" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 90 }}><label>السعر (مليون)</label><input type="number" min="0" step="0.5" placeholder="10" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </div>
        <div style={{ height: 8 }} />
        <label>الفريق</label>
        <select value={teamName} onChange={(e) => setTeamName(e.target.value)}>
          <option value="">بدون فريق</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div style={{ height: 10 }} />
        <button className="btn" onClick={addPlayer}>ضيف اللاعب</button>
      </div>

      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 10px' }}>كل اللاعبين</h3>
        <input placeholder="دوّر باسم لاعب..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="plist" style={{ marginTop: 10 }}>
          {filtered.length === 0 && <p className="hint">لسه معملتش لاعبين</p>}
          {filtered.map((p) => (
            <div className="prow" key={p.id}>
              <div className="info">
                <i style={{ display: 'inline-block', width: 12, height: 12, marginInlineEnd: 6, borderRadius: 3, background: p.color || '#3C7A4F' }} />
                <span>{p.name}</span>
                {p.locked && <span className="incompleteTag" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>مقفول</span>}
              </div>
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <select value={p.team_name || ''} onChange={(e) => setPlayerTeam(p.id, e.target.value)}>
                  <option value="">بدون فريق</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="number" step="0.5" style={{ width: 70, padding: 5 }} value={p.price} onChange={(e) => updatePlayer(p.id, { price: parseFloat(e.target.value) || 0 })} />
                <button className={`btn small ${p.locked ? 'danger' : 'ghost'}`} title="امنع/اسمح بشراء اللاعب ده" onClick={() => toggleLock(p)}>{p.locked ? 'فك القفل' : 'قفل'}</button>
                <button className="btn small danger" onClick={() => deletePlayer(p)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
