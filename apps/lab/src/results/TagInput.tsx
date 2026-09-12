// apps/lab — input de tags com autocomplete + criar-na-hora (08-04, UI-20, D-20).
//
// `TagInput({ group, projectId, projectTags, getToken, onGroupUpdated })`:
// chips das tags atuais (`group.tags`, × dispara `detachTag` com busy por
// chip); input com sugestões de `suggestTags` (defaults do servidor primeiro
// na ordem canônica, depois alfabética, prefixo case-insensitive, teto 8);
// submit: match exato case-insensitive → `attachTag`; senão valida local
// (vazio/101+ sem request, molde 07-06) → `createProjectTag` + `attachTag` da
// criada (duas chamadas; erro da 2ª mantém a tag criada em `localTags` para
// retry virar attach); tudo que muda o grupo → `onGroupUpdated`. Erro ApiError
// verbatim inline; group null → input desabilitado + "grupo indisponível".
// Text escapa; sem WebView; sem eval. Sem `any`.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import type { DedupGroupDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import type { ProjectTag } from '../api/lab';
import { useAuth } from '../auth/session';
import { resolveTagAction, suggestTags } from './tags';

export { resolveTagAction, suggestTags } from './tags';
export type { TagAction } from './tags';
export { DEFAULT_TAG_ORDER } from './tags';

export interface TagInputProps {
  group: DedupGroupDTO | null;
  projectId: string;
  projectTags: ProjectTag[];
  getToken: TokenProvider;
  onGroupUpdated: (group: DedupGroupDTO) => void;
}

function findTagByName(tags: ProjectTag[], name: string): ProjectTag | null {
  for (const tag of tags) {
    if (tag.name === name) {
      return tag;
    }
  }
  const lowered: string = name.toLowerCase();
  for (const tag of tags) {
    if (tag.name.toLowerCase() === lowered) {
      return tag;
    }
  }
  return null;
}

export function TagInput({
  group,
  projectId,
  projectTags,
  getToken,
  onGroupUpdated,
}: TagInputProps): JSX.Element {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [input, setInput] = useState<string>('');
  const [busySubmit, setBusySubmit] = useState<boolean>(false);
  const [busyDetach, setBusyDetach] = useState<string | null>(null);
  const [busySuggest, setBusySuggest] = useState<string | null>(null);
  const [localTags, setLocalTags] = useState<ProjectTag[]>([]);
  const [error, setError] = useState<{ message: string; requestId: string | null } | null>(null);

  function handleUnauthorized(): void {
    markExpired();
    router.replace({ pathname: '/login', params: { expired: '1' } });
  }

  function toBanner(unknownError: unknown): { message: string; requestId: string | null } {
    if (unknownError instanceof ApiError) {
      return {
        message: unknownError.message,
        requestId: unknownError.requestId !== '' ? unknownError.requestId : null,
      };
    }
    if (unknownError instanceof Error) {
      return { message: unknownError.message, requestId: null };
    }
    return { message: 'Erro interno. Tente novamente.', requestId: null };
  }

  function knownTags(): ProjectTag[] {
    const out: ProjectTag[] = [];
    for (const tag of projectTags) {
      out.push(tag);
    }
    for (const tag of localTags) {
      let dup = false;
      for (const seen of out) {
        if (seen.id === tag.id) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        out.push(tag);
      }
    }
    return out;
  }

  async function attachExisting(tagId: string): Promise<void> {
    if (group === null || busySubmit || busySuggest !== null) {
      return;
    }
    setBusySuggest(tagId);
    setError(null);
    try {
      const updated: DedupGroupDTO = await labApi.attachTag(group.id, tagId, { getToken });
      setInput('');
      onGroupUpdated(updated);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(toBanner(unknownError));
    } finally {
      setBusySuggest(null);
    }
  }

  function handleSuggestionPress(tagId: string): void {
    void attachExisting(tagId);
  }

  async function handleSubmit(): Promise<void> {
    if (group === null || busySubmit) {
      return;
    }
    setError(null);
    const trimmed: string = input.trim();
    if (trimmed.length === 0) {
      setError({ message: 'Nome da tag é obrigatório.', requestId: null });
      return;
    }
    if (trimmed.length > 100) {
      setError({ message: 'Nome deve ter no máximo 100 caracteres.', requestId: null });
      return;
    }
    const action = resolveTagAction(input, knownTags());
    if (action.type === 'invalid') {
      setError({ message: 'Nome da tag é obrigatório.', requestId: null });
      return;
    }
    setBusySubmit(true);
    try {
      if (action.type === 'attach') {
        const updated: DedupGroupDTO = await labApi.attachTag(group.id, action.tagId, { getToken });
        setInput('');
        onGroupUpdated(updated);
        return;
      }
      const created: ProjectTag = await labApi.createProjectTag(
        projectId,
        { name: action.name },
        { getToken },
      );
      const nextLocal: ProjectTag[] = [];
      for (const tag of localTags) {
        nextLocal.push(tag);
      }
      nextLocal.push(created);
      setLocalTags(nextLocal);
      try {
        const updated: DedupGroupDTO = await labApi.attachTag(group.id, created.id, { getToken });
        setInput('');
        onGroupUpdated(updated);
      } catch (attachError: unknown) {
        if (attachError instanceof ApiError && attachError.status === 401) {
          handleUnauthorized();
          return;
        }
        // Tag criada é mantida (localTags): retry com o mesmo texto vira
        // attach em vez de recriar; input preservado para o retry.
        setError(toBanner(attachError));
      }
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(toBanner(unknownError));
    } finally {
      setBusySubmit(false);
    }
  }

  function handleSubmitPress(): void {
    void handleSubmit();
  }

  async function handleDetach(tagName: string): Promise<void> {
    if (group === null || busyDetach !== null || busySubmit) {
      return;
    }
    const target: ProjectTag | null = findTagByName(knownTags(), tagName);
    if (target === null) {
      setError({ message: `Tag "${tagName}" não encontrada.`, requestId: null });
      return;
    }
    setBusyDetach(tagName);
    setError(null);
    try {
      await labApi.detachTag(group.id, target.id, { getToken });
      const remaining: string[] = [];
      for (const name of group.tags) {
        if (name !== tagName) {
          remaining.push(name);
        }
      }
      // detachTag retorna 204 sem corpo: sintetiza o grupo sem a tag para o
      // mapa de overrides (decisão/divergências preservadas por spread).
      onGroupUpdated({ ...group, tags: remaining });
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(toBanner(unknownError));
    } finally {
      setBusyDetach(null);
    }
  }

  if (group === null) {
    return (
      <View style={{ gap: 4 }}>
        <Text>grupo indisponível</Text>
        <TextInput
          value=""
          onChangeText={() => undefined}
          placeholder="adicionar tag"
          editable={false}
          style={{ borderWidth: 1, padding: 8, opacity: 0.5 }}
        />
      </View>
    );
  }

  const suggestions: ProjectTag[] = suggestTags(knownTags(), input);

  const chipRows: JSX.Element[] = [];
  for (const name of group.tags) {
    const detaching: boolean = busyDetach === name;
    chipRows.push(
      <View key={name} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
        <Text>{name}</Text>
        <Button
          title={detaching ? '…' : `× ${name}`}
          onPress={() => void handleDetach(name)}
          disabled={detaching || busySubmit}
        />
      </View>,
    );
  }

  const suggestionRows: JSX.Element[] = [];
  for (const tag of suggestions) {
    const busy: boolean = busySuggest === tag.id;
    suggestionRows.push(
      <Button
        key={tag.id}
        title={busy ? '…' : tag.name}
        onPress={() => handleSuggestionPress(tag.id)}
        disabled={busy || busySubmit}
      />,
    );
  }

  return (
    <View style={{ gap: 4 }}>
      {chipRows.length > 0 ? <View style={{ gap: 4 }}>{chipRows}</View> : <Text>sem tags</Text>}
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="adicionar tag"
        editable={!busySubmit}
        style={{ borderWidth: 1, padding: 8 }}
      />
      {suggestionRows.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontWeight: '600' }}>Sugestões</Text>
          <View style={{ gap: 4 }}>{suggestionRows}</View>
        </View>
      ) : null}
      <Button
        title={busySubmit ? 'Adicionando…' : 'Adicionar'}
        onPress={handleSubmitPress}
        disabled={busySubmit}
      />
      {error !== null ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: '#dc2626' }}>{error.message}</Text>
          {error.requestId !== null ? (
            <Text style={{ fontSize: 12 }}>(req {error.requestId})</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
