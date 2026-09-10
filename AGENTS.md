# UhHu! — Instruções para agentes de desenvolvimento

> Para iniciar uma sessão nova no code-server, use também `init-prompt.md`. Ele
> organiza o onboarding e complementa estas regras; não as substitui.

## Ordem de leitura

Antes de alterar código, leia:

1. `dev-docs/README.md`
2. `dev-docs/01-arquitetura.md`
3. `dev-docs/02-decisoes.md`
4. `dev-docs/07-core-contract.md`
5. `dev-docs/08-security-baseline.md`
6. a spec do módulo afetado (`03-lab-spec-v1.md` para o Lab)

O vault em `~/vault/Projetos/UhHu/` contém a documentação completa e é a fonte
da verdade quando houver conflito. Não alterar o vault diretamente: usar o
workflow documentado na skill `uhhu-project`.

## Arquitetura obrigatória

- O backend inicial é o **UhHu CORE compartilhado, modular e headless**.
- Não criar backend independente para Lab, Lib, Note, Plan ou Prof sem decisão
  arquitetural explícita.
- REST, CLI e MCP devem chamar os mesmos casos de uso; não duplicar regra de
  negócio por superfície.
- PostgreSQL self-hosted é a persistência canônica. SQLite somente para cache,
  local/offline/desktop; nunca banco oficial do servidor.
- Nenhuma UI acessa PostgreSQL, storage ou serviço externo diretamente.
- Cada módulo é dono de suas regras/tabelas; acesso entre módulos ocorre por
  contratos, casos de uso ou eventos explícitos.
- Supabase não faz parte da arquitetura nova. O legado é material de pesquisa.

## Frontend — regras obrigatórias

- O frontend deve ser escrito em TypeScript com `strict` habilitado; tipos não são
  decoração, são parte dos contratos que mantêm a suite modular.
- Tipos de domínio, entidades, DTOs, respostas da API, erros e capacidades devem
  ter uma única definição compartilhada nos pacotes globais de contratos do
  monorepo. Cada app não pode criar cópias locais desses tipos.
- Componentes e módulos devem importar os tipos compartilhados usando `import
  type` quando aplicável. Um tipo específico de apresentação só pode existir no
  frontend quando for realmente uma view model e tiver mapeamento explícito para
  o tipo de domínio/contrato.
- O frontend não pode inventar ou duplicar o contrato da API. Schemas/contratos
  compartilhados são a fonte; a validação em runtime deve ocorrer nas fronteiras
  apropriadas e os mapeamentos devem ser explícitos.
- **`any` é proibido, sem exceção**, no código de produção, testes, mocks e
  utilitários TypeScript: não usar `any`, `as any`, `Array<any>`, `@ts-ignore` ou
  equivalentes para esconder incompatibilidades. Em dados desconhecidos, usar
  `unknown`, validação e narrowing; em casos genéricos, usar tipos/generics
  precisos.
- Não enfraquecer o `tsconfig` para fazer o código compilar. Tipos ausentes de
  dependências devem ser corrigidos com declaração/adaptador tipado e isolado,
  nunca com `any`.
- Regras de negócio, autorização, ownership e isolamento continuam no CORE; o
  frontend só fornece feedback/UX e não é uma fronteira de segurança.
- O frontend não acessa PostgreSQL, storage ou integrações externas diretamente;
  usa as superfícies e contratos do CORE.

## Segurança — gate desde o primeiro commit

- Regra de negócio e autorização ficam no backend; guards de frontend são apenas
  UX.
- Nunca confiar em `localStorage`, `Origin`, `Referer` ou campos do cliente para
  definir privilégio, owner ou identidade.
- Toda rota/operação com ID deve verificar o recurso dentro do owner/workspace
  do ator. Testar sempre usuário dono, usuário estranho e ID adulterado via
  `curl`.
- Todo input é hostil: validar com Zod, limitar, parametrizar queries, sanitizar
  HTML/Markdown e validar uploads/URLs.
- Segredos nunca vão para frontend, bundle, código, Git, logs ou respostas.
  Gitleaks deve verificar working tree e histórico.
- Tokens OAuth são cifrados em repouso; logs não contêm cookies, Authorization,
  senhas ou URLs assinadas.
- CORS não é autenticação; PostgreSQL não é público; RLS, se usado, é defesa em
  profundidade e não substitui autorização no CORE.
- Não usar `Math.random` para sessão, OTP ou token; não usar `eval`/`new Function`.
- Webhooks exigem assinatura, timestamp e proteção contra replay.

## Auditoria obrigatória

Depois de implementar, antes de corrigir automaticamente, faça uma auditoria
adversarial arquivo por arquivo/linha por linha cobrindo: autorização decorativa,
IDOR, confiança no navegador, segredos, XSS/input/upload/SSRF, sessões, webhooks,
rate limit, SQL/command injection e isolamento entre usuários.

Rode os gates apropriados:

- typecheck, lint e testes;
- testes de autorização/IDOR;
- Gitleaks no repositório e histórico;
- OpenGrep/SAST para JS/TS;
- `pnpm audit`;
- integração PostgreSQL;
- OWASP ZAP somente contra staging/local sob controle do projeto.

Não executar auditoria ativa contra produção de terceiros. Achados devem ser
corrigidos, testados e revisados por humano; não aceitar código só porque compila
ou funciona no navegador.

## Escopo do trabalho

- Não iniciar outro app enquanto o contrato e o slice atual não autorizarem.
- Não modificar decisões do CORE silenciosamente; se uma descoberta exigir
  mudança, atualizar primeiro a documentação/ADR correspondente.
- Antes de declarar concluído: executar testes reais e reportar os resultados.
