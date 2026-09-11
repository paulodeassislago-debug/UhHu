// apps/lab — Lista de Projetos (dev-docs/10 §3).
//
// Card: título + pergunta truncada + status + contagens leves (06-04/07).
// Mapeamento CORE: GET /api/v1/projects · POST /api/v1/projects · PATCH /api/v1/projects/:id.
// Placeholder navegável; dados reais via projectsApi (task 2) nas fases 6-04/07.
import { Link } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

const EXAMPLE_PROJECT_ID = '00000000-0000-0000-0000-000000000000';

export default function ProjectsScreen(): JSX.Element {
  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Projetos</Text>
      <Text>Lista de Projetos — GET /api/v1/projects (placeholder).</Text>
      <Text>Nova pesquisa (+) — POST /api/v1/projects (em 06-04/07).</Text>
      <Link
        href={{
          pathname: '/project/[id]',
          params: { id: EXAMPLE_PROJECT_ID },
        }}
      >
        Abrir projeto exemplo
      </Link>
      <Link href="/login">Voltar ao login</Link>
    </View>
  );
}
