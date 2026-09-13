// apps/lab — helpers puros da tabela de comparação (09-04 task 1, UI-27/UI-28, §14-1).
//
// Três funções sobre o CompareDTO (definição única em @uhhu/contracts):
// - `mostInclusive(totals, order)`: id com maior total; empate devolve o
//   primeiro em `order`; vazio ou sem valor válido devolve null. IDs presentes
//   em `totals` mas fora de `order` são ignorados (a ordem pedida manda).
// - `pairOverlap(pairwiseOverlap, a, b)`: tenta `${a}|${b}` e depois
//   `${b}|${a}`; ausente ou inválido devolve 0.
// - `sortedYearRows(yearHistogram)`: anos numéricos em ordem crescente e o
//   bucket `desconhecido` sempre por último; histograma vazio devolve [].
// A vencedora é o máximo de `totals` — cálculo direto do DTO, sem outra
// classificação. Tipos via primitivos; sem tipo proibido.

export interface YearRow {
  bucket: string;
  count: number;
}

export function mostInclusive(totals: Record<string, number>, order: string[]): string | null {
  let best: string | null = null;
  let bestTotal = Number.NEGATIVE_INFINITY;
  for (const id of order) {
    const value: unknown = totals[id];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (best === null || value > bestTotal) {
      best = id;
      bestTotal = value;
    }
  }
  return best;
}

export function pairOverlap(
  pairwiseOverlap: Record<string, number>,
  a: string,
  b: string,
): number {
  const direct: unknown = pairwiseOverlap[`${a}|${b}`];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return direct;
  }
  const reversed: unknown = pairwiseOverlap[`${b}|${a}`];
  if (typeof reversed === 'number' && Number.isFinite(reversed)) {
    return reversed;
  }
  return 0;
}

function isNumericBucket(key: string): boolean {
  const parsed: number = Number.parseInt(key, 10);
  return Number.isSafeInteger(parsed) && String(parsed) === key;
}

export function sortedYearRows(yearHistogram: Record<string, number>): YearRow[] {
  const numeric: YearRow[] = [];
  const named: YearRow[] = [];
  let unknown: YearRow | null = null;
  for (const key of Object.keys(yearHistogram)) {
    const value: unknown = yearHistogram[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (key === 'desconhecido') {
      unknown = { bucket: key, count: value };
      continue;
    }
    if (isNumericBucket(key)) {
      numeric.push({ bucket: key, count: value });
    } else {
      named.push({ bucket: key, count: value });
    }
  }
  numeric.sort((x: YearRow, y: YearRow): number => {
    const nx: number = Number.parseInt(x.bucket, 10);
    const ny: number = Number.parseInt(y.bucket, 10);
    return nx - ny;
  });
  named.sort((x: YearRow, y: YearRow): number => {
    if (x.bucket < y.bucket) {
      return -1;
    }
    if (x.bucket > y.bucket) {
      return 1;
    }
    return 0;
  });
  const out: YearRow[] = [];
  for (const row of numeric) {
    out.push(row);
  }
  for (const row of named) {
    out.push(row);
  }
  if (unknown !== null) {
    out.push(unknown);
  }
  return out;
}
