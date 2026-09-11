// apps/lab — Aba Corpus (dev-docs/10 §10).
//
// View derivada dos elegíveis com contador vivo (placeholder "0 itens").
// Mapeamento CORE: GET /api/v1/lab/projects/:id/corpus · export CSV/BibTeX/JSON.
// Placeholder navegável; corpus real na fase 9.
import { Link, useLocalSearchParams } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

export default function CorpusScreen(): JSX.Element {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Corpus: 0</Text>
      <Text>Corpus — GET /api/v1/lab/projects/:id/corpus (placeholder).</Text>
      <Text>Projeto: {projectId}</Text>
      <Link
        href={{
          pathname: '/project/[id]',
          params: { id: projectId },
        }}
      >
        Voltar ao projeto
      </Link>
      <Link
        href={{
          pathname: '/project/[id]/strategies',
          params: { id: projectId },
        }}
      >
        Ir para Estratégias
      </Link>
    </View>
  );
}
