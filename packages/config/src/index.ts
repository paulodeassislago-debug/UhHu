// packages/config — dono da configuracao e resolucao de segredos.
// Re-exporta o env validado; consumidores importam daqui, nunca de './env.js'
// direto, e nunca recriam validacao de ambiente nos pacotes.

export { env, type AppEnv } from './env.js';
