// apps/lab — Projeto: cabeçalho + abas (dev-docs/10 §4).
//
// Cabeçalho: pergunta de pesquisa + status. Abas: Estratégias / Comparação /
// Corpus com contador vivo (placeholder "Corpus: 0" até 06-04/09).
// Mapeamento CORE: GET /api/v1/projects/:id · GET /api/v1/projects/:id/corpus.
// useLocalSearchParams tipado pelo router; sem tipo de domínio local (UI-02).
import { Link, useLocalSearchParams } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

export default function ProjectDetailScreen(): JSX.Element {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = typeof params.id === 'string' ? params.id : '';

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Projeto</Text>
      <Text>Cabeçalho pergunta + status — GET /api/v1/projects/:id</Text>
      <Text>ID: {projectId}</Text>
      <Text>Abas: Estratégias / Comparação / Corpus: 0 (contador vivo em 06-04/09).</Text>
      <Link
        href={{
          pathname: '/project/[id]/strategies',
          params: { id: projectId },
        }}
      >
        Aba Estratégias
      </Link>
      <Link
        href={{
          pathname: '/project/[id]/corpus',
          params: { id: projectId },
        }}
      >
        Aba Corpus
      </Link>
      <Link href="/projects">Voltar aos projetos</Link>
    </View>
  );
}
