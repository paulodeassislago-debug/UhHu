// apps/lab — helpers puros de tags (08-04, UI-20, D-20).
//
// Definição única da ordenação de autocomplete e da decisão anexar-vs-criar;
// `TagInput.tsx` importa e re-exporta (testes importam daqui para não puxar
// react-native/expo-router no vitest node — mesmo molde decision.ts da 08-03).
// Sem `any`.

import type { ProjectTag } from '../api/lab';

// Defaults canônicos do servidor pós-08-01 (ordem fixa de sugestão).
export const DEFAULT_TAG_ORDER: readonly string[] = [
  'incluir',
  'excluir',
  'duplicado',
  'indisponível',
  'revisar',
] as const;

function defaultRank(name: string): number {
  for (let i = 0; i < DEFAULT_TAG_ORDER.length; i += 1) {
    if (DEFAULT_TAG_ORDER[i] === name) {
      return i;
    }
  }
  return -1;
}

// Filtra por prefixo case-insensitive; defaults primeiro na ordem canônica,
// depois alfabética (pt-BR); teto 8 (T-08-04-05). Prefixo vazio lista tudo
// (defaults primeiro). Nunca muta a entrada.
export function suggestTags(tags: ProjectTag[], prefix: string): ProjectTag[] {
  const normalized: string = prefix.trim().toLowerCase();
  const filtered: ProjectTag[] = [];
  for (const tag of tags) {
    if (normalized.length === 0 || tag.name.toLowerCase().startsWith(normalized)) {
      filtered.push(tag);
    }
  }
  const defaults: ProjectTag[] = [];
  const rest: ProjectTag[] = [];
  for (const tag of filtered) {
    if (defaultRank(tag.name) >= 0) {
      defaults.push(tag);
    } else {
      rest.push(tag);
    }
  }
  defaults.sort((a: ProjectTag, b: ProjectTag): number => defaultRank(a.name) - defaultRank(b.name));
  rest.sort((a: ProjectTag, b: ProjectTag): number => a.name.localeCompare(b.name, 'pt-BR'));
  const out: ProjectTag[] = [];
  for (const tag of defaults) {
    if (out.length >= 8) {
      break;
    }
    out.push(tag);
  }
  for (const tag of rest) {
    if (out.length >= 8) {
      break;
    }
    out.push(tag);
  }
  return out;
}

export type TagAction =
  | { type: 'attach'; tagId: string }
  | { type: 'create'; name: string }
  | { type: 'invalid' };

// Decide sem rede: vazio ou >100 → invalid (sem request, molde 07-06);
// match exato case-insensitive → attach; senão → create com o nome aparado.
export function resolveTagAction(input: string, tags: ProjectTag[]): TagAction {
  const trimmed: string = input.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    return { type: 'invalid' };
  }
  const lowered: string = trimmed.toLowerCase();
  for (const tag of tags) {
    if (tag.name.toLowerCase() === lowered) {
      return { type: 'attach', tagId: tag.id };
    }
  }
  return { type: 'create', name: trimmed };
}
