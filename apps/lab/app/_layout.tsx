// apps/lab — layout raiz do esqueleto (dev-docs/10 §1).
//
// Stack com typedRoutes (app.json experiments.typedRoutes). Telas placeholder
// navegáveis; nenhuma tela chama fetch direto nem banco — o acesso ao CORE
// passa por src/api/* (client tipado, 06-02 task 2; auth em 06-03).
import { Stack } from 'expo-router';
import type { JSX } from 'react';

export default function RootLayout(): JSX.Element {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'UhHu Lab' }} />
      <Stack.Screen name="login" options={{ title: 'Entrar' }} />
      <Stack.Screen name="register" options={{ title: 'Convite' }} />
      <Stack.Screen name="projects" options={{ title: 'Projetos' }} />
      <Stack.Screen name="project/[id]" options={{ title: 'Projeto' }} />
      <Stack.Screen name="project/[id]/strategies" options={{ title: 'Estratégias' }} />
      <Stack.Screen name="project/[id]/corpus" options={{ title: 'Corpus' }} />
    </Stack>
  );
}
