// apps/lab — Metro com suporte a symlinks do pnpm workspace.
//
// `.npmrc` local usa `node-linker=hoisted` + `symlink=true`; aqui o default do
// Expo já resolve symlinks do workspace (@uhhu/contracts). Sem customização
// além do default — EAS/store fora do escopo (D-05).
/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
