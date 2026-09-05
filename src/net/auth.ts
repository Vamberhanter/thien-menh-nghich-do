import { getSupabase } from './supabase';

const EMAIL_KEY = 'tmnd.email';
const ACCOUNT_KEY = 'tmnd.account';

export interface GameUser {
  id: string;
  email: string;
}

let current: GameUser | null = readAccount();
const listeners = new Set<(user: GameUser | null) => void>();

function readAccount(): GameUser | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameUser;
    if (!parsed?.id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setAccount(user: GameUser | null): GameUser | null {
  current = user;
  if (user) {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(user));
    rememberEmail(user.email);
  } else {
    localStorage.removeItem(ACCOUNT_KEY);
  }
  for (const listener of listeners) listener(user);
  return user;
}

export function currentAccessToken(): string | null {
  return null;
}

export function rememberedEmail(): string {
  return localStorage.getItem(EMAIL_KEY) ?? current?.email ?? '';
}

export function rememberEmail(email: string): void {
  const value = normalizeEmail(email);
  if (value) localStorage.setItem(EMAIL_KEY, value);
  else localStorage.removeItem(EMAIL_KEY);
}

/** `pkmax@gmail` is enough — missing `.com` (and common short domains) are filled in. */
export function normalizeEmail(raw: string): string {
  let email = raw.trim().toLowerCase().replace(/\s+/g, '').replace(/＠/g, '@');
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return email;

  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === 'gmail' || domain === 'gmail.') domain = 'gmail.com';
  if (domain === 'yahoo' || domain === 'yahoo.') domain = 'yahoo.com';
  if (domain === 'hotmail' || domain === 'hotmail.') domain = 'hotmail.com';
  if (domain === 'outlook' || domain === 'outlook.') domain = 'outlook.com';
  return `${local}@${domain}`;
}

export function startAuth(): Promise<GameUser | null> {
  current = readAccount();
  return Promise.resolve(current);
}

export async function currentUser(): Promise<GameUser | null> {
  return current ?? readAccount();
}

export function subscribeAuth(onUser: (user: GameUser | null) => void): () => void {
  onUser(current ?? readAccount());
  listeners.add(onUser);
  return () => listeners.delete(onUser);
}

export async function signIn(email: string, password: string): Promise<GameUser> {
  const { data, error } = await getSupabase().rpc('login_account', {
    p_email: normalizeEmail(email),
    p_password: password,
  });
  if (error) throw new Error(authMessage(error.message));
  const user = asUser(data);
  if (!user) throw new Error('Không đăng nhập được');
  return setAccount(user)!;
}

export async function signUp(email: string, password: string): Promise<GameUser> {
  const normalized = normalizeEmail(email);
  const { data, error } = await getSupabase().rpc('register_account', {
    p_email: normalized,
    p_password: password,
  });
  if (error) throw new Error(authMessage(error.message));
  const created = asUser(data);
  if (!created) throw new Error('Không tạo được tài khoản');
  return signIn(normalized, password);
}

export async function signOut(): Promise<void> {
  setAccount(null);
}

function asUser(raw: unknown): GameUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = String(row.id ?? '');
  const email = String(row.email ?? '');
  if (!id || !email) return null;
  return { id, email };
}

export function authMessage(message: string): string {
  if (/invalid login|sai email/i.test(message)) return 'Sai email hoặc mật khẩu';
  if (/already|đã có tài khoản/i.test(message)) return 'Email này đã có tài khoản. Hãy đăng nhập.';
  if (/password|mật khẩu tối thiểu/i.test(message) && /6|least|character/i.test(message)) {
    return 'Mật khẩu tối thiểu 6 ký tự';
  }
  return message;
}
