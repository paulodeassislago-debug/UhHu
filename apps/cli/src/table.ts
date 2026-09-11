// apps/cli — saida humana (tabela) + JSON puro para scripts (D-65).
//
// `printTable` alinha colunas com padEnd, sem cor e sem dependencia externa.
// `printJson` sai JSON puro com 2 espacos (sem prefixo humano) para `--json`.

export function printTable(headers: string[], rows: string[][]): void {
  const widths: number[] = headers.map((header, index) => {
    let max = header.length;
    for (const row of rows) {
      const cell = row[index] ?? '';
      if (cell.length > max) {
        max = cell.length;
      }
    }
    return max;
  });
  const render = (cells: string[]): string => {
    const padded = cells.map((cell, index) => {
      const width = widths[index] ?? 0;
      return (cell ?? '').padEnd(width);
    });
    return padded.join('  ').trimEnd();
  };
  console.log(render(headers));
  for (const row of rows) {
    console.log(render(row));
  }
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
