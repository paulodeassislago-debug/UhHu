// apps/lab — Registro com token de convite (UI-06, 06-03).
//
// Campos nome + email + senha + token (pré-preenche via ?token=). Valida com
// registerSchema do contracts e chama authApi.register (POST
// /api/v1/auth/register). Token inválido/expirado → mensagem legível do
// envelope verbatim (INVITE_INVALID/EXPIRED) + requestId, sem vazar se o email
// existe (servidor responde genérico; client só repassa). Sucesso → /login com
// aviso "conta criada, entre com suas credenciais" (via ?registered=1).
// Sem cadastro aberto além do convite (ADR-008).

import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import type { JSX } from 'react';
import { Button, ScrollView, Text, TextInput } from 'react-native';
import { ZodError } from 'zod';
import { registerSchema } from '@uhhu/contracts';
import { ApiError } from '../src/api/client';
import { authApi } from '../src/api/auth';
import { theme } from '../src/ui/theme';

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

export default function RegisterScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const tokenParam = toSingleParam(params.token);

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [inviteToken, setInviteToken] = useState<string>(tokenParam ?? '');
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);

  async function handleRegister(): Promise<void> {
    if (busy) {
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    setErrorRequestId(null);
    try {
      // Mesmas regras do servidor; registerSchema.parse valida antes do fetch.
      const parsed = registerSchema.parse({
        name: name.trim(),
        email: email.trim(),
        password,
        inviteToken: inviteToken.trim(),
      });
      await authApi.register(parsed);
      router.replace({ pathname: '/login', params: { registered: '1' } });
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, padding: theme.space.xxl, gap: theme.space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: theme.type.heading, fontWeight: '600' }}>Registrar com convite</Text>
      <Text>Nome</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Seu nome"
        editable={!busy}
        style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
      />
      <Text>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="voce@exemplo.br"
        autoCapitalize="none"
        keyboardType="email-address"
        editable={!busy}
        style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
      />
      <Text>Senha (mínimo 12 caracteres)</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••••••"
        secureTextEntry
        editable={!busy}
        style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
      />
      <Text>Token do convite</Text>
      <TextInput
        value={inviteToken}
        onChangeText={setInviteToken}
        placeholder="token do convite"
        autoCapitalize="none"
        editable={!busy}
        style={{ borderWidth: theme.border.thin, padding: theme.space.md }}
      />
      <Button
        title={busy ? 'Registrando…' : 'Criar conta'}
        onPress={() => void handleRegister()}
        disabled={busy}
      />
      {errorMessage !== null ? <Text>{errorMessage}</Text> : null}
      {errorRequestId !== null ? (
        <Text style={{ fontSize: theme.type.caption }}>(req {errorRequestId})</Text>
      ) : null}
      <Link href="/login">Voltar ao login</Link>
    </ScrollView>
  );
}
