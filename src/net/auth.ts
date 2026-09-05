import { getSupabase } from './supabase';

const EMAIL_KEY = 'tmnd.email';

export interface GameUser {
  id: string;
  email: string;
}

let current: GameUser | null = null;
let accessToken: string | null = null;
let startup: Promise<void> | null = null;
const listeners = new Set<(user: GameUser | null) => void>();

function setAccount(user: GameUser | null, token: string | null = accessToken): GameUser | null {
  current = user;
  accessToken = user ? token : null;
  if (user) {
    rememberEmail(user.email);
  }
  for (const listener of listeners) listener(user);
  return user;
}

export function currentAccessToken(): string | null {
  return accessToken;
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

export async function startAuth(): Promise<GameUser | null> {
  if (!startup) {
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(asUser(session?.user), session?.access_token ?? null);
    });

    startup = supabase.auth.getSession().then(({ data, error }) => {
      if (error) throw new Error(authMessage(error.message));
      setAccount(asUser(data.session?.user), data.session?.access_token ?? null);
    });
  }
  await startup;
  return current;
}

export async function currentUser(): Promise<GameUser | null> {
  await startAuth();
  return current;
}

export function subscribeAuth(onUser: (user: GameUser | null) => void): () => void {
  onUser(current);
  listeners.add(onUser);
  return () => listeners.delete(onUser);
}

export async function signIn(email: string, password: string): Promise<GameUser> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw new Error(authMessage(error.message));
  const user = asUser(data.user);
  if (!user) throw new Error('Không đăng nhập được');
  return setAccount(user, data.session?.access_token ?? null)!;
}

export async function signUp(email: string, password: string): Promise<GameUser> {
  const normalized = normalizeEmail(email);
  const { data, error } = await getSupabase().auth.signUp({
    email: normalized,
    password,
  });
  if (error) throw new Error(authMessage(error.message));
  const created = asUser(data.user);
  if (!created) throw new Error('Không tạo được tài khoản');
  if (!data.session) {
    throw new Error('Tài khoản đã được tạo. Hãy xác nhận email rồi đăng nhập.');
  }
  return setAccount(created, data.session.access_token)!;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw new Error(authMessage(error.message));
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
  if (/invalid login|invalid credentials|sai email/i.test(message)) return 'Sai email hoặc mật khẩu';
  if (/already|registered|đã có tài khoản/i.test(message)) {
    return 'Email này đã có tài khoản. Hãy đăng nhập.';
  }
  if (/password|mật khẩu tối thiểu/i.test(message) && /6|least|character/i.test(message)) {
    return 'Mật khẩu tối thiểu 6 ký tự';
  }
  if (/email not confirmed/i.test(message)) return 'Hãy xác nhận email trước khi đăng nhập';
  return message;
}
