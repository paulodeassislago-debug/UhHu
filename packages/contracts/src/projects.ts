// packages/contracts — schemas e DTO de projetos (D-22..D-24).
//
// Unica definicao de tipos de projeto: nenhum outro pacote duplica.
// JSON publico em camelCase; banco em snake_case (mapeado no Drizzle).

import { z } from 'zod';

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(200),
  researchQuestion: z.string().trim().max(2000).optional(),
  description: z.string().trim().max(5000).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(['active', 'archived']).optional(),
});

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export type ProjectStatus = 'active' | 'archived';

export interface ProjectDTO {
  id: string;
  title: string;
  researchQuestion: string | null;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}
