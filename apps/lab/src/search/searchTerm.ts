// apps/lab — composição linhas AND/OR/NOT → termo pass-through do contrato (D-09, 07-02 task 1).
//
// A UI monta a busca em linhas (SEM expressão livre — D-09) e este helper compõe
// o único `term` do contrato (D-31: o Core repassa sem tradução estruturada; NENHUM
// campo novo no contrato — FASE 7 NÃO MUDA CONTRATO).
// Regra de composição (decisão Paulo 12/09/2026 DEFINITIVA, 08-09 — fidelidade
// ao site, SEM auto-aspas): cada linha {text, op} onde op é o operador ANTES da
// linha (o op da primeira linha é ignorado); o texto vai trimado e CRU —
// multi-palavra NÃO é envolvida em `"..."`; aspas digitadas explicitamente
// pelo usuário são PRESERVADAS verbatim. Juntar a partir da 2ª linha com
// ` AND `/` OR `/` NOT `. A validação (tamanho 1..500 + aspas balanceadas) é
// feita pelo chamador via `searchTermSchema.parse` — este arquivo nunca chama
// a API. Zero `any`.

export type TermOperator = 'AND' | 'OR' | 'NOT';

export interface TermRow {
  text: string;
  op: TermOperator;
}

export function buildSearchTerm(rows: TermRow[]): string {
  const parts: TermRow[] = [];
  for (const row of rows) {
    const text = row.text.trim();
    if (text.length === 0) {
      continue;
    }
    parts.push({ text, op: row.op });
  }
  const first: TermRow | undefined = parts[0];
  if (first === undefined) {
    return '';
  }
  let out = first.text;
  for (let i = 1; i < parts.length; i += 1) {
    const part: TermRow | undefined = parts[i];
    if (part === undefined) {
      continue;
    }
    out += ` ${part.op} ${part.text}`;
  }
  return out;
}

function isOperatorToken(token: string): token is TermOperator {
  return token === 'AND' || token === 'OR' || token === 'NOT';
}

// splitSearchTerm: inverso aproximado de buildSearchTerm para edição (o form
// reabre o termo salvo em linhas). Quebra em ` AND `/` OR `/` NOT ` fora de
// aspas duplas (frase exata `"A AND B"` nunca é dividida por dentro); a primeira
// linha recebe op 'AND' (ignorado pelo build); demais carregam o op capturado.
// Entrada vazia → uma linha vazia (mínimo 1 do formulário).
export function splitSearchTerm(term: string): TermRow[] {
  const trimmed = term.trim();
  if (trimmed.length === 0) {
    return [{ text: '', op: 'AND' }];
  }
  const rows: TermRow[] = [];
  let current = '';
  let pendingOp: TermOperator = 'AND';
  let inQuotes = false;
  let i = 0;
  while (i < trimmed.length) {
    const ch: string | undefined = trimmed[i];
    if (ch === undefined) {
      break;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      i += 1;
      continue;
    }
    if (!inQuotes && (ch === ' ' || ch === '\t')) {
      let j = i;
      while (j < trimmed.length) {
        const c: string | undefined = trimmed[j];
        if (c !== ' ' && c !== '\t') {
          break;
        }
        j += 1;
      }
      let k = j;
      while (k < trimmed.length) {
        const c: string | undefined = trimmed[k];
        if (c === undefined || c === ' ' || c === '\t') {
          break;
        }
        k += 1;
      }
      const token: string = trimmed.slice(j, k);
      let m = k;
      while (m < trimmed.length) {
        const c: string | undefined = trimmed[m];
        if (c !== ' ' && c !== '\t') {
          break;
        }
        m += 1;
      }
      if (isOperatorToken(token) && m > k && m < trimmed.length) {
        rows.push({ text: current.trim(), op: pendingOp });
        pendingOp = token;
        current = '';
        i = m;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  rows.push({ text: current.trim(), op: pendingOp });
  const nonEmpty: TermRow[] = [];
  for (const row of rows) {
    if (row.text.length > 0) {
      nonEmpty.push(row);
    }
  }
  if (nonEmpty.length === 0) {
    return [{ text: '', op: 'AND' }];
  }
  return nonEmpty;
}
