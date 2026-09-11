// apps/lab — Aba Estratégias (dev-docs/10 §5).
//
// Card por Search: termos legíveis, filtros, fontes, runs, última execução.
// Mapeamento CORE: GET /api/v1/lab/searches?projectId= · POST /api/v1/lab/searches/:id/runs.
// Placeholder navegável; execução real nas fases 7 (buscas/runs).
import { Link, useLocalSearchParams } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

export default function StrategiesScreen(): JSX.Element {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Estratégias</Text>
      <Text>Lista de buscas — GET /api/v1/lab/searches?projectId= (placeholder).</Text>
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
          pathname: '/project/[id]/corpus',
          params: { id: projectId },
        }}
      >
        Ir para Corpus
      </Link>
    </View>
  );
}
