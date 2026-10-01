import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useUI } from '../../context/UIContext';
import { sbResetUserPassword, sbResetAllPasswords, sbGetHostAccounts, sbSetHostAccount, sbRemoveHostAccount } from '../../lib/db';
import { hashPassword } from '../../lib/scoring';

const NEW_HOST_VALUE = '__new_host__';

export default function AccountsTab() {
  const { users, user: myUsername } = useApp();
  const { showToast, openModal, openConfirm } = useUI();
  const [search, setSearch] = useState('');
  const [hostRows, setHostRows] = useState([]); // [{ member_username, host_username }]
  const [busyHost, setBusyHost] = useState(null);

  const loadHostRows = useCallback(async () => {
    try { setHostRows(await sbGetHostAccounts()); }
    catch (e) { console.error('load host accounts failed', e); showToast('مقدرش يجيب صلاحيات الهوست: ' + String(e.message || e).slice(0, 80), 'error'); }
  }, [showToast]);
  useEffect(() => { loadHostRows(); }, [loadHostRows]);

  // member_username -> host_username it's linked under (or undefined if none).
  const hostOfMap = useMemo(() => new Map(hostRows.map((r) => [r.member_username, r.host_username])), [hostRows]);
  // host_username -> every member linked under it (a host is always its own first member).
  const hostGroups = useMemo(() => {
    const map = new Map();
    hostRows.forEach((r) => { if (!map.has(r.host_username)) map.set(r.host_username, []); map.get(r.host_username).push(r.member_username); });
    return map;
  }, [hostRows]);
  const distinctHosts = useMemo(() => [...hostGroups.keys()].sort((a, b) => a.localeCompare(b)), [hostGroups]);

  const linkHost = async (member, host) => {
    setBusyHost(member);
    try {
      await sbSetHostAccount(member, host);
      showToast(host === member ? `${member} بقى Host` : `${member} اتربط بـ ${host}`, 'success');
      await loadHostRows();
    } catch (e) {
      console.error('link host failed', e);
      showToast('مقدرش يربط: ' + String(e.message || e).slice(0, 80), 'error');
    } finally { setBusyHost(null); }
  };

  const removeHost = async (member) => {
    const isSelfHost = hostOfMap.get(member) === member;
    const otherMembers = isSelfHost ? (hostGroups.get(member) || []).filter((m) => m !== member) : [];
    const warn = otherMembers.length
      ? ` تحذير: ${otherMembers.length} حساب لسه مربوط بـ "${member}" كـ Host (${otherMembers.join('، ')}) — ده مش هيتأثر ولا هيتشال، بس "${member}" نفسه مش هيبقى عنده صلاحية Host تاني.`
      : '';
    if (!(await openConfirm(`تشيل صلاحية الهوست من "${member}"؟${warn}`))) return;
    setBusyHost(member);
    try {
      await sbRemoveHostAccount(member);
      showToast(`اتشالت صلاحية الهوست من ${member}`, 'success');
      await loadHostRows();
    } catch (e) {
      console.error('remove host failed', e);
      showToast('مقدرش يشيل: ' + String(e.message || e).slice(0, 80), 'error');
    } finally { setBusyHost(null); }
  };

  const resetOne = async (u) => {
    const pass = await openModal({ title: `باسورد جديد لـ ${u}`, placeholder: 'اكتب الباسورد الجديد', type: 'password' });
    if (pass === null || pass.trim() === '') return;
    if (pass.length < 4) { showToast('اكتب باسورد 4 حروف/أرقام على الأقل', 'error'); return; }
    try {
      const hash = await hashPassword(pass);
      await sbResetUserPassword(u, hash);
      showToast(`باسورد ${u} اتغيّر`, 'success');
    } catch (e) {
      console.error('reset user password failed', e);
      showToast('مقدرتش أغيّر الباسورد: ' + String(e.message || e).slice(0, 80), 'error');
    }
  };

  const resetAll = async () => {
    const pass = await openModal({ title: 'الباسورد الجديد لكل الحسابات', placeholder: 'اكتب باسورد جديد', type: 'password' });
    if (pass === null || pass.trim() === '') return;
    if (pass.length < 4) { showToast('اكتب باسورد 4 حروف/أرقام على الأقل', 'error'); return; }
    if (!(await openConfirm(`هيتغيّر باسورد كل اللاعبين لـ "${pass}". لازم تبعتلهم الباسورد الجديد بنفسك. متأكد؟`))) return;
    try {
      const hash = await hashPassword(pass);
      await sbResetAllPasswords(hash);
      showToast('باسورد كل الحسابات اتغيّر', 'success');
    } catch (e) {
      console.error('reset all passwords failed', e);
      showToast('مقدرتش أغيّر الباسوردات: ' + String(e.message || e).slice(0, 80), 'error');
    }
  };

  const filtered = users.filter((u) => u.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 4px' }}>صلاحية الهوست</h3>
        <p className="hint">
          اربط أي حساب بـ Host عشان يقدر يفتح لوحة الهوست. حساب واحد ممكن يبقى Host، وحسابات كتير ممكن تتربط بنفس الـ Host.
          الشخص اللي بيدخل بحساب متربط، شايف تبويب "Host" في القايمة تلقائي — مفيش باسورد مشترك تاني.
        </p>
        <input placeholder="دوّر باسم يوزر..." style={{ marginTop: 10 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="plist" style={{ marginTop: 10 }}>
          {filtered.length === 0 && <p className="hint">مفيش حسابات مطابقة</p>}
          {filtered.map((u) => {
            const hostOf = hostOfMap.get(u);
            const isSelfHost = hostOf === u;
            return (
              <div className="prow" key={u}>
                <div className="info">
                  <span>{u}{u === myUsername && <small style={{ marginRight: 6 }}>(انت)</small>}</span>
                  {isSelfHost && <span className="incompleteTag" style={{ color: 'var(--gold)', borderColor: 'var(--gold)' }}>Host</span>}
                  {hostOf && !isSelfHost && <span className="incompleteTag">عضو عند {hostOf}</span>}
                </div>
                <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {hostOf ? (
                    <button className="btn small danger" disabled={busyHost === u} onClick={() => removeHost(u)}>شيل صلاحية الهوست</button>
                  ) : (
                    <select
                      value=""
                      disabled={busyHost === u}
                      onChange={(e) => { const value = e.target.value; if (value) linkHost(u, value === NEW_HOST_VALUE ? u : value); e.target.value = ''; }}
                    >
                      <option value="" disabled>اربطه بـ Host...</option>
                      <option value={NEW_HOST_VALUE}>Host جديد ({u} نفسه)</option>
                      {distinctHosts.filter((h) => h !== u).map((h) => <option key={h} value={h}>عضو عند {h}</option>)}
                    </select>
                  )}
                </div>
                <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <button className="btn small ghost" onClick={() => resetOne(u)}>باسورد جديد</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {distinctHosts.length > 0 && (
        <div className="card">
          <h3 className="disp" style={{ margin: '0 0 4px' }}>كل الـ Hosts الحاليين</h3>
          <p className="hint">كل الحسابات المربوطة بكل Host.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
            {distinctHosts.map((h) => (
              <div key={h} className="prow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <strong>{h}</strong>
                <span className="hint">{(hostGroups.get(h) || []).join('، ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 4px' }}>إدارة الباسوردات</h3>
        <p className="hint">اختار مين تحطله باسورد جديد. الاسم والتشكيلة والنقط بتاعته مش هيتأثروا.</p>
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
          <button className="btn ghost small" onClick={resetAll}>حط نفس الباسورد لكل الحسابات دفعة واحدة</button>
        </div>
      </div>
    </>
  );
}
