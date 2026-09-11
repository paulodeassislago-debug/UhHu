#!/usr/bin/env node
// apps/cli — wrapper do bin `uhhu` (D-66: bin via pnpm, sem build).
//
// O `bin` aponta para este arquivo JS puro (5 linhas uteis): o pnpm cria um
// shim node que executa .mjs nativamente, e daqui repassamos o argv para
// `tsx ../src/uhhu.ts`. Um bin .ts direto nao roda sob node puro — por isso
// o wrapper existe. Resolve o binario `tsx` em node_modules/.bin (pacote,
// app ou raiz do workspace) com fallback para `tsx` no PATH.
/* global process: readonly */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'uhhu.ts');

const candidates = [
  join(here, '..', 'node_modules', '.bin', 'tsx'),
  join(here, '..', '..', 'node_modules', '.bin', 'tsx'),
  join(here, '..', '..', '..', 'node_modules', '.bin', 'tsx'),
];

let tsxBin = 'tsx';
for (const candidate of candidates) {
  if (existsSync(candidate)) {
    tsxBin = candidate;
    break;
  }
}

const child = spawn(tsxBin, [entry, ...process.argv.slice(2)], { stdio: 'inherit' });
child.on('error', (err) => {
  process.stderr.write(`uhhu: falha ao iniciar (${err.message})\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal !== null) {
    process.stderr.write(`uhhu: terminado por sinal ${signal}\n`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
