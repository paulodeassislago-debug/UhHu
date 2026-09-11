// apps/lab — Metro com suporte a symlinks do pnpm workspace + TS NodeNext.
//
// `.npmrc` local usa `node-linker=hoisted` + `symlink=true`; aqui o default do
// Expo já resolve symlinks do workspace (@uhhu/contracts). Customização única:
// mapear `./x.js` → `./x` quando o importador é TS do workspace — os pacotes
// `@uhhu/*` usam `moduleResolution: NodeNext` (sufixo `.js` obrigatório no
// fonte), mas o Metro não resolve `.js`→`.ts` sozinho e quebra o bundle web
// assim que o app importa os contracts (06-03). Sem isso, `expo export`
// falha com "Unable to resolve module ./errors.js". EAS/store fora (D-05).
/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = typeof defaultResolveRequest === 'function'
    ? defaultResolveRequest.bind(config.resolver)
    : context.resolveRequest;
  if (typeof moduleName === 'string' && moduleName.endsWith('.js')) {
    const stripped = moduleName.slice(0, -'.js'.length);
    try {
      return resolve({ ...context }, stripped, platform);
    } catch {
      // cai para a resolução padrão abaixo (erro original preservado)
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
