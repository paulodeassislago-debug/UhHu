// tests/smoke — guard anti-PG D-55 + unit do execute() (Phase 5, D-54/D-55).
//
// Quebra estrutural alem da demonstracao por execucao (D-55): se apps/cli ou
// apps/mcp importarem @uhhu/db, drizzle-orm, SQL direto ou driver PG, este
// teste falha fail-closed no CI. Roda no projeto smoke (sem PG).
// O execute() e testado com handlers falsos e ActorContext pat explicito
// (T-05-01-SPOOF: tipo fechado session|pat, derivado server-side no 05-02).
//
// Import relativo documentado (fallback do plano): @uhhu/core ainda nao esta
// linkado na raiz, entao o relativo ../../packages/core/src/*.js e usado.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { capabilityNameSchema, CAPABILITY_VERSION as CONTRACTS_VERSION } from '@uhhu/contracts';
import type { CapabilityName } from '@uhhu/contracts';
import type { ActorContext } from '../../packages/core/src/actor.js';
import {
  CAPABILITY_VERSION as CORE_VERSION,
  createExecutor,
  UnknownCapabilityError,
  type CapabilityHandler,
} from '../../packages/core/src/capabilities.js';

const ROOT = process.cwd();
const FORBIDDEN_DEPS = ['@uhhu/db', 'drizzle-orm', 'postgres', 'pg'] as const;
const FORBIDDEN_IMPORTS = ['@uhhu/db', 'drizzle-orm'] as const;
const CREATE_TABLE_PATTERN = /CREATE\s+TABLE/i;
const SELECT_FROM_PATTERN = /\bSELECT\b.+?\bFROM\b/is;

function readPackageDeps(dir: string): string[] {
  const pkgPath = join(ROOT, dir, 'package.json');
  if (!existsSync(pkgPath)) {
    return [];
  }
  const parsed: unknown = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  const names: string[] = [];
  for (const field of ['dependencies', 'devDependencies']) {
    const deps: unknown = record[field];
    if (typeof deps !== 'object' || deps === null) {
      continue;
    }
    for (const name of Object.keys(deps as Record<string, unknown>)) {
      names.push(name);
    }
  }
  return names;
}

function listTsFiles(dir: string): string[] {
  const found: string[] = [];
  if (!existsSync(dir)) {
    return found;
  }
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

function buildHandlers(
  overrides: Partial<Record<CapabilityName, CapabilityHandler>>,
): Record<CapabilityName, CapabilityHandler> {
  const handlers = {} as Record<CapabilityName, CapabilityHandler>;
  for (const name of capabilityNameSchema.options) {
    const override: CapabilityHandler | undefined = overrides[name];
    handlers[name] = override ?? (async (): Promise<unknown> => ({ naoImplementado: name }));
  }
  return handlers;
}

const PAT_ACTOR: ActorContext = {
  userId: 'u1',
  role: 'member',
  requestId: 'r1',
  authMethod: 'pat',
};

describe('D-55 guard anti-PG', () => {
  it('apps/cli sem dependencia de banco no package.json (fronteira ainda reservada)', () => {
    const deps = readPackageDeps('apps/cli');
    for (const forbidden of FORBIDDEN_DEPS) {
      expect(deps, `apps/cli depende de ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('apps/mcp sem dependencia de banco no package.json (fronteira ainda reservada)', () => {
    const deps = readPackageDeps('apps/mcp');
    for (const forbidden of FORBIDDEN_DEPS) {
      expect(deps, `apps/mcp depende de ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('apps/cli/src sem import SQL direto (fronteira ainda reservada)', () => {
    const files = listTsFiles(join(ROOT, 'apps/cli/src'));
    for (const file of files) {
      const body: string = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(body, `${file} importa ${forbidden}`).not.toContain(forbidden);
      }
      expect(body, `${file} contem CREATE TABLE`).not.toMatch(CREATE_TABLE_PATTERN);
      expect(body, `${file} contem SELECT..FROM`).not.toMatch(SELECT_FROM_PATTERN);
    }
  });

  it('apps/mcp/src sem import SQL direto (fronteira ainda reservada)', () => {
    const files = listTsFiles(join(ROOT, 'apps/mcp/src'));
    for (const file of files) {
      const body: string = readFileSync(file, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORTS) {
        expect(body, `${file} importa ${forbidden}`).not.toContain(forbidden);
      }
      expect(body, `${file} contem CREATE TABLE`).not.toMatch(CREATE_TABLE_PATTERN);
      expect(body, `${file} contem SELECT..FROM`).not.toMatch(SELECT_FROM_PATTERN);
    }
  });
});

describe('execute()', () => {
  it('despacha capability registrada para o handler com ActorContext', async () => {
    const echo: CapabilityHandler = async (input: unknown, actor: ActorContext) => ({
      echo: input,
      user: actor.userId,
    });
    const execute = createExecutor(buildHandlers({ 'platform.project.list': echo }));
    const out: unknown = await execute('platform.project.list', { title: 'prova' }, PAT_ACTOR);
    expect(out).toEqual({ echo: { title: 'prova' }, user: 'u1' });
  });

  it('rejeita nome desconhecido com UnknownCapabilityError tipado', async () => {
    const execute = createExecutor(buildHandlers({}));
    const err: unknown = await execute('cap.inexistente', {}, PAT_ACTOR).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(UnknownCapabilityError);
    if (err instanceof UnknownCapabilityError) {
      expect(err.name).toBe('UnknownCapabilityError');
      expect(err.capability).toBe('cap.inexistente');
      expect(err.message).toContain('cap.inexistente');
    } else {
      throw new Error('erro fora do tipo esperado para capability desconhecida');
    }
  });

  it('rejeita string vazia com UnknownCapabilityError', async () => {
    const execute = createExecutor(buildHandlers({}));
    await expect(execute('', {}, PAT_ACTOR)).rejects.toBeInstanceOf(UnknownCapabilityError);
  });

  it('propaga erro do handler sem embrulhar em UnknownCapabilityError', async () => {
    const failing: CapabilityHandler = async () => {
      throw new Error('falha interna do handler');
    };
    const execute = createExecutor(buildHandlers({ 'lab.source.list': failing }));
    const err: unknown = await execute('lab.source.list', {}, PAT_ACTOR).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnknownCapabilityError);
    if (err instanceof Error) {
      expect(err.message).toBe('falha interna do handler');
    }
  });
});

describe('M-04 CAPABILITY_VERSION fonte unica', () => {
  it('core re-exporta o mesmo valor de contracts (v1)', () => {
    expect(CORE_VERSION).toBe(CONTRACTS_VERSION);
    expect(CONTRACTS_VERSION).toBe('v1');
  });

  it('packages/core/src/capabilities.ts nao redefine o literal', () => {
    const body: string = readFileSync(join(ROOT, 'packages/core/src/capabilities.ts'), 'utf8');
    expect(body).not.toMatch(/export const CAPABILITY_VERSION\s*=/);
    expect(body).toContain("from '@uhhu/contracts'");
    expect(body).toContain('CAPABILITY_VERSION');
  });
});
