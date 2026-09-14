// apps/lab — testes das primitivas W1 (critérios 4/10/11, sem renderer).
//
// theme.ts é importado direto (sem react-native); os componentes são
// verificados por leitura de fonte (padrão do tripwire scroll-containers):
// slots usados, estados presentes, fechamentos do Sheet, e os greps de
// dev-docs/15 estendidos aos arquivos novos. Sem rede/timers/`any`.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { theme } from '../theme';

function readUi(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const HEX_PATTERN = /#[0-9a-fA-F]{6}/;
const VISUAL_NUMBER_PATTERN = /(fontSize|padding[A-Za-z]*|gap|margin[A-Za-z]*)\s*:\s*[0-9]/;

const NEW_UI_SOURCES: string[] = [
  '../Button.tsx',
  '../Field.tsx',
  '../Card.tsx',
  '../Sheet.tsx',
  '../ScreenHeader.tsx',
  '../ProjectTreeItem.tsx',
  '../Sidebar.tsx',
  '../AppShell.tsx',
  '../shellNav.ts',
  '../../../app/_layout.tsx',
];

describe('theme.ts (critério 10: indireção)', () => {
  it('tem exatamente os 8 slots herdados + 2 novos, nada mais', () => {
    expect(Object.keys(theme.colors).sort()).toEqual([
      'activeHighlight',
      'danger',
      'dangerBorder',
      'dangerSurface',
      'sidebarSurface',
      'skeletonStrong',
      'skeletonWeak',
      'surface',
      'warningBorder',
      'warningSurface',
    ]);
  });

  it('os 2 tokens novos são strings de cor', () => {
    expect(typeof theme.colors.sidebarSurface).toBe('string');
    expect(typeof theme.colors.activeHighlight).toBe('string');
    expect(theme.colors.sidebarSurface.startsWith('#')).toBe(true);
    expect(theme.colors.activeHighlight.startsWith('#')).toBe(true);
  });
});

describe('greps visuais estendidos (critério 10)', () => {
  it('zero hexadecimal fora de theme.ts', () => {
    for (const file of NEW_UI_SOURCES) {
      expect(HEX_PATTERN.test(readUi(file))).toBe(false);
    }
  });

  it('zero medida tipográfica ou de espaçamento literal', () => {
    for (const file of NEW_UI_SOURCES) {
      expect(VISUAL_NUMBER_PATTERN.test(readUi(file))).toBe(false);
    }
  });

  it('todo componente novo referencia slots theme', () => {
    for (const file of NEW_UI_SOURCES) {
      if (file.endsWith('shellNav.ts') || file.endsWith('_layout.tsx')) {
        continue;
      }
      expect(readUi(file).includes('theme.'), `${file} deve usar theme.*`).toBe(true);
    }
  });
});

describe('Button (critério 11: default/pressed/disabled/loading)', () => {
  it('três variantes sem cor própria além da família danger', () => {
    const source: string = readUi('../Button.tsx');
    expect(source.includes("'primary' | 'secondary' | 'danger'")).toBe(true);
    expect(source.includes('theme.colors.dangerSurface')).toBe(true);
    expect(source.includes('theme.colors.dangerBorder')).toBe(true);
  });

  it('pressed engrossa a borda; disabled trava; loading indica com reticência', () => {
    const source: string = readUi('../Button.tsx');
    expect(source.includes('theme.border.thick')).toBe(true);
    expect(source.includes('disabled={inactive}')).toBe(true);
    expect(source.includes('busy: loading')).toBe(true);
    expect(source.includes('…')).toBe(true);
  });
});

describe('Field (estados default/focado/disabled/erro)', () => {
  it('foco, erro e disabled por slot', () => {
    const source: string = readUi('../Field.tsx');
    expect(source.includes('onFocus')).toBe(true);
    expect(source.includes('onBlur')).toBe(true);
    expect(source.includes('theme.border.thick')).toBe(true);
    expect(source.includes('theme.colors.dangerBorder')).toBe(true);
    expect(source.includes('theme.colors.skeletonWeak')).toBe(true);
    expect(source.includes('-error')).toBe(true);
  });
});

describe('Card/ListItem (critério 4: destaque por slot)', () => {
  it('highlighted/active usam activeHighlight; pressed engrossa a borda', () => {
    const source: string = readUi('../Card.tsx');
    expect(source.includes('theme.colors.activeHighlight')).toBe(true);
    expect(source.includes('theme.border.thick')).toBe(true);
    expect(source.includes('ListItem')).toBe(true);
  });
});

describe('Sheet (fecha por x, backdrop e Esc)', () => {
  it('caminhos de fechamento e estrutura presentes', () => {
    const source: string = readUi('../Sheet.tsx');
    expect(source.includes('<Modal')).toBe(true);
    expect(source.includes('sheet-backdrop')).toBe(true);
    expect(source.includes('sheet-close')).toBe(true);
    expect(source.includes('sheet-title')).toBe(true);
    expect(source.includes('Escape')).toBe(true);
    expect(source.includes('onRequestClose')).toBe(true);
  });
});
