// apps/lab — card de resultado com decisão mutável (08-03 task 1, UI-19).
//
// `ResultCard({ item, getToken, projectId, onGroupUpdated })`: base 08-02
// (título 2 linhas, autores/ano/tipo, instituição/programa, selo de fonte,
// NOVO, proveniência, ver ficha →) + `<DecisionBar/>` abaixo da proveniência
// (props group/onGroupUpdated repassadas do card; PUT por groupId, sem
// confirmação, decidedAt visível). Grupo expansível com divergência chega na
// task 2 sobre este card. Text escapa por padrão; sem WebView; sem eval.
// Sem `any`.

import { useRouter } from 'expo-router';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { DedupGroupDTO } from '@uhhu/contracts';
import type { TokenProvider } from '../api/client';
import { DecisionBar } from './DecisionBar';
import { docTypeLabel, formatProvenance } from './triage';
import type { TriagedItem } from './triage';

export interface ResultCardProps {
  item: TriagedItem;
  getToken: TokenProvider;
  projectId: string;
  onGroupUpdated?: (group: DedupGroupDTO) => void;
}

function handleNoopGroup(): void {}

export function ResultCard({
  item,
  getToken,
  projectId,
  onGroupUpdated,
}: ResultCardProps): JSX.Element {
  const router = useRouter();
  const { result, group } = item;
  const authorsLine: string =
    result.authors.length > 0 ? result.authors.join(', ') : 'autoria desconhecida';
  const yearLine: string = result.year !== null ? String(result.year) : 'ano desconhecido';
  const typeLabel: string | null = docTypeLabel(result.docType);
  const metaLine: string =
    typeLabel !== null ? `${authorsLine} · ${yearLine} · ${typeLabel}` : `${authorsLine} · ${yearLine}`;
  const sourceBadge: string =
    group !== null && group.originCount > 1
      ? `[${group.origins.join('+').toUpperCase()} — ${group.originCount} origens ▸]`
      : `[${result.source.toUpperCase()}]`;
  const provenanceLine: string = formatProvenance(result);

  function handleOpenDetail(): void {
    router.push(`/project/${projectId}/result?resultId=${result.id}`);
  }

  return (
    <View style={{ borderWidth: 1, padding: 12, gap: 4 }}>
      <Text numberOfLines={2} style={{ fontWeight: '600' }}>
        {result.title}
      </Text>
      <Text>{metaLine}</Text>
      {result.institution !== null ? <Text>{result.institution}</Text> : null}
      {result.program !== null ? <Text>{result.program}</Text> : null}
      <Text>{sourceBadge}</Text>
      {result.isNew ? <Text>NOVO</Text> : null}
      <Text>{provenanceLine}</Text>
      <DecisionBar group={group} getToken={getToken} onDecided={onGroupUpdated ?? handleNoopGroup} />
      {group === null ? <Text>grupo indisponível</Text> : null}
      <Button title="ver ficha →" onPress={handleOpenDetail} />
    </View>
  );
}
