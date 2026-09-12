// apps/lab — card base de resultado com proveniência e NOVO (08-02, UI-17/UI-21).
//
// `ResultCard({ item, getToken, projectId })`: título em 2 linhas, autores
// unidos com ano (ou texto de ano desconhecido) mais rótulo de tipo e
// instituição com programa quando presentes, selo de fonte ([BDTD] ou
// [CAPES], ou colagem das origens com contagem quando o grupo tem mais de
// uma), selo NOVO quando result isNew, linha de proveniência via helper
// central, aviso de grupo indisponível no órfão e atalho ver ficha para a
// tela dedicada (criada na 08-04; o atalho pode existir antes).
// Decisão com tags e divergência chegam na 08-03 e 08-04 sobre este base.
// getToken fica reservado no tipo para essas ações futuras. Text escapa por
// padrão; sem WebView; sem eval. Sem `any`.

import { useRouter } from 'expo-router';
import type { JSX } from 'react';
import { Button, Text, View } from 'react-native';
import type { TokenProvider } from '../api/client';
import { docTypeLabel, formatProvenance } from './triage';
import type { TriagedItem } from './triage';

export interface ResultCardProps {
  item: TriagedItem;
  getToken: TokenProvider;
  projectId: string;
}

export function ResultCard({ item, projectId }: ResultCardProps): JSX.Element {
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
      {group === null ? <Text>grupo indisponível</Text> : null}
      <Button title="ver ficha →" onPress={handleOpenDetail} />
    </View>
  );
}
