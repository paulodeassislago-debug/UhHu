// apps/lab — Login/Convite (dev-docs/10 §2).
//
// Blocos: email + senha + entrar + link "tenho convite".
// Mapeamento CORE: POST /api/v1/auth/login · POST /api/v1/auth/logout · GET /api/v1/auth/me.
// Placeholder sem lógica de auth (06-03); sem tipo de domínio local (UI-02).
import { Link } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

export default function LoginScreen(): JSX.Element {
  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Entrar</Text>
      <Text>Email + senha + entrar (placeholder — auth em 06-03).</Text>
      <Text>Mapeamento CORE: POST /api/v1/auth/login</Text>
      <Link href="/register">Tenho convite — registrar</Link>
      <Link href="/projects">Entrar (placeholder) → projetos</Link>
    </View>
  );
}
