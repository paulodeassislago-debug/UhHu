// apps/lab — testes puros da navegação do shell W1 (sem renderer no repo).
//
// Cobre shellNav.ts por import direto: breakpoint, dimensões de layout,
// visibilidade do shell, mapa rota→título, seção ativa, id do projeto atual,
// catálogo de seções (ordem do mockup, rótulo Buscas, sem quinto item).
// Sem rede/timers/`any`.

import { describe, expect, it } from 'vitest';
import {
  DRAWER_MAX_WIDTH,
  SHELL_BREAKPOINT,
  SHELL_SECTIONS,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_ROW_MIN_HEIGHT,
  SIDEBAR_SUBROW_MIN_HEIGHT,
  isShellRoute,
  projectIdForRoute,
  sectionForSegments,
  sectionRoute,
  titleForSegments,
} from '../shellNav';

describe('constantes de layout do shell (spec §3/§6)', () => {
  it('corte paisagem/drawer em largura 900', () => {
    expect(SHELL_BREAKPOINT).toBe(900);
  });

  it('alvo de toque 44 nas linhas e 36 nos sub-itens', () => {
    expect(SIDEBAR_ROW_MIN_HEIGHT).toBe(44);
    expect(SIDEBAR_SUBROW_MIN_HEIGHT).toBe(36);
  });

  it('coluna entre 200 e 280; drawer com teto 280', () => {
    expect(SIDEBAR_MIN_WIDTH).toBe(200);
    expect(SIDEBAR_MAX_WIDTH).toBe(280);
    expect(DRAWER_MAX_WIDTH).toBe(280);
  });

  it('trilha recolhida com largura que comporta o hambúrguer', () => {
    expect(SIDEBAR_COLLAPSED_WIDTH).toBe(56);
  });
});

describe('isShellRoute (critério 1)', () => {
  it('ausente em índice, login e register', () => {
    expect(isShellRoute([])).toBe(false);
    expect(isShellRoute(['login'])).toBe(false);
    expect(isShellRoute(['register'])).toBe(false);
  });

  it('presente nas rotas internas', () => {
    expect(isShellRoute(['projects'])).toBe(true);
    expect(isShellRoute(['project', '[id]'])).toBe(true);
    expect(isShellRoute(['project', '[id]', 'strategies'])).toBe(true);
    expect(isShellRoute(['project', '[id]', 'corpus'])).toBe(true);
  });
});

describe('titleForSegments (critério 3)', () => {
  it('mapeia cada rota ao título visível', () => {
    expect(titleForSegments(['projects'])).toBe('Meus Projetos');
    expect(titleForSegments(['project', '[id]'])).toBe('Projeto');
    expect(titleForSegments(['project', '[id]', 'strategies'])).toBe('Buscas');
    expect(titleForSegments(['project', '[id]', 'search-form'])).toBe('Buscar');
    expect(titleForSegments(['project', '[id]', 'run'])).toBe('Execução');
    expect(titleForSegments(['project', '[id]', 'results'])).toBe('Resultados');
    expect(titleForSegments(['project', '[id]', 'result'])).toBe('Ficha');
    expect(titleForSegments(['project', '[id]', 'corpus'])).toBe('Corpus');
    expect(titleForSegments(['project', '[id]', 'compare'])).toBe('Comparação');
  });

  it('rota desconhecida cai em UhHU Lab', () => {
    expect(titleForSegments([])).toBe('UhHU Lab');
    expect(titleForSegments(['login'])).toBe('UhHU Lab');
    expect(titleForSegments(['project', '[id]', 'nope'])).toBe('Projeto');
  });
});

describe('sectionForSegments (sub-item ativo)', () => {
  it('hub destaca Especificações; seções destacam a própria', () => {
    expect(sectionForSegments(['project', '[id]'])).toBe('specs');
    expect(sectionForSegments(['project', '[id]', 'strategies'])).toBe('buscas');
    expect(sectionForSegments(['project', '[id]', 'corpus'])).toBe('corpus');
    expect(sectionForSegments(['project', '[id]', 'compare'])).toBe('compare');
  });

  it('fluxo e fora do projeto não destacam nenhum', () => {
    expect(sectionForSegments(['project', '[id]', 'run'])).toBe(null);
    expect(sectionForSegments(['project', '[id]', 'results'])).toBe(null);
    expect(sectionForSegments(['projects'])).toBe(null);
    expect(sectionForSegments([])).toBe(null);
  });
});

describe('projectIdForRoute (projeto atual)', () => {
  it('extrai o id sob /project', () => {
    expect(projectIdForRoute(['project', '[id]'], { id: 'abc' })).toBe('abc');
    expect(projectIdForRoute(['project', '[id]', 'corpus'], { id: 'abc' })).toBe('abc');
  });

  it('nulo fora do projeto ou sem id válido', () => {
    expect(projectIdForRoute(['projects'], { id: 'abc' })).toBe(null);
    expect(projectIdForRoute(['project', '[id]'], {})).toBe(null);
    expect(projectIdForRoute(['project', '[id]'], { id: '' })).toBe(null);
    expect(projectIdForRoute(['project', '[id]'], { id: ['a', 'b'] })).toBe(null);
  });
});

describe('SHELL_SECTIONS (critério 5)', () => {
  it('ordem do mockup com Comparação por último', () => {
    expect(SHELL_SECTIONS.map((section) => section.key)).toEqual([
      'specs',
      'buscas',
      'corpus',
      'compare',
    ]);
  });

  it('rótulo Buscas já vale; arquivo segue strategies até a W3', () => {
    const buscas = SHELL_SECTIONS.find((section) => section.key === 'buscas');
    expect(buscas?.label).toBe('Buscas');
    expect(buscas?.route).toBe('/project/[id]/strategies');
  });

  it('quatro itens, sem quinto', () => {
    expect(SHELL_SECTIONS).toHaveLength(4);
  });

  it('sectionRoute resolve chave→rota e nulo no desconhecido', () => {
    expect(sectionRoute('corpus')).toBe('/project/[id]/corpus');
    expect(sectionRoute('specs')).toBe('/project/[id]');
    expect(sectionRoute('nope')).toBe(null);
  });
});
