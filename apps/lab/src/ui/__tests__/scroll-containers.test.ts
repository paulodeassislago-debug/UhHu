// apps/lab — tripwire de scroll containers (gap UAT 11/09/2026, 06-05 task 2).
//
// Motivo: projects.tsx usava `<View style={{flex:1}}>` + `items.map(...)` sem
// ScrollView/FlatList — na web body.scrollHeight=1668 vs clientHeight=493 com
// overflowY hidden e zero scroll containers; no nativo View também não rola.
// vitest/expo-export não pegam layout, então este teste falha se o padrão
// View+map voltar: lê os fontes das telas (build-time, sem rede, sem executar
// dado de usuário) e asserta import+uso reais de FlatList/ScrollView.
// Sem `any` (string + narrowing); sem segredo.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readScreen(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const PROJECTS_PATH = '../../../app/projects.tsx';
const LOGIN_PATH = '../../../app/login.tsx';
const REGISTER_PATH = '../../../app/register.tsx';
const DETAIL_PATH = '../../../app/project/[id].tsx';
const STRATEGIES_PATH = '../../../app/project/[id]/strategies.tsx';
const SEARCHFORM_PATH = '../../../app/project/[id]/search-form.tsx';
const RUN_PATH = '../../../app/project/[id]/run.tsx';

function assertImportsFromReactNative(source: string, name: string, file: string): void {
  const importPattern = new RegExp(
    `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]react-native['"]`,
  );
  expect(
    importPattern.test(source),
    `${file} deve importar ${name} de react-native`,
  ).toBe(true);
}

function assertUsesComponent(source: string, name: string, file: string): void {
  expect(source.includes(`<${name}`), `${file} deve renderizar <${name}`).toBe(true);
}

function mapLinesOutsideScrollable(source: string): string[] {
  return source
    .split('\n')
    .filter((line: string): boolean => line.includes('.map('))
    .filter(
      (line: string): boolean => !line.includes('FlatList') && !line.includes('renderItem'),
    );
}

describe('scroll containers (tripwire UAT 11/09/2026)', () => {
  it('projects.tsx importa e usa FlatList de react-native (lista virtualizada)', () => {
    const source: string = readScreen(PROJECTS_PATH);
    assertImportsFromReactNative(source, 'FlatList', 'projects.tsx');
    assertUsesComponent(source, 'FlatList', 'projects.tsx');
    expect(source.includes('keyExtractor'), 'projects.tsx deve ter keyExtractor (id opaco)').toBe(
      true,
    );
    expect(source.includes('renderItem'), 'projects.tsx deve ter renderItem').toBe(true);
  });

  it('login.tsx, register.tsx e project/[id].tsx usam ScrollView', () => {
    const cases: Array<{ path: string; file: string }> = [
      { path: LOGIN_PATH, file: 'login.tsx' },
      { path: REGISTER_PATH, file: 'register.tsx' },
      { path: DETAIL_PATH, file: 'project/[id].tsx' },
    ];
    for (const entry of cases) {
      const source: string = readScreen(entry.path);
      assertImportsFromReactNative(source, 'ScrollView', entry.file);
      assertUsesComponent(source, 'ScrollView', entry.file);
    }
  });

  it('nenhum .map( de lista fora de FlatList/renderItem nas telas', () => {
    const screens: string[] = [
      PROJECTS_PATH,
      LOGIN_PATH,
      REGISTER_PATH,
      DETAIL_PATH,
      STRATEGIES_PATH,
      SEARCHFORM_PATH,
      RUN_PATH,
    ];
    for (const screen of screens) {
      const source: string = readScreen(screen);
      expect(mapLinesOutsideScrollable(source)).toEqual([]);
    }
  });

  it('strategies.tsx importa e usa FlatList de react-native (07-02)', () => {
    const source: string = readScreen(STRATEGIES_PATH);
    assertImportsFromReactNative(source, 'FlatList', 'strategies.tsx');
    assertUsesComponent(source, 'FlatList', 'strategies.tsx');
    expect(source.includes('keyExtractor'), 'strategies.tsx deve ter keyExtractor (id opaco)').toBe(
      true,
    );
    expect(source.includes('renderItem'), 'strategies.tsx deve ter renderItem').toBe(true);
  });

  it('search-form.tsx importa e usa ScrollView de react-native (07-02)', () => {
    const source: string = readScreen(SEARCHFORM_PATH);
    assertImportsFromReactNative(source, 'ScrollView', 'search-form.tsx');
    assertUsesComponent(source, 'ScrollView', 'search-form.tsx');
  });

  it('run.tsx importa e usa ScrollView de react-native (07-03)', () => {
    const source: string = readScreen(RUN_PATH);
    assertImportsFromReactNative(source, 'ScrollView', 'run.tsx');
    assertUsesComponent(source, 'ScrollView', 'run.tsx');
  });
});
