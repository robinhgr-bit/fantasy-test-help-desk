import { useApp } from '../context/AppContext';
import { useUI } from '../context/UIContext';
import { InstallAppButton } from '../components/InstallPWA';
import { useNotifications } from '../hooks/useNotifications';
import { Icon } from '../components/Brand';

export default function SettingsPage() {
  const { user, isHost, logout, refresh } = useApp();
  const { showToast } = useUI();
  const { permission, busy, enable } = useNotifications(user);

  const handleRefresh = async () => {
    showToast('بيتحدث...');
    await refresh();
    showToast('اتحدث', 'success');
  };

  const handleNotifications = async () => {
    const result = await enable();
    if (result.ok) showToast('اتفعّلت الإشعارات', 'success');
    else if (permission === 'denied') showToast('لازم تسمح بالإشعارات من إعدادات المتصفح', 'error');
  };

  return (
    <div>
      <div className="card">
        <h3 className="disp" style={{ margin: '0 0 4px' }}>الإعدادات</h3>
        <p className="hint">مسجّل دخول بـ <b>{user}</b></p>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b>تحديث البيانات</b>
            <p className="hint" style={{ margin: '2px 0 0' }}>يجيب آخر تحديث من الداتابيز</p>
          </div>
          <button className="btn ghost small" onClick={handleRefresh}><Icon name="refresh" style={{ width: 16, height: 16 }} /></button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b>إشعارات الموبايل</b>
            <p className="hint" style={{ margin: '2px 0 0' }}>
              {permission === 'granted' ? 'مفعّلة ✅' : 'اعرف فورًا أول ما يتضاف إعلان جديد'}
            </p>
          </div>
          {permission !== 'granted' && (
            <button className="btn small" onClick={handleNotifications} disabled={busy}>{busy ? '...' : 'فعّل'}</button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <b>تثبيت التطبيق</b>
            <p className="hint" style={{ margin: '2px 0 0' }}>يفتح من الشاشة الرئيسية زي أي أبليكيشن</p>
          </div>
          <InstallAppButton />
        </div>
      </div>

      {/* No "Enter as Host" button here anymore — Host access is granted per
          account from the Host Dashboard's "صلاحية الهوست" panel, not by
          typing a shared password. A linked account simply sees the "Host"
          tab in the main navigation automatically. */}
      {isHost && (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>الحساب ده ليه صلاحية Host — تقدر تدير من تبويب "Host" تحت.</p>
        </div>
      )}

      <div className="card">
        <button className="btn danger" style={{ width: '100%' }} onClick={logout}>تسجيل خروج</button>
      </div>
    </div>
  );
}
