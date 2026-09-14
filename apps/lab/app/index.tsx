// apps/lab — raiz do esqueleto (dev-docs/10 §1).
//
// Placeholder: redirect para /login ou /projects conforme sessão.
// Sessão real em 06-03 (web cookie httpOnly / nativo PAT em SecureStore);
// aqui só navegação, sem decidir privilégio (guards são UX, AGENTS.md).
import { Link } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';
import { theme } from '../src/ui/theme';

export default function IndexScreen(): JSX.Element {
  return (
    <View style={{ flex: 1, padding: theme.space.xxl, gap: theme.space.lg }}>
      <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>UhHu Lab</Text>
      <Text>Raiz — redireciona para /login ou /projects conforme sessão (auth em 06-03).</Text>
      <Link href="/login">Ir para login</Link>
      <Link href="/projects">Ir para projetos</Link>
    </View>
  );
}
