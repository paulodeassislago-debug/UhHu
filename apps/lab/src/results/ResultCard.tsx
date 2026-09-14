// apps/lab — card de resultado com decisão + tags + grupo expansível (08-04, UI-18/UI-19/UI-20).
//
// `ResultCard({ item, getToken, projectId, projectTags, resultCache, onGroupUpdated })`:
// base 08-02 (título 2 linhas, autores/ano/tipo, instituição/programa, selo de
// fonte, NOVO, proveniência, ver ficha →) + `<DecisionBar/>` abaixo da
// proveniência (PUT por groupId, sem confirmação, decidedAt visível) +
// `<TagInput/>` abaixo da decisão (autocomplete com defaults + criar-na-hora +
// chips com ×; props repassadas da tela que já carrega projectTags p/ o filtro)
// + `<DedupGroupSection/>` quando originCount>1 (origens/links/diferenças/
// canônica + divergência anotável sem mudar a decisão; membros sob demanda
// via resultCache). Text escapa por padrão; sem WebView; sem eval. Sem `any`.

import { useRouter } from 'expo-router';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { DedupGroupDTO, ResultDTO } from '@uhhu/contracts';
import type { TokenProvider } from '../api/client';
import type { ProjectTag } from '../api/lab';
import { DecisionBar } from './DecisionBar';
import { DedupGroupSection } from './DedupGroupSection';
import { TagInput } from './TagInput';
import { docTypeLabel, formatProvenance } from './triage';
import type { TriagedItem } from './triage';
import { theme } from '../ui/theme';

export interface ResultCardProps {
  item: TriagedItem;
  getToken: TokenProvider;
  projectId: string;
  resultCache: Map<string, ResultDTO>;
  projectTags?: ProjectTag[];
  onGroupUpdated?: (group: DedupGroupDTO) => void;
}

function handleNoopGroup(): void {}

export function ResultCard({
  item,
  getToken,
  projectId,
  resultCache,
  projectTags,
  onGroupUpdated,
}: ResultCardProps): JSX.Element {
  const router = useRouter();
  const { result, group } = item;
  const authorsLine: string =
    result.authors.length > 0 ? result.authors.join(', ') : 'autoria desconhecida';
  const yearLine: string = result.year !== null ? String(result.year) : 'ano desconhecido';
  const typeLabel: string | null = docTypeLabel(result.docType);
  const metaLine: string =
    typeLabel !== null
      ? `${authorsLine} · ${yearLine} · ${typeLabel}`
      : `${authorsLine} · ${yearLine}`;
  const sourceBadge: string =
    group !== null && group.originCount > 1
      ? `[${group.origins.join('+').toUpperCase()} — ${group.originCount} origens ▸]`
      : `[${result.source.toUpperCase()}]`;
  const provenanceLine: string = formatProvenance(result);

  // Ficha sob demanda 08-04 (D-18): destino project/[id]/result?resultId=<uuid>
  // (tela dedicada, nunca modal; busca fresca getResult ao abrir).
  function handleOpenDetail(): void {
    router.push(`/project/${projectId}/result?resultId=${result.id}`);
  }

  return (
    <View style={{ borderWidth: theme.border.thin, padding: theme.space.lg, gap: theme.space.xs }}>
      <Text numberOfLines={2} style={{ fontWeight: '600' }}>
        {result.title}
      </Text>
      <Text>{metaLine}</Text>
      {result.institution !== null ? <Text>{result.institution}</Text> : null}
      {result.program !== null ? <Text>{result.program}</Text> : null}
      <Text>{sourceBadge}</Text>
      {result.isNew ? <Text>NOVO</Text> : null}
      <Text>{provenanceLine}</Text>
      <DecisionBar
        group={group}
        getToken={getToken}
        onDecided={onGroupUpdated ?? handleNoopGroup}
      />
      <TagInput
        group={group}
        projectId={projectId}
        projectTags={projectTags ?? []}
        getToken={getToken}
        onGroupUpdated={onGroupUpdated ?? handleNoopGroup}
      />
      {group !== null && group.originCount > 1 ? (
        <DedupGroupSection
          group={group}
          resultCache={resultCache}
          getToken={getToken}
          onGroupUpdated={onGroupUpdated ?? handleNoopGroup}
        />
      ) : null}
      {group === null ? <Text>grupo indisponível</Text> : null}
      <Button title="ver ficha →" onPress={handleOpenDetail} />
    </View>
  );
}
