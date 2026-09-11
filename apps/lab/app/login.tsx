// apps/lab — Login nos dois canais (UI-05 + UI-07 + UI-08, 06-03).
//
// MESMA tela web+nativo (sem telas separadas por plataforma):
// - Web: useAuth().login → authApi.login (cookie httpOnly; NUNCA chama
//   /api/v1/auth/token no web).
// - Nativo: pat.nativeLogin → POST /api/v1/auth/token (PAT por device em
//   SecureStore) + refresh() para hidratar o user no contexto.
// Detecção: Platform.OS === 'web' ? session.login (cookie) : pat.nativeLogin.
// Blocos §2: email + senha + entrar + link "tenho convite" → /register. Erros
// 401/429 verbatim (credencial genérica; lockout sem retry — T-06-03-01) +
// requestId pequeno. Sucesso → `next` interno preservado (projeto nunca
// perdido) ou /projects. Avisos: ?expired=1 → "Sua sessão expirou. Entre
// novamente."; ?registered=1 → "Conta criada, entre com suas credenciais.".

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { Button, Platform, Text, TextInput, View } from 'react-native';
import { ZodError } from 'zod';
import { ApiError } from '../src/api/client';
import { nativeLogin } from '../src/auth/pat';
import { isSafeNext, useAuth } from '../src/auth/session';

function toSingleParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first: string | undefined = value[0];
    return typeof first === 'string' ? first : undefined;
  }
  return undefined;
}

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const { login, refresh, expired } = useAuth();
  const params = useLocalSearchParams<{ expired?: string; next?: string; registered?: string }>();
  const expiredParam = toSingleParam(params.expired);
  const nextParam = toSingleParam(params.next);
  const registeredParam = toSingleParam(params.registered);

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  const showExpired = expired || expiredParam === '1';
  const showRegistered = registeredParam === '1';
  const safeNext = isSafeNext(nextParam) ? nextParam : '/projects';

  async function handleLogin(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      if (Platform.OS === 'web') {
        await login(email.trim(), password);
      } else {
        await nativeLogin(email.trim(), password);
        await refresh();
      }
      router.replace(safeNext);
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
        setErrorRequestId(error.requestId !== '' ? error.requestId : null);
      } else if (error instanceof ZodError) {
        const first = error.issues[0];
        setErrorMessage(
          typeof first?.message === 'string' && first.message.length > 0
            ? first.message
            : 'Dados inválidos.',
        );
        setErrorRequestId(null);
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
        setErrorRequestId(null);
      } else {
        setErrorMessage('Erro interno. Tente novamente.');
        setErrorRequestId(null);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '600' }}>Entrar</Text>
      {showExpired ? <Text>Sua sessão expirou. Entre novamente.</Text> : null}
      {showRegistered ? <Text>Conta criada, entre com suas credenciais.</Text> : null}
      <Text>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="voce@exemplo.br"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!busy}
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Text>Senha</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••••••"
        secureTextEntry
        editable={!busy}
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button title={busy ? 'Entrando…' : 'Entrar'} onPress={() => void handleLogin()} disabled={busy} />
      {errorMessage !== null ? <Text>{errorMessage}</Text> : null}
      {errorRequestId !== null ? <Text style={{ fontSize: 12 }}>(req {errorRequestId})</Text> : null}
      <Link href="/register">Tenho convite — registrar</Link>
    </View>
  );
}
