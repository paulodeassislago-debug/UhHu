// apps/lab — PAT em storage seguro (UI-07, 06-03 task 2, D-01/D-02).
//
// Wrapper `getToken/setToken/clearToken` sobre o segredo do nativo:
// - Nativo: expo-secure-store (`uhhu_pat`, cifrado em repouso).
// - Web: memória volátil (variável de módulo, nunca storage persistente;
//   web usa SOMENTE cookie httpOnly — este fallback existe só para manter a
//   mesma assinatura TokenProvider sem tocar em storage do navegador).
// Raw do PAT manipulado UMA vez (recebe → guarda → sai de escopo); nunca em
// log, console ou bundle; leitura via getter assíncrono injetado no apiFetch.
// Zero armazenamento do navegador para segredo/privilégio (T-06-03-02/04).

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { TokenProvider } from '../api/client';

const PAT_STORAGE_KEY = 'uhhu_pat';

// Volátil: só web (sem persistência; some no reload — cookie é a sessão web).
let volatileToken: string | null = null;

export const getToken: TokenProvider = async () => {
  if (Platform.OS === 'web') {
    return volatileToken;
  }
  return SecureStore.getItemAsync(PAT_STORAGE_KEY);
};

export async function setToken(raw: string): Promise<void> {
  if (Platform.OS === 'web') {
    volatileToken = raw;
    return;
  }
  await SecureStore.setItemAsync(PAT_STORAGE_KEY, raw);
}

export async function clearToken(): Promise<void> {
  volatileToken = null;
  if (Platform.OS === 'web') {
    return;
  }
  await SecureStore.deleteItemAsync(PAT_STORAGE_KEY);
}
