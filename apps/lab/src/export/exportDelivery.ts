// apps/lab — entrega do arquivo exportado por plataforma (09-03 task 1, UI-25/UI-26, D-22).
//
// Web: Blob + URL.createObjectURL + anchor com `download` (zero dep nova).
// Nativo: Share built-in de react-native (zero pacote extra).
// O conteúdo raw verbatim vira arquivo local sem parse e sem HTML injetado:
// o anchor recebe href/download por propriedade, nunca por string de markup.
// Nome seguro via slug ASCII próprio + ext de allowlist; mime de mapa fixo.
// Vazio detectável antes do request (D-23, BibTeX vazio avisa em vez de sair
// arquivo sem item). Guards são UX; autorização real continua no CORE.

import { Platform, Share } from 'react-native';
import type { ExportFormat } from '../api/lab';

export type ExportFileExt = 'csv' | 'bib' | 'json';

export function mimeForFormat(format: ExportFormat): string {
  if (format === 'bibtex') {
    return 'application/x-bibtex; charset=utf-8';
  }
  if (format === 'json') {
    return 'application/json; charset=utf-8';
  }
  return 'text/csv; charset=utf-8';
}

// Faixa de diacríticos combinantes (numérica para não embutir marca invisível
// no fonte): NFKD separa base + marca; a marca cai fora aqui.
function stripDiacritics(input: string): string {
  const decomposed: string = input.normalize('NFKD');
  let out = '';
  for (const ch of decomposed) {
    const code: number | undefined = ch.codePointAt(0);
    if (code === undefined) {
      continue;
    }
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    out += ch;
  }
  return out;
}

function slugifyAscii(input: string): string {
  const lowered: string = stripDiacritics(input).toLowerCase();
  const dashed: string = lowered.replace(/[^a-z0-9]+/g, '-');
  const trimmed: string = dashed.replace(/^-+|-+$/g, '');
  const sliced: string = trimmed.slice(0, 60);
  const clean: string = sliced.replace(/-+$/g, '');
  return clean.length > 0 ? clean : 'projeto';
}

export function buildExportFilename(
  projectTitle: string,
  dateYYYYMMDD: string,
  ext: ExportFileExt,
): string {
  return `corpus-${slugifyAscii(projectTitle)}-${dateYYYYMMDD}.${ext}`;
}

// O formato segue no parâmetro para o chamador montar o aviso certo; a regra
// de vazio independe do formato: count zero ou corpo em branco = vazio.
export function isExportEmpty(format: ExportFormat, content: string, count: number): boolean {
  if (count === 0) {
    return true;
  }
  if (content.trim().length === 0) {
    return true;
  }
  return false;
}

export async function downloadExportFile(
  content: string,
  filename: string,
  mime: string,
): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mime });
    const url: string = URL.createObjectURL(blob);
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ message: content, title: filename });
}
