import { useState, type FormEvent } from 'react';
import { OrnateButton } from './parts';

export type AuthMode = 'login' | 'register';

export function AuthGate({
  mode,
  onMode,
  email,
  onEmail,
  onEmailBlur,
  password,
  onPassword,
  onSubmit,
  busy,
  error,
}: {
  mode: AuthMode;
  onMode: (mode: AuthMode) => void;
  email: string;
  onEmail: (email: string) => void;
  onEmailBlur: () => void;
  password: string;
  onPassword: (password: string) => void;
  onSubmit: (event: FormEvent) => void;
  busy: boolean;
  error: string | null;
}) {
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const registering = mode === 'register';

  const switchMode = (next: AuthMode) => {
    onMode(next);
    setConfirm('');
    setLocalError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (registering) {
      if (password.length < 6) {
        setLocalError('Mật khẩu tối thiểu 6 ký tự.');
        return;
      }
      if (password !== confirm) {
        setLocalError('Hai mật khẩu không khớp.');
        return;
      }
    }
    onSubmit(event);
  };

  return (
    <div className="rod rod--gate">
      <div className="rod-auth">
        <aside className="rod-auth__hero" aria-hidden="true">
          <div className="rod-auth__hero-art" />
          <div className="rod-auth__hero-copy">
            <div className="rod-auth__crest" />
            <h1>Thiên Mệnh Nghịch Đồ</h1>
            <p>Cõi U Minh</p>
            <ul>
              <li>Chọn phòng</li>
              <li>Chọn nhân vật</li>
              <li>Vào trận</li>
            </ul>
          </div>
        </aside>

        <form className="rod-auth__panel rod-frame" onSubmit={handleSubmit}>
          <div className="rod-auth__tabs">
            <button
              type="button"
              className={`rod-auth__tab${mode === 'login' ? ' is-on' : ''}`}
              onClick={() => switchMode('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              className={`rod-auth__tab${mode === 'register' ? ' is-on' : ''}`}
              onClick={() => switchMode('register')}
            >
              Đăng ký
            </button>
          </div>

          <p className="rod-auth__hint">
            {registering
              ? 'Tạo tài khoản mới để lưu nhân vật và vào phòng cùng người khác.'
              : 'Nhập email và mật khẩu để vào sảnh chọn phòng.'}
          </p>

          <label className="rod-field">
            <span className="rod-label">Email</span>
            <input
              className="rod-input"
              type="text"
              inputMode="email"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
              onBlur={onEmailBlur}
              placeholder="vd: ban@gmail.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="rod-field">
            <span className="rod-label">Mật khẩu</span>
            <input
              className="rod-input"
              type="password"
              value={password}
              onChange={(event) => onPassword(event.target.value)}
              placeholder={registering ? 'Ít nhất 6 ký tự' : 'Mật khẩu của bạn'}
              autoComplete={registering ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>

          {registering ? (
            <label className="rod-field">
              <span className="rod-label">Nhập lại mật khẩu</span>
              <input
                className="rod-input"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Gõ lại mật khẩu"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
          ) : null}

          {localError || error ? <div className="rod-error">{localError || error}</div> : null}

          <OrnateButton type="submit" size="lg" disabled={busy}>
            {busy ? 'Đang xử lý…' : registering ? 'Tạo tài khoản' : 'Đăng nhập'}
          </OrnateButton>

          <p className="rod-auth__switch">
            {registering ? (
              <>
                Đã có tài khoản?{' '}
                <button type="button" className="rod-link" onClick={() => switchMode('login')}>
                  Đăng nhập
                </button>
              </>
            ) : (
              <>
                Chưa có tài khoản?{' '}
                <button type="button" className="rod-link" onClick={() => switchMode('register')}>
                  Đăng ký ngay
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
