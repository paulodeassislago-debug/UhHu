// apps/cli — guarda local da credencial PAT (D-62).
//
// Arquivo `$HOME/.config/uhhu/credentials.json` `{ baseUrl, token }` criado
// com mode 0o600 (write + chmod explicito + re-stat; se a umask impedir, o
// chmod corrige e o stat confirma — senao lanca). Env `UHHU_TOKEN` PRECEDE o
// arquivo; `--logout` apaga o arquivo (missing = ok, exit 0). O PAT nunca e
// impresso em stdout/log — so `Salvo em <path>` sem o token.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';

export const DEFAULT_API_URL = 'http://127.0.0.1:3000';

// Erro local de credencial (sem token, sem requestId): o roteador traduz em
// exit 3 (mesma familia do 401/403) com mensagem PT-BR no stderr.
export class CliAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliAuthError';
  }
}

export interface LoadedCredentials {
  baseUrl: string;
  token: string;
  from: 'env' | 'file';
}

export function credentialsDir(): string {
  return join(homedir(), '.config', 'uhhu');
}

export function credentialsPath(): string {
  return join(credentialsDir(), 'credentials.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Le so o `baseUrl` salvo (best-effort, sem token): usado na precedencia
// `UHHU_API_URL` > `--api` > base salva > default quando o token vem do env
// (H-02). Nunca lanca: arquivo ausente/corrompido = undefined (cai no default).
async function readStoredBaseUrl(): Promise<string | undefined> {
  try {
    const raw = await readFile(credentialsPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }
    const stored: unknown = parsed['baseUrl'];
    // M-02: trim por paridade com o MCP (env com newline/espaco).
    return typeof stored === 'string' && stored.trim().length > 0 ? stored.trim() : undefined;
  } catch {
    return undefined;
  }
}

// Salva `{ baseUrl, token }` com mode 0o600 verificado por stat. Retorna o
// path (o chamador imprime `Salvo em <path>` — nunca o token).
export async function saveToken(baseUrl: string, token: string): Promise<string> {
  const dir = credentialsDir();
  const file = credentialsPath();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
  await writeFile(file, JSON.stringify({ baseUrl, token }), { mode: 0o600, flag: 'w' });
  await chmod(file, 0o600);
  const st = await stat(file);
  if ((st.mode & 0o777) !== 0o600) {
    throw new CliAuthError(`Falha ao proteger ${file} com modo 600.`);
  }
  return file;
}

// Token: `UHHU_TOKEN` precede o arquivo. BaseUrl: `UHHU_API_URL` > `--api`
// (explicito do caller) > baseUrl salva no arquivo > default localhost:3000.
// Env com newline/espaco (ex.: `export UHHU_TOKEN=$(cat file)`) e aparado por
// paridade com o MCP (M-02) — sem trim o Bearer ia com whitespace e o servidor
// rejeitava com 401 confuso.
export async function loadToken(explicitBaseUrl?: string): Promise<LoadedCredentials> {
  const envTokenRaw = process.env['UHHU_TOKEN'];
  const envApiRaw = process.env['UHHU_API_URL'];
  const trimmedEnv =
    typeof envTokenRaw === 'string' && envTokenRaw.trim().length > 0
      ? envTokenRaw.trim()
      : undefined;
  const trimmedEnvApi =
    typeof envApiRaw === 'string' && envApiRaw.trim().length > 0 ? envApiRaw.trim() : undefined;
  const trimmedExplicit =
    typeof explicitBaseUrl === 'string' && explicitBaseUrl.trim().length > 0
      ? explicitBaseUrl.trim()
      : undefined;
  if (trimmedEnv !== undefined) {
    // H-02: mesmo com token do env, a base salva participa da precedencia
    // (envApi > explicito > salva > default) — antes caia direto no default
    // e falava com o servidor errado.
    const stored = await readStoredBaseUrl();
    const baseUrl = trimmedEnvApi ?? trimmedExplicit ?? stored ?? DEFAULT_API_URL;
    return { baseUrl, token: trimmedEnv, from: 'env' };
  }
  const file = credentialsPath();
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (err) {
    if (isRecord(err) && (err['code'] === 'ENOENT' || err['code'] === 'ENOTDIR')) {
      throw new CliAuthError(
        'Nenhuma credencial encontrada. Execute `uhhu auth login` ou defina UHHU_TOKEN.',
      );
    }
    throw err;
  }
  // M-01: 0600 verificado tambem na leitura — arquivo afrouxado depois da
  // escrita (chmod 644, backup/restore, copia, umask) falha alto em vez de
  // usar o PAT silenciosamente (paridade com o stat do saveToken).
  const st = await stat(file);
  if ((st.mode & 0o777) !== 0o600) {
    throw new CliAuthError(`Credencial local com permissão insegura em ${file} (esperado 600).`);
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new CliAuthError(
      `Credencial local inválida em ${file}. Execute \`uhhu auth login\` novamente.`,
    );
  }
  if (!isRecord(parsed)) {
    throw new CliAuthError(
      `Credencial local inválida em ${file}. Execute \`uhhu auth login\` novamente.`,
    );
  }
  const storedBaseUrl: unknown = parsed['baseUrl'];
  const storedToken: unknown = parsed['token'];
  if (typeof storedToken !== 'string' || storedToken.length === 0) {
    throw new CliAuthError(
      `Credencial local inválida em ${file}. Execute \`uhhu auth login\` novamente.`,
    );
  }
  const fileBaseUrl =
    typeof storedBaseUrl === 'string' && storedBaseUrl.trim().length > 0
      ? storedBaseUrl.trim()
      : DEFAULT_API_URL;
  const baseUrl = trimmedEnvApi ?? trimmedExplicit ?? fileBaseUrl;
  return { baseUrl, token: storedToken, from: 'file' };
}

// Apaga a credencial local. Arquivo ausente = ok (exit 0, sem erro).
export async function clearToken(): Promise<void> {
  const file = credentialsPath();
  try {
    await unlink(file);
  } catch (err) {
    if (isRecord(err) && (err['code'] === 'ENOENT' || err['code'] === 'ENOTDIR')) {
      return;
    }
    throw err;
  }
}
