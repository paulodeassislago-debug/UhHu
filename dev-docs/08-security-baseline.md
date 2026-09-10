# UhHu! — Baseline de Segurança para DEV Assistido por IA

> **Obrigatório desde o primeiro commit.** Esta é a política operacional do
> desenvolvimento assistido por IA/vibecoding no UhHu!. Ela transforma as lições
> dos vídeos do mano deyvin, consultados no knowledge repo, em gates concretos
> para o CORE e para os apps.
>
> Fontes locais: `Estudos/Knowledge Repo/Temas/Segurança em Vibecoding.md`,
> `Notas/1-seguranca-vibecoding-mano-deyvin.md` e
> `Notas/2-seguranca-vibecoding-prompt-illuminati.md`.

## 1. Regra de ouro

> **Segurança é uma etapa explícita do fluxo, não uma propriedade automática do
> código produzido por IA.**

Código que compila, abre no browser e persiste dados ainda não está aprovado.
Toda mudança precisa passar pelo ciclo:

```text
especificar
  ↓
implementar
  ↓
revisar segurança arquivo por arquivo / linha por linha
  ↓
testar abuso e autorização
  ↓
rodar scanners
  ↓
revisar resultado humano
  ↓
aceitar ou corrigir
```

A IA pode ajudar a auditar, mas não recebe autorização para autoaprovar a própria
correção. O relatório deve vir antes da correção automática; cada correção é
revisada e testada separadamente.

## 2. Cinco falhas que nunca podem passar

### 2.1. Banco ou API sem tranca

- PostgreSQL nunca é exposto diretamente ao frontend ou à Internet.
- Nenhuma UI fala diretamente com banco, storage ou serviço externo.
- O CORE aplica autenticação e autorização no servidor.
- RLS, quando usado, é defesa em profundidade — nunca substitui autorização nos
  casos de uso e repositórios.
- Roles do banco seguem menor privilégio; usuário de migrations é separado do
  usuário de runtime.

### 2.2. Permissão decidida no navegador

- `localStorage`, estado React, headers `Origin`/`Referer` e campos enviados pelo
  cliente nunca definem admin, owner ou permissão.
- Guards de frontend são apenas UX.
- O servidor deriva o ator da sessão e calcula a autorização em cada operação.
- CORS é política de navegador, não mecanismo de autenticação.

### 2.3. IDOR em toda rota que recebe ID

Toda rota que recebe `:id`, `projectId`, `resultId`, `fileId` ou equivalente deve
buscar o recurso já dentro do escopo do ator:

```text
findProjectByIdForActor(projectId, actorContext)
findResultByIdForActor(resultId, actorContext)
```

Nunca usar uma busca genérica por ID e autorizar depois de forma incompleta.

Testes obrigatórios para cada recurso:

- sem autenticação;
- usuário dono;
- usuário diferente tentando o ID;
- ID alterado manualmente na URL/body;
- tentativa via `curl`, sem depender do navegador;
- tentativa em leitura, alteração e exclusão.

Resposta para recurso fora do escopo deve ser `404` ou equivalente que não revele
sua existência.

### 2.4. Segredo exposto

- segredo nunca no frontend, bundle, HTML, código ou resposta da API;
- `.gitignore` não basta: verificar o histórico do Git;
- `.env` nunca é commitado;
- tokens ficam no servidor, com escopo mínimo e rotação;
- refresh tokens de integrações são cifrados em repouso;
- logs e erros são redigidos;
- segredo encontrado → revogar/rotacionar imediatamente, mesmo que tenha sido
  apagado do working tree.

Antes de aceitar uma build web, procurar também por chaves nos artefatos gerados.

### 2.5. Input sem tratamento / XSS

Todo input é hostil até ser validado:

- Zod na fronteira de toda entrada;
- limites de tamanho, cardinalidade, extensão e tempo;
- allowlists quando o domínio permitir;
- queries parametrizadas/ORM, nunca SQL concatenado;
- HTML/Markdown sanitizado antes de persistir ou renderizar;
- evitar renderização de HTML arbitrário;
- `eval`, `new Function` e execução de script enviado pelo usuário proibidos;
- uploads validados por MIME, tamanho, nome, extensão e conteúdo esperado;
- proteção contra path traversal e SSRF em URLs externas;
- saída codificada conforme o contexto (HTML, atributo, URL, JSON).

## 3. Regras de arquitetura do UhHu

- Regra de negócio fica no CORE/backend, nunca somente na UI.
- O frontend é cliente; não conhece credenciais de serviços externos.
- Toda capability declara ator, escopo, efeitos colaterais e idempotência.
- Toda operação com ID verifica owner/workspace no servidor.
- `Origin` e `Referer` podem ser úteis para CORS/telemetria, nunca para decidir
  autorização.
- Sessões e IDs sensíveis são gerados com fonte criptograficamente segura; nunca
  `Math.random` para tokens, sessões, OTPs ou códigos de recuperação.
- Webhooks verificam assinatura, timestamp e replay antes de alterar dados.
- Logs não recebem tokens, cookies, senhas, cabeçalhos Authorization ou URLs
  assinadas.
- Postgres dev e prod são separados; dados de produção não entram em dev sem
  sanitização/autorização.

## 4. Auditoria de código gerado por IA

Toda alteração relevante deve ser acompanhada de uma auditoria adversarial
explícita. Usar o seguinte roteiro como prompt-base, adaptado ao módulo:

```text
Audite este repositório como um revisor de segurança adversarial.

Não corrija nada ainda. Não gere patch.

Procure, arquivo por arquivo e linha por linha:
1. autorização ausente ou decorativa;
2. IDOR em qualquer rota/consulta por ID;
3. confiança em localStorage, Origin, Referer ou campos do cliente;
4. segredo em código, bundle, logs ou histórico Git;
5. input não validado, XSS, HTML perigoso, upload inseguro, SSRF e path traversal;
6. sessões, tokens, OTPs, webhooks e rate limits frágeis;
7. SQL/command injection e permissões excessivas;
8. vazamento entre usuários/workspaces.

Para cada achado, informe:
- severidade (crítica/alta/média/baixa/informativa);
- arquivo e linha;
- pré-condição;
- passo de exploração somente no ambiente local/staging autorizado;
- impacto;
- controle ausente;
- teste que provaria a correção.

Liste também os controles que foram verificados e funcionam.
Não considere um guard de frontend como autorização.
Não considere CORS como autenticação.
Não altere arquivos até que o relatório seja revisado.
```

A auditoria por IA é uma camada auxiliar. O resultado precisa ser confrontado
com testes e revisão humana; não é certificado de segurança.

## 5. Ferramentas e gates automatizados

### A cada mudança / pre-commit

- typecheck e lint TypeScript;
- testes unitários e de autorização;
- teste de isolamento/IDOR dos casos de uso alterados;
- secret scan no working tree e staged files;
- SAST para JavaScript/TypeScript;
- revisão de dependências novas e permissões solicitadas.

### No CI

- secret scan do repositório inteiro **e do histórico Git** (Gitleaks);
- SAST para JS/TS (OpenGrep ou ferramenta equivalente);
- `pnpm audit` para dependências de produção;
- testes de integração contra PostgreSQL;
- testes automatizados de autenticação, owner/workspace e IDOR;
- scan do bundle frontend para segredos;
- build reproduzível sem credenciais embutidas;
- falha do pipeline em segredo confirmado ou achado crítico/alto sem aceite
  explícito e prazo.

### Em staging próprio

- OWASP ZAP baseline contra o ambiente de staging do UhHu;
- testes manuais com browser e `curl` (IDs alterados, headers adulterados,
  usuário trocado, sessão ausente);
- validação de headers, CORS, cookies, rate limit e mensagens de erro;
- teste de upload, HTML/Markdown, URLs externas e webhooks quando existirem.

Bandit não é ferramenta principal do UhHu porque o CORE é TypeScript/Node; se
um componente Python for criado, Bandit entra no gate desse componente.

## 6. Ética e limite de auditoria

- Auditar somente código, máquina, ambiente e staging sob nossa posse ou com
  autorização explícita.
- Repositório open-source pode ser estudado dentro da licença, mas isso não
  autoriza atacar sua produção.
- Nunca executar scanner ativo contra produção de terceiros.
- Pentest real exige permissão prévia e escopo documentado.
- Achados em projeto externo devem ser reportados pelo canal apropriado, como
  issue ou contato de segurança — não explorados.

## 7. Gate de merge/release

Nenhuma mudança entra em `main`/produção sem:

- [ ] mudança mapeada para uma capability/módulo;
- [ ] autorização verificada no servidor;
- [ ] teste de usuário dono e usuário estranho;
- [ ] teste com ID adulterado quando houver identificador;
- [ ] inputs validados e limites definidos;
- [ ] secret scan atual + histórico sem segredo não tratado;
- [ ] SAST e dependency audit executados;
- [ ] logs/erros revisados quanto a vazamento;
- [ ] teste de integração PostgreSQL;
- [ ] staging próprio verificado com ZAP quando a superfície justificar;
- [ ] achados de alta/critidade corrigidos ou aceitos formalmente;
- [ ] revisão humana do relatório produzido pela IA.

## 8. Relacionamento com o UhHu

- Requisitos de segurança da API: `05-infra.md` e `UhHu_Security_Notes.md` no vault.
- Contrato de autorização/capabilities: `07-core-contract.md`.
- Schema e multiusuário: `03-lab-spec-v1.md`.
- Legado usado somente como referência: `06-legado-planner.md`.
- Fonte conceitual no knowledge repo: `Segurança em Vibecoding`.
