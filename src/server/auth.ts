import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

export type Role = 'admin' | 'operator';
export interface AuthUser { id: string; email: string; name: string; role: Role; mustChangePassword: boolean }
const COOKIE = 'gbp_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function passwordHash(value: string): string {
  if (value.length < 12 || value.length > 256) throw new Error('Use uma senha entre 12 e 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`;
}
function verify(value: string, stored: string): boolean {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest || value.length > 256) return false;
  const actual = scryptSync(value, salt, 64); const expected = Buffer.from(digest, 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export class AuthStore {
  constructor(readonly db: DatabaseSync, readonly secure = process.env.NODE_ENV === 'production') {
    db.exec(`CREATE TABLE IF NOT EXISTS auth_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password_hash TEXT NOT NULL,must_change INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER NOT NULL,analysis_id TEXT,FOREIGN KEY(user_id) REFERENCES auth_users(id));
    CREATE TABLE IF NOT EXISTS auth_login_attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_events(id TEXT PRIMARY KEY,user_id TEXT,analysis_id TEXT,action TEXT NOT NULL,created_at TEXT NOT NULL);`);
  }
  provision(input: { email: string; name: string; role: Role; password?: string; active?: boolean }): void {
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || !input.name.trim() || !['admin', 'operator'].includes(input.role)) throw new Error('Dados de usuário inválidos.');
    const existing = this.db.prepare('SELECT id FROM auth_users WHERE email=?').get(email) as {id:string}|undefined;
    if (!existing && !input.password) throw new Error('Senha inicial obrigatória.');
    const id = existing?.id ?? randomUUID();
    const encodedPassword = input.password ? passwordHash(input.password) : undefined;
    if (existing) {
      this.db.prepare('UPDATE auth_users SET name=?,role=?,active=? WHERE id=?').run(input.name.trim(),input.role,input.active === false ? 0 : 1,id);
      if (input.password) this.db.prepare('UPDATE auth_users SET password_hash=?,must_change=1 WHERE id=?').run(encodedPassword!,id);
      this.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id);
    } else this.db.prepare('INSERT INTO auth_users(id,email,name,role,password_hash,active) VALUES(?,?,?,?,?,?)').run(id,email,input.name.trim(),input.role,encodedPassword!,input.active===false?0:1);
  }
  user(c: Context): AuthUser | null {
    const token = getCookie(c, COOKIE); if (!token) return null;
    const row = this.db.prepare('SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND s.analysis_id IS NULL').get(hash(token),Date.now()) as Record<string,unknown>|undefined;
    return row ? {id:String(row.id),email:String(row.email),name:String(row.name),role:row.role as Role,mustChangePassword:Boolean(row.must_change)} : null;
  }
  isRenderer(c: Context): boolean {
    if (c.req.method !== 'GET') return false;
    const token=getCookie(c, COOKIE); if (!token) return false;
    const row=this.db.prepare('SELECT analysis_id FROM auth_sessions WHERE token_hash=? AND expires_at>? AND user_id IS NULL').get(hash(token),Date.now()) as {analysis_id:string}|undefined;
    if (!row) return false;
    return c.req.path===`/api/analyses/${row.analysis_id}` || c.req.path===`/api/analyses/${row.analysis_id}/presentation` || c.req.path==='/api/auth/me' || c.req.path===`/presentation/${row.analysis_id}`;
  }
  renderer(analysisId:string): {token:string; revoke:()=>void} {
    const token=randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO auth_sessions(token_hash,expires_at,analysis_id) VALUES(?,?,?)').run(hash(token),Date.now()+120_000,analysisId);
    return {token,revoke:()=>{this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(token));}};
  }
  login(c: Context,email:string,password:string): AuthUser|null {
    const key=hash(email.trim().toLowerCase()); const now=Date.now();
    this.db.prepare('DELETE FROM auth_login_attempts WHERE expires_at<?').run(now);
    const attempt=this.db.prepare('SELECT count FROM auth_login_attempts WHERE key=?').get(key) as {count:number}|undefined;
    if ((attempt?.count??0)>=5) throw new Error('Muitas tentativas. Aguarde 15 minutos.');
    this.db.prepare('INSERT INTO auth_login_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+900_000);
    const row=this.db.prepare('SELECT * FROM auth_users WHERE email=? AND active=1').get(email.trim().toLowerCase()) as Record<string,unknown>|undefined;
    // Perform scrypt even for unknown users.
    const valid=verify(password,String(row?.password_hash??'00000000000000000000000000000000:'+ '00'.repeat(64)));
    if (!row || !valid) return null;
    this.db.prepare('DELETE FROM auth_login_attempts WHERE key=?').run(key);
    const token=randomBytes(32).toString('hex');
    this.db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').run(now);
    this.db.prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(hash(token),String(row.id),now+7*86400_000);
    setCookie(c,COOKIE,token,{httpOnly:true,secure:this.secure,sameSite:'Lax',path:'/',maxAge:7*86400});
    return this.user(c) ?? {id:String(row.id),email:String(row.email),name:String(row.name),role:row.role as Role,mustChangePassword:Boolean(row.must_change)};
  }
  logout(c: Context): void { const token=getCookie(c,COOKIE); if(token)this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash(token)); deleteCookie(c,COOKIE,{path:'/',secure:this.secure}); }
  changePassword(c: Context,current:string,next:string): void {
    const user=this.user(c); if(!user)throw new Error('Sessão inválida.');
    const row=this.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(user.id) as {password_hash:string};
    if(!verify(current,row.password_hash))throw new Error('Senha atual incorreta.');
    if(current===next)throw new Error('Escolha uma senha diferente da inicial.');
    this.db.prepare('UPDATE auth_users SET password_hash=?,must_change=0 WHERE id=?').run(passwordHash(next),user.id);
    const token=getCookie(c,COOKIE)!;
    this.db.prepare('DELETE FROM auth_sessions WHERE user_id=? AND token_hash<>?').run(user.id,hash(token));
  }
  record(c:Context,analysisId:string,action:string):void { this.db.prepare('INSERT INTO auth_events VALUES(?,?,?,?,?)').run(randomUUID(),this.user(c)?.id??null,analysisId,action,new Date().toISOString()); }
}
