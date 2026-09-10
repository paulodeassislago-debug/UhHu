ADR-008 — Multi-usuário no v1 + Ambientes Dev/Prod (persistência revisada)

Projeto: UhHu!
Produto: UhHu! Lab (primeiro produto)
Fase: Fase 0/1 — Fundação e decisões
Status: Aceito; persistência revisada por ADR-009
Data: 06/09/2026
Tipo: Decisão de arquitetura e infraestrutura
Relacionados: [[ADR006 - Researcher Primeiro Produto]] · [[ADR003 - Core Stack]] · [[ADR009 - Core Compartilhado Modular e PostgreSQL]] · [[UhHu_Security_Notes]] · [[UhHu_Deployment_Notes]] · [[UhHu_Researcher_Jornada_de_Uso]] · [[ADR007 - Visao de Produto Hub IA de Pesquisa]]

1. Contexto

1.1. Em 06/09/2026, Paulo decidiu: **(a)** o Researcher nasce **multi-usuário**, porque pretende compartilhar a versão beta com colegas para validação; **(b)** desenvolvimento e produção começam **ambos na VPS, em ambientes distintos**; **(c)** o app em produção segue **versionamento em git**; **(d)** o banco de dados é **separado entre dev e prod desde o início**.

1.2. Isso inverte duas premissas anteriores:
- [[UhHu_Security_Notes]] §2: autenticação por **owner key única de instalação** (dono único, exibida uma vez). Multi-tenant era "futuro, porta aberta, não implementado".
- [[ADR006 - Researcher Primeiro Produto]] §6: autenticação single-user vs multi-era **pendência em aberto**; ADR-003 previa "single-instance; caminho multi-usuário futuro não fechado".

1.3. Premissas assumidas neste ADR (a validar com Paulo na próxima sessão — não houve resposta no momento da escrita):
- **P1 — Escopo do compartilhamento**: cada colega cria conta própria e valida a jornada com os próprios projetos/buscas/corpus; **isolamento total** (um usuário = um espaço). Colaboração no mesmo projeto (permissões compartilhadas) **fora do v1**.
- **P2 — Registro**: acesso por **token de convite** gerado pelo dono da instância (beta fechada; sem registro aberto).

2. Decisão

2.1. **Multi-usuário desde o v1**: contas por e-mail + senha, sessão autenticada, e **isolamento por `ownerId`** em todas as entidades (Project, Search, SearchRun, Result, DedupGroup, decisões de elegibilidade, Tags). Toda rota filtra por dono; nenhum dado de um usuário é visível a outro (modelo de ameaças: IDOR é a principal — testes de aceitação cobrem isso).

2.2. **Autenticação**: e-mail + senha com hash forte (argon2), sessão em cookie httpOnly (ou JWT assinado), rate limiting no login/registro, CORS restrito à origem do frontend. A **owner key de instalação deixa de ser a identidade dos usuários** e pode permanecer como credencial de operação/scripts (admin da instância). OAuth/SSO de identidade permanece evolução futura (ADR-005 §5.1), sem fechar porta no schema.

2.3. **Ambientes dev e prod na VPS, separados desde o início**:
- Diretórios/containers/compose distintos (ex.: `~/uhhu/dev` e `~/uhhu/prod`), **portas distintas** (prod atrás de nginx + TLS no subdomínio; dev exposto apenas localmente/tailnet, nunca em 80/443);
- **Arquivos `.env` separados**; segredos do prod com permissão 600 e nunca commitados;
- **Bancos PostgreSQL separados** (banco/instância, volumes e credenciais distintos para dev e prod), nunca o mesmo banco ou volume.

2.4. **Git como fonte da verdade**: o app em produção segue versionamento em git (repositório privado); deploy = pull + build + restart do container a partir do repo; CI recomendado para testes de contrato dos adapters (BDTD/CAPES) e migrações.

2.5. **Persistência (revisada pelo ADR-009)**: PostgreSQL self-hosted é o banco canônico do UhHu! CORE e da suite, fora do Supabase. A escolha atende ao multiusuário, à concorrência entre API/workers e à integração entre Lab, Lib, Note, Plan e Prof. Migrations são versionadas no monorepo e testadas contra PostgreSQL. SQLite fica reservado a cache, operação offline, CLI/local ou dados temporários; não é fonte de verdade do servidor.

3. Consequências positivas

- Validação real de multi-tenant cedo: compartilhar a beta com colegas produz retorno de uso genuíno e expõe problemas de isolamento antes do produto público;
- Isolamento por `ownerId` desde o dia 1 evita retrabalho doloroso de migrar dados single → multi depois;
- Ambientes dev/prod separados na VPS dão segurança para experimentar em dev sem risco de quebrar prod, e a separação de banco elimina a classe de erro "mexi no banco de produção sem querer";
- Git versiona produto e infra (compose), dando rastreabilidade e deploy reproduzível.

4. Consequências negativas / trade-offs

- Escopo do v1 cresce: auth (registro por convite, login, sessão, logout), ownerId em todas as rotas e testes de isolamento;
- Deploy pessoal deixa de ser trivial (não é mais "subir sem login"): exige segurança mínima de internet (TLS, rate limit, senha forte, convites controlados);
- Gestão de beta fechada = gerar/revogar convites; registro aberto teria sido mais simples de operar, porém público demais para uma instância pessoal;
- PostgreSQL traz custo operacional (serviço, volume, backup e migrations), mas evita uma migração estrutural quando a suite crescer;
- a separação dev/prod exige operação de dois bancos e disciplina de deploy;

5. Critérios de aceitação

1. Dois usuários com contas distintas não enxergam projetos/buscas/corpus um do outro (rotas testadas por ownerId);
2. Registro só funciona com token de convite válido; token revogado deixa de funcionar;
3. Dev e prod rodam simultaneamente na VPS com bancos e portas separados, sem interferência mútua;
4. Deploy de prod a partir do repositório git (pull → build → restart) funciona de forma reproduzível;
5. Segredos de prod não aparecem em dev nem no repositório.

6. Relação com documentação anterior

- Substitui a autenticação por owner key único das [[UhHu_Security_Notes]] §2 para usuários (owner key permanece como credencial admin/script);
- Atualiza a pendência de auth do [[ADR006 - Researcher Primeiro Produto]] §6 (decidida: multi-usuário);
- Complementa [[ADR003 - Core Stack]] quanto à stack de linguagem e monorepo; sua escolha de SQLite como persistência foi substituída pelo [[ADR009 - Core Compartilhado Modular e PostgreSQL]];
- [[ADR009 - Core Compartilhado Modular e PostgreSQL]] passa a ser a referência para a topologia do CORE e o banco oficial;
- Define a fronteira de desenvolvimento que o ADR-006 §6 deixava em aberto ("onde o código nasce"): dev na VPS em ambiente isolado + git como fonte da verdade.

7. Status

ACEITO — Fase 0/1 (decisão de arquitetura e infraestrutura)

Referência atual para: autenticação multi-usuário, isolamento por ownerId, ambientes dev/prod, versionamento e deploy.