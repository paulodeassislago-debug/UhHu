// apps/lab — Registro com token de convite (dev-docs/10 §2).
//
// Mapeamento CORE: POST /api/v1/auth/register (convite válido; inválido/expirado
// com mensagem legível em 06-03). Placeholder sem tipo local (UI-02).
import { Link } from 'expo-router';
import type { JSX } from 'react';
import { Text, View } from 'react-native';

export default function RegisterScreen(): JSX.Element {
  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Registrar com convite</Text>
      <Text>Campo token de convite (placeholder — registro em 06-03).</Text>
      <Text>Mapeamento CORE: POST /api/v1/auth/register</Text>
      <Link href="/login">Voltar ao login</Link>
    </View>
  );
}
