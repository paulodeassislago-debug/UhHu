// apps/lab — contadores de projeto (07-01 task 2).
//
// `formatCorpusCount(itemCount, hasMore)`: formata o número vivo da aba Corpus.
// Sem total no servidor (GET corpus retorna { items, page } sem total); a
// contagem exibida é items.length (+ "+" se hasMore). Erro do contador nunca
// quebra o cabeçalho (chamador omite o número).

export function formatCorpusCount(itemCount: number, hasMore: boolean): string {
  const safeCount = Number.isFinite(itemCount) && itemCount >= 0 ? Math.floor(itemCount) : 0;
  return hasMore ? `${safeCount}+` : `${safeCount}`;
}
