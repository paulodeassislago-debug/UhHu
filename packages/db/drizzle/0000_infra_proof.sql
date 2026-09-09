-- Fase 1: prova de infra, sem dominio (gerado por drizzle-kit; nao editar a mao).
CREATE TABLE "infra_proof" (
	"id" serial PRIMARY KEY NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
