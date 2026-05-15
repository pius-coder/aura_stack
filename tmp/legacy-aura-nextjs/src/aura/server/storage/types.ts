import "server-only";

export interface AuraStorageUploadArgs {
  /** Données brutes (Buffer) ou data URL base64 (string commençant par data:) */
  data: Buffer | string;
  /** Nom de fichier original (sans extension forcée) */
  fileName: string;
  /** Préfixe de dossier logique (ex: "avatars", "invoices/2024") */
  prefix: string;
  /** Métadonnées optionnelles */
  metadata?: Record<string, unknown>;
}

export interface AuraStorageUploadResult {
  id: string;
  key: string;
  url: string;
  mimeType: string;
  size: number;
}

export interface AuraStorageDriver {
  readonly name: string;
  upload(args: AuraStorageUploadArgs): Promise<AuraStorageUploadResult>;
  delete(keyOrUrl: string): Promise<void>;
}

export interface AuraStorage {
  /**
   * Upload un fichier. Si le driver est "filesystem", écrit sur disque
   * et enregistre dans `AuraFile`. Si S3, upload vers le bucket.
   */
  upload(args: AuraStorageUploadArgs): Promise<AuraStorageUploadResult>;
  /**
   * Supprime un fichier par sa clé ou son URL publique.
   * Met à jour la DB `AuraFile` en conséquence.
   */
  delete(keyOrUrl: string): Promise<void>;
}
