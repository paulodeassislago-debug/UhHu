// packages/contracts — schemas e DTO de projetos (D-22..D-24).
//
// Unica definicao de tipos de projeto: nenhum outro pacote duplica.
// JSON publico em camelCase; banco em snake_case (mapeado no Drizzle).
// UI-30: referenceSearchId vive aqui (schema de update + ProjectDTO).

import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  researchQuestion: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(5000).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['active', 'archived']).optional(),
  // UI-30 (§14-4): referência manual da comparação (D-35 vizinho). Apenas no
  // update; create NÃO aceita. Nullable para limpar; validação de
  // pertencimento (mesmo projectId + owner) é application-level no lib.
  referenceSearchId: z.string().uuid().nullable().optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export type ProjectStatus = 'active' | 'archived';

export interface ProjectDTO {
  id: string;
  title: string;
  researchQuestion: string | null;
  description: string | null;
  status: ProjectStatus;
  // UI-30 (§14-4): uuid da search de referência ou null (sem referência).
  // Definição única — frontend importa via `import type`.
  referenceSearchId: string | null;
  createdAt: string;
  updatedAt: string;
}
