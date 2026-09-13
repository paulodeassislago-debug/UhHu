// apps/lab — seção de grupo deduplicado expansível com divergência (08-03 task 2, UI-18).
//
// `DedupGroupSection({ group, resultCache, getToken, onGroupUpdated })`:
// botão `[ORIGENS — N origens ▸/▾]` (só montado quando originCount>1; single
// não monta — ResultCard guarda). Expandido: busca sob demanda dos membros
// ausentes no cache via `labApi.getResult` em Promise.all do grupo (skeleton
// durante; erro isolado com retry do grupo; nunca trava a lista; uma vez por
// grupo via cache, sem prefetch); linhas por origem (fonte + título/autores/
// ano daquela origem + links tocáveis https + selo `★ versão mais completa`
// no canonicalResultId); bloco diferenças via `diffMembers` (linhas
// `campo: A ≠ B` para title/authors/year/institution/program); bloco
// divergências existentes (`fonte: nota` ou "sem divergências"); formulário
// de divergência (origem entre group.origins + nota 1..1000 + [Anotar] via
// `labApi.setDivergence` → onGroupUpdated; `<`/`>` bloqueados no client com
// "Nota não pode conter HTML"). Divergência nunca muda a decisão. 401 →
// markExpired + login. Text escapa; só abre https via Linking. Sem `any`.

import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Linking, Text, TextInput, View } from 'react-native';
import type { DedupGroupDTO, ExecutableSource, ResultDTO } from '@uhhu/contracts';
import { ApiError } from '../api/client';
import type { TokenProvider } from '../api/client';
import { labApi } from '../api/lab';
import { useAuth } from '../auth/session';
import { ErrorBanner } from '../ui/ErrorBanner';
import { CardSkeleton } from '../ui/Skeleton';
import { theme } from '../ui/theme';

export interface DedupGroupSectionProps {
  group: DedupGroupDTO;
  resultCache: Map<string, ResultDTO>;
  getToken: TokenProvider;
  onGroupUpdated: (group: DedupGroupDTO) => void;
}

export function diffMembers(members: ResultDTO[]): string[] {
  if (members.length < 2) {
    return [];
  }
  const out: string[] = [];

  const titles: string[] = [];
  for (const member of members) {
    if (!titles.includes(member.title)) {
      titles.push(member.title);
    }
  }
  if (titles.length > 1) {
    out.push(`título: ${titles.join(' ≠ ')}`);
  }

  const authorsLines: string[] = [];
  for (const member of members) {
    const joined: string =
      member.authors.length > 0 ? member.authors.join(', ') : 'autoria desconhecida';
    if (!authorsLines.includes(joined)) {
      authorsLines.push(joined);
    }
  }
  if (authorsLines.length > 1) {
    out.push(`autores: ${authorsLines.join(' ≠ ')}`);
  }

  const years: string[] = [];
  for (const member of members) {
    const label: string = member.year !== null ? String(member.year) : 'ano desconhecido';
    if (!years.includes(label)) {
      years.push(label);
    }
  }
  if (years.length > 1) {
    out.push(`ano: ${years.join(' ≠ ')}`);
  }

  const institutions: string[] = [];
  for (const member of members) {
    const label: string = member.institution ?? '—';
    if (!institutions.includes(label)) {
      institutions.push(label);
    }
  }
  if (institutions.length > 1) {
    out.push(`instituição: ${institutions.join(' ≠ ')}`);
  }

  const programs: string[] = [];
  for (const member of members) {
    const label: string = member.program ?? '—';
    if (!programs.includes(label)) {
      programs.push(label);
    }
  }
  if (programs.length > 1) {
    out.push(`programa: ${programs.join(' ≠ ')}`);
  }

  return out;
}

function isHttpsUrl(url: string | null): url is string {
  return typeof url === 'string' && url.startsWith('https://');
}

function sourceLabel(source: ExecutableSource): string {
  return source === 'bdtd' ? 'BDTD' : 'CAPES';
}

export function DedupGroupSection({
  group,
  resultCache,
  getToken,
  onGroupUpdated,
}: DedupGroupSectionProps): JSX.Element | null {
  const router = useRouter();
  const { markExpired } = useAuth();
  const [expanded, setExpanded] = useState<boolean>(false);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<{
    message: string;
    requestId: string | null;
  } | null>(null);
  const [members, setMembers] = useState<ResultDTO[] | null>(null);
  const initialSource: ExecutableSource = group.origins[0] ?? 'bdtd';
  const [divSource, setDivSource] = useState<ExecutableSource>(initialSource);
  const [note, setNote] = useState<string>('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [divError, setDivError] = useState<{ message: string; requestId: string | null } | null>(
    null,
  );
  const [divBusy, setDivBusy] = useState<boolean>(false);

  if (group.originCount <= 1) {
    return null;
  }

  function handleUnauthorized(): void {
    markExpired();
    router.replace({ pathname: '/login', params: { expired: '1' } });
  }

  async function loadMembers(): Promise<void> {
    setLoadingMembers(true);
    setMembersError(null);
    try {
      const missingIds: string[] = [];
      for (const memberId of group.memberIds) {
        if (!resultCache.has(memberId)) {
          let alreadyLoaded = false;
          if (members !== null) {
            for (const loaded of members) {
              if (loaded.id === memberId) {
                alreadyLoaded = true;
                break;
              }
            }
          }
          if (!alreadyLoaded) {
            missingIds.push(memberId);
          }
        }
      }
      const fetched: ResultDTO[] =
        missingIds.length > 0
          ? await Promise.all(
              missingIds.map((memberId: string): Promise<ResultDTO> =>
                labApi.getResult(memberId, { getToken }),
              ),
            )
          : [];
      const fetchedById = new Map<string, ResultDTO>();
      for (const item of fetched) {
        fetchedById.set(item.id, item);
      }
      if (members !== null) {
        for (const loaded of members) {
          if (!fetchedById.has(loaded.id)) {
            fetchedById.set(loaded.id, loaded);
          }
        }
      }
      const combined: ResultDTO[] = [];
      for (const memberId of group.memberIds) {
        const fromCache: ResultDTO | undefined = resultCache.get(memberId);
        if (fromCache !== undefined) {
          combined.push(fromCache);
          continue;
        }
        const fromFetched: ResultDTO | undefined = fetchedById.get(memberId);
        if (fromFetched !== undefined) {
          combined.push(fromFetched);
        }
      }
      setMembers(combined);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      if (unknownError instanceof ApiError) {
        setMembersError({
          message: unknownError.message,
          requestId: unknownError.requestId !== '' ? unknownError.requestId : null,
        });
      } else if (unknownError instanceof Error) {
        setMembersError({ message: unknownError.message, requestId: null });
      } else {
        setMembersError({ message: 'Erro interno. Tente novamente.', requestId: null });
      }
    } finally {
      setLoadingMembers(false);
    }
  }

  function handleToggle(): void {
    const next: boolean = !expanded;
    setExpanded(next);
    if (next && members === null && !loadingMembers) {
      void loadMembers();
    }
  }

  function handleRetryMembers(): void {
    void loadMembers();
  }

  async function handleAnnotate(): Promise<void> {
    if (divBusy) {
      return;
    }
    setNoteError(null);
    setDivError(null);
    if (note.includes('<') || note.includes('>')) {
      setNoteError('Nota não pode conter HTML');
      return;
    }
    const trimmed: string = note.trim();
    if (trimmed.length === 0) {
      setNoteError('Nota é obrigatória.');
      return;
    }
    if (trimmed.length > 1000) {
      setNoteError('Nota deve ter no máximo 1000 caracteres.');
      return;
    }
    setDivBusy(true);
    try {
      const updated: DedupGroupDTO = await labApi.setDivergence(
        group.id,
        { source: divSource, note: trimmed },
        { getToken },
      );
      setNote('');
      onGroupUpdated(updated);
    } catch (unknownError: unknown) {
      if (unknownError instanceof ApiError && unknownError.status === 401) {
        handleUnauthorized();
        return;
      }
      if (unknownError instanceof ApiError) {
        setDivError({
          message: unknownError.message,
          requestId: unknownError.requestId !== '' ? unknownError.requestId : null,
        });
      } else if (unknownError instanceof Error) {
        setDivError({ message: unknownError.message, requestId: null });
      } else {
        setDivError({ message: 'Erro interno. Tente novamente.', requestId: null });
      }
    } finally {
      setDivBusy(false);
    }
  }

  const originsLabel: string = group.origins.join('+').toUpperCase();
  const toggleLabel: string = expanded
    ? `${originsLabel} — ${group.originCount} origens ▾`
    : `${originsLabel} — ${group.originCount} origens ▸`;

  const diffs: string[] = members !== null ? diffMembers(members) : [];

  const memberRows: JSX.Element[] = [];
  if (members !== null) {
    for (const memberId of group.memberIds) {
      let found: ResultDTO | null = null;
      for (const candidate of members) {
        if (candidate.id === memberId) {
          found = candidate;
          break;
        }
      }
      if (found === null) {
        memberRows.push(
          <View key={memberId} style={{ gap: theme.space.xxs }}>
            <Text>origem indisponível</Text>
          </View>,
        );
        continue;
      }
      const member: ResultDTO = found;
      const authorsLine: string =
        member.authors.length > 0 ? member.authors.join(', ') : 'autoria desconhecida';
      const yearLine: string = member.year !== null ? String(member.year) : 'ano desconhecido';
      const isCanonical: boolean = member.id === group.canonicalResultId;
      const httpsOrigin: string | null = isHttpsUrl(member.originUrl) ? member.originUrl : null;
      const rawOrigin: string | null = httpsOrigin === null ? member.originUrl : null;
      const httpsSource: string | null = isHttpsUrl(member.sourceUrl) ? member.sourceUrl : null;
      const rawSource: string | null = httpsSource === null ? member.sourceUrl : null;
      memberRows.push(
        <View key={member.id} style={{ gap: theme.space.xxs }}>
          <Text style={{ fontWeight: '600' }}>
            {sourceLabel(member.source)} · {member.title}
          </Text>
          <Text>
            {authorsLine} · {yearLine}
          </Text>
          {isCanonical ? <Text>★ versão mais completa</Text> : null}
          {httpsOrigin !== null ? (
            <Text onPress={() => void Linking.openURL(httpsOrigin)}>origem: {httpsOrigin}</Text>
          ) : rawOrigin !== null ? (
            <Text>origem: {rawOrigin}</Text>
          ) : null}
          {httpsSource !== null ? (
            <Text onPress={() => void Linking.openURL(httpsSource)}>fonte: {httpsSource}</Text>
          ) : rawSource !== null ? (
            <Text>fonte: {rawSource}</Text>
          ) : null}
        </View>,
      );
    }
  }

  const diffRows: JSX.Element[] = [];
  for (let i = 0; i < diffs.length; i += 1) {
    const line: string | undefined = diffs[i];
    if (line !== undefined) {
      diffRows.push(<Text key={`diff-${i}`}>{line}</Text>);
    }
  }

  const divergenceRows: JSX.Element[] = [];
  for (const entry of group.divergences) {
    divergenceRows.push(
      <Text key={`${entry.source}-${entry.note.slice(0, 16)}`}>
        {sourceLabel(entry.source)}: {entry.note}
      </Text>,
    );
  }

  const originButtons: JSX.Element[] = [];
  for (const origin of group.origins) {
    originButtons.push(
      <Button
        key={origin}
        title={divSource === origin ? `• ${sourceLabel(origin)}` : sourceLabel(origin)}
        onPress={() => setDivSource(origin)}
        disabled={divBusy}
      />,
    );
  }

  return (
    <View style={{ gap: theme.space.md }}>
      <Button title={toggleLabel} onPress={handleToggle} />
      {expanded ? (
        <View style={{ gap: theme.space.md }}>
          {loadingMembers && members === null ? <CardSkeleton count={2} /> : null}
          {membersError !== null && members === null ? (
            <ErrorBanner
              message={membersError.message}
              requestId={membersError.requestId}
              onRetry={handleRetryMembers}
            />
          ) : null}
          {members !== null ? (
            <View style={{ gap: theme.space.md }}>
              <View style={{ gap: theme.space.md }}>{memberRows}</View>
              <View style={{ gap: theme.space.xs }}>
                <Text style={{ fontWeight: '600' }}>Diferenças</Text>
                {diffRows.length > 0 ? (
                  <View style={{ gap: theme.space.xxs }}>{diffRows}</View>
                ) : (
                  <Text>sem diferenças</Text>
                )}
              </View>
              <View style={{ gap: theme.space.xs }}>
                <Text style={{ fontWeight: '600' }}>Divergências</Text>
                {divergenceRows.length > 0 ? (
                  <View style={{ gap: theme.space.xxs }}>{divergenceRows}</View>
                ) : (
                  <Text>sem divergências</Text>
                )}
              </View>
              <View style={{ gap: theme.space.xs }}>
                <Text style={{ fontWeight: '600' }}>Anotar divergência</Text>
                <View style={{ flexDirection: 'row', gap: theme.space.md }}>{originButtons}</View>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="nota da divergência"
                  maxLength={1000}
                  multiline={true}
                  style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
                />
                {noteError !== null ? (
                  <Text style={{ color: theme.colors.danger }}>{noteError}</Text>
                ) : null}
                {divError !== null ? (
                  <View style={{ gap: theme.space.xxs }}>
                    <Text style={{ color: theme.colors.danger }}>{divError.message}</Text>
                    {divError.requestId !== null ? (
                      <Text style={{ fontSize: theme.type.caption }}>
                        (req {divError.requestId})
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                <Button
                  title={divBusy ? 'Anotando…' : 'Anotar'}
                  onPress={() => void handleAnnotate()}
                  disabled={divBusy}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
