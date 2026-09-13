// apps/lab — testes puros do autocomplete de tags (08-04 task 1, UI-20, D-20).
//
// Cobre: `suggestTags` (defaults primeiro na ordem canônica, prefixo filtra,
// limite 8, case-insensitive) + `resolveTagAction` (match exato → attach,
// inexistente → create, vazio/overlong → invalid) + wiring do `TagInput`
// (attachTag/detachTag/createProjectTag, grupo null desabilitado) por leitura
// de fonte — sem importar react-native/expo-router no vitest node (molde
// decisionBar.test.ts). Sem rede/`any`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ProjectTag } from '../../api/lab';
import { resolveTagAction, suggestTags } from '../tags';

function tag(id: string, name: string): ProjectTag {
  return { id, name, color: null };
}

const DEFAULTS: ProjectTag[] = [
  tag('t-incluir', 'incluir'),
  tag('t-excluir', 'excluir'),
  tag('t-duplicado', 'duplicado'),
  tag('t-indisponivel', 'indisponível'),
  tag('t-revisar', 'revisar'),
];

describe('suggestTags ordena defaults primeiro', () => {
  it('prefixo vazio sugere defaults na ordem canônica', () => {
    const tags: ProjectTag[] = [tag('t-zebra', 'zebra'), ...DEFAULTS, tag('t-alpha', 'alpha')];
    const out: ProjectTag[] = suggestTags(tags, '');
    expect(out.slice(0, 5).map((entry: ProjectTag): string => entry.name)).toEqual([
      'incluir',
      'excluir',
      'duplicado',
      'indisponível',
      'revisar',
    ]);
  });

  it('prefixo filtra por início case-insensitive', () => {
    const tags: ProjectTag[] = [...DEFAULTS, tag('t-zebra', 'zebra')];
    expect(suggestTags(tags, 'inc').map((entry: ProjectTag): string => entry.name)).toEqual([
      'incluir',
    ]);
    expect(suggestTags(tags, 'INC').map((entry: ProjectTag): string => entry.name)).toEqual([
      'incluir',
    ]);
    expect(suggestTags(tags, 'EXC').map((entry: ProjectTag): string => entry.name)).toEqual([
      'excluir',
    ]);
  });

  it('não-defaults vêm depois em ordem alfabética', () => {
    const tags: ProjectTag[] = [tag('t-zebra', 'zebra'), tag('t-alpha', 'alpha')];
    const out: ProjectTag[] = suggestTags(tags, '');
    expect(out.map((entry: ProjectTag): string => entry.name)).toEqual(['alpha', 'zebra']);
  });

  it('teto de 8 sugestões', () => {
    const tags: ProjectTag[] = [];
    for (let i = 0; i < 12; i += 1) {
      tags.push(tag(`t-${i}`, `tema${i}`));
    }
    expect(suggestTags(tags, '').length).toBe(8);
  });
});

describe('resolveTagAction decide anexar vs criar sem rede', () => {
  it('match exato case-insensitive vira attach com o id', () => {
    const tags: ProjectTag[] = [...DEFAULTS];
    const out = resolveTagAction('INCLUIR', tags);
    expect(out).toEqual({ type: 'attach', tagId: 't-incluir' });
  });

  it('texto inexistente vira create com o nome aparado', () => {
    const out = resolveTagAction('  novo-tema  ', [...DEFAULTS]);
    expect(out).toEqual({ type: 'create', name: 'novo-tema' });
  });

  it('vazio ou só-espaços vira invalid (sem request)', () => {
    expect(resolveTagAction('', [...DEFAULTS])).toEqual({ type: 'invalid' });
    expect(resolveTagAction('   ', [...DEFAULTS])).toEqual({ type: 'invalid' });
  });

  it('101+ chars vira invalid (sem request)', () => {
    expect(resolveTagAction('x'.repeat(101), [...DEFAULTS])).toEqual({ type: 'invalid' });
    expect(resolveTagAction('y'.repeat(100), [...DEFAULTS]).type).toBe('create');
  });
});

function readTagInputSource(): string {
  return readFileSync(new URL('../TagInput.tsx', import.meta.url), 'utf8');
}

describe('TagInput wiring por grupo (attach/criar/remover)', () => {
  it('associa, cria-na-hora e remove via labApi', () => {
    const source: string = readTagInputSource();
    expect(source.includes('attachTag')).toBe(true);
    expect(source.includes('detachTag')).toBe(true);
    expect(source.includes('createProjectTag')).toBe(true);
  });

  it('grupo null desabilita com mensagem', () => {
    const source: string = readTagInputSource();
    expect(source.includes('grupo indisponível')).toBe(true);
    expect(source.includes('editable={false}')).toBe(true);
  });
});
