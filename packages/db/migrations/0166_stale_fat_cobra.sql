ALTER TABLE "talentsourcer_connections" DROP CONSTRAINT "talentsourcer_connections_pkey";--> statement-breakpoint
ALTER TABLE "talentsourcer_connections" ADD CONSTRAINT "talentsourcer_connections_workspace_id_organization_id_pk" PRIMARY KEY("workspace_id","organization_id");
