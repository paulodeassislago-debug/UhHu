// apps/lab — testes da entrega de export por plataforma (09-03 task 1, UI-25/UI-26, D-22/D-23).
//
// Cobre: 3 mimes fixos; slug ASCII sem travessia nem aspas;
// vazio com count zero; cheio com corpo e count.
// Sem rede; react-native sob mock (Platform+Share nunca saem do mock).

import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Share: { share: vi.fn() },
}));

import { buildExportFilename, isExportEmpty, mimeForFormat } from '../exportDelivery';

describe('mimeForFormat fixo por formato', () => {
  it('csv usa text/csv com utf-8', () => {
    expect(mimeForFormat('csv')).toBe('text/csv; charset=utf-8');
  });

  it('bibtex usa application/x-bibtex com utf-8', () => {
    expect(mimeForFormat('bibtex')).toBe('application/x-bibtex; charset=utf-8');
  });

  it('json usa application/json com utf-8', () => {
    expect(mimeForFormat('json')).toBe('application/json; charset=utf-8');
  });
});

describe('buildExportFilename slug seguro', () => {
  it('slug sem travessia nem aspas', () => {
    const filename: string = buildExportFilename('São Paulo "../../etc"', '20260913', 'csv');
    expect(filename).toBe('corpus-sao-paulo-etc-20260913.csv');
    expect(filename.includes('..')).toBe(false);
    expect(filename.includes('/')).toBe(false);
    expect(filename.includes('"')).toBe(false);
  });
});

describe('isExportEmpty antes do request', () => {
  it('vazio com count zero', () => {
    expect(isExportEmpty('bibtex', '', 0)).toBe(true);
    expect(isExportEmpty('csv', 'titulo,ano\n', 0)).toBe(true);
  });

  it('cheio com corpo e count', () => {
    expect(isExportEmpty('bibtex', '@mastersthesis{chave,\n title={T}\n}', 1)).toBe(false);
    expect(isExportEmpty('json', '{"items":[]}', 2)).toBe(false);
  });
});
