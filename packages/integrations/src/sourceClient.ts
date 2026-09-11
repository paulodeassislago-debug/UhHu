// packages/integrations — SourceClient compartilhado (fronteira integrations→BDTD/CAPES).
//
// UMA instancia por fonte, construida pelo registry. Concentra cortesia e
// resiliencia para que adapters nunca reimplementem fetch externo:
// - allowlist de 2 hosts (SSRF, T-03-02-01); TLS default do Node, sem overrides;
// - jar em memoria por fonte + renovacao adaptativa em challenge (OasisbrVerify);
// - mutex por fonte (anti thundering-herd) + rate limit batch<=10 + wait 2s;
// - timeout 15s por request combinado ao signal do chamador via AbortSignal.any;
// - circuit breaker: 5 falhas consecutivas abrem 60s de fail-fast (T-03-02-03);
// - UA identificado UhHu-Lab/0.1.0-fase3;
// - NUNCA loga jar/corpo: o resultado carrega durationMs para logs seguros
//   (o chamador loga so {source, status, durationMs} — T-03-02-02).
// Respostas externas sao hostis: HTML challenge, JSON malformado, TLS quebrado.

import type { SourceName } from './types.js';

/** User-Agent identificado exigido pela politica de cortesia (dev-docs/04). */
export const UH_HU_UA = 'UhHu-Lab/0.1.0-fase3';

/** Hosts externos autorizados — qualquer outro host e bloqueado (SSRF). */
const ALLOWED_HOSTS: readonly string[] = ['bdtd.ibict.br', 'catalogodeteses.capes.gov.br'];

/** Timeout por request (ms); combina com o signal do chamador. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Cortesia BDTD/CAPES: no maximo 10 requests por batch, 2s entre batches. */
const BATCH_LIMIT = 10;
const BATCH_WAIT_MS = 2_000;

/** Breaker: falhas consecutivas que abrem o circuito + cooldown fail-fast. */
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

/** Marcador do challenge anti-bot da BDTD (HTML em vez do JSON esperado). */
const CHALLENGE_MARKER = 'OasisbrVerify';

/** URL fora da allowlist (SSRF): nunca chega ao fetch. */
export class SourceHostBlockedError extends Error {
  readonly host: string;

  constructor(host: string) {
    super(`Host externo bloqueado pela allowlist: ${host}.`);
    this.name = 'SourceHostBlockedError';
    this.host = host;
  }
}

/** Circuito aberto apos falhas consecutivas: fail-fast ate o cooldown passar. */
export class SourceCircuitOpenError extends Error {
  readonly source: SourceName;

  constructor(source: SourceName) {
    super(`Fonte ${source} em cooldown (circuit breaker aberto).`);
    this.name = 'SourceCircuitOpenError';
    this.source = source;
  }
}

export interface SourceFetchInit {
  signal: AbortSignal;
  fetchFn?: typeof fetch;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  /** 'json' declara que HTML na resposta e challenge, nao conteudo. */
  accept?: 'json' | 'text';
}

export interface SourceFetchResult {
  challenged: boolean;
  status: number;
  body: string;
  contentType: string;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hostOf(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Extrai o par `name=value` de um header set-cookie (sem atributos). */
function cookiePair(setCookieValue: string): string | null {
  const semi = setCookieValue.indexOf(';');
  const pair = (semi === -1 ? setCookieValue : setCookieValue.slice(0, semi)).trim();
  const eq = pair.indexOf('=');
  if (eq <= 0) {
    return null;
  }
  return pair;
}

function isChallenge(contentType: string, body: string, accept: 'json' | 'text'): boolean {
  if (body.includes(CHALLENGE_MARKER)) {
    return true;
  }
  if (accept === 'json' && contentType.includes('text/html')) {
    return true;
  }
  return false;
}

export class SourceClient {
  readonly source: SourceName;

  private jar: string[] = [];
  private tail: Promise<void> = Promise.resolve();
  private batchCount = 0;
  private consecutiveFailures = 0;
  private breakerOpenUntil = 0;

  constructor(source: SourceName) {
    this.source = source;
  }

  /** Pares no jar (contagem p/ testes; o conteudo nunca e exposto). */
  get jarSize(): number {
    return this.jar.length;
  }

  async fetchText(url: string, init: SourceFetchInit): Promise<SourceFetchResult> {
    const host = hostOf(url);
    if (host === null || !ALLOWED_HOSTS.includes(host)) {
      throw new SourceHostBlockedError(host ?? url);
    }
    if (Date.now() < this.breakerOpenUntil) {
      throw new SourceCircuitOpenError(this.source);
    }
    return this.withMutex(async () => {
      await this.applyRateLimit();
      return this.doFetch(url, init);
    });
  }

  /** Serializa concorrentes por fonte: um fetch por vez (anti thundering-herd). */
  private async withMutex<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tail = current;
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  /** Batch<=10 + wait 2s entre batches (contador por fonte). */
  private async applyRateLimit(): Promise<void> {
    if (this.batchCount >= BATCH_LIMIT) {
      await sleep(BATCH_WAIT_MS);
      this.batchCount = 0;
    }
    this.batchCount += 1;
  }

  private async doFetch(url: string, init: SourceFetchInit): Promise<SourceFetchResult> {
    const startedAt = Date.now();
    const fetchFn: typeof fetch = init.fetchFn ?? globalThis.fetch;
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([init.signal, timeoutSignal]);
    const headers: Record<string, string> = {
      'User-Agent': UH_HU_UA,
      ...init.headers,
    };
    if (this.jar.length > 0) {
      headers['Cookie'] = this.jar.join('; ');
    }
    let res: Response;
    try {
      const requestInit: RequestInit = {
        method: init.method ?? 'GET',
        headers,
        signal,
      };
      if (init.body !== undefined) {
        requestInit.body = init.body;
      }
      res = await fetchFn(url, requestInit);
    } catch (err) {
      this.noteFailure();
      throw err;
    }
    this.storeCookies(res);
    const contentType = res.headers.get('content-type') ?? '';
    const body = await res.text();
    const durationMs = Date.now() - startedAt;
    if (!res.ok) {
      this.noteFailure();
      return { challenged: false, status: res.status, body, contentType, durationMs };
    }
    if (isChallenge(contentType, body, init.accept ?? 'text')) {
      // Renovacao adaptativa: descarta o jar; o chamador faz 1 retry com jar novo.
      this.jar = [];
      this.noteFailure();
      return { challenged: true, status: res.status, body, contentType, durationMs };
    }
    this.noteSuccess();
    return { challenged: false, status: res.status, body, contentType, durationMs };
  }

  /** Mescla set-cookie no jar (substitui por nome; guarda so name=value). */
  private storeCookies(res: Response): void {
    for (const value of res.headers.getSetCookie()) {
      const pair = cookiePair(value);
      if (pair === null) {
        continue;
      }
      const name = pair.slice(0, pair.indexOf('='));
      this.jar = this.jar.filter((existing) => !existing.startsWith(`${name}=`));
      this.jar.push(pair);
    }
  }

  private noteSuccess(): void {
    this.consecutiveFailures = 0;
  }

  private noteFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
      this.breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.consecutiveFailures = 0;
    }
  }
}
