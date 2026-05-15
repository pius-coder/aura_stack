export type AuraManifestOperationType = "query" | "mutate" | "action";
export type AuraManifestAccess = "auth" | "public" | "internal";

export interface AuraManifestOperation {
  name: string;
  type: AuraManifestOperationType;
  access: AuraManifestAccess;
  entities: string[];
}

export interface AuraClientManifest {
  operations: AuraManifestOperation[];
}
