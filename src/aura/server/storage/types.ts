

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

export interface AuraStoreArgs {
  /** Raw bytes or a Web `File` / data URL */
  data: Buffer | File | string;
  /** Original filename */
  filename: string;
  /** Optional content-type override (auto-detected for `File` and data URLs) */
  contentType?: string;
  /** Free-form metadata */
  metadata?: Record<string, unknown>;
}

export interface AuraStoredFileResult {
  storageId: string;
  filename: string;
  contentType: string;
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
  /**
   * Decision 17 — typed `store/getUrl/delete` API backed by `AuraStoredFile`.
   * Returns a `storageId` you can pass to `getUrl()` to mint a serving URL
   * or to `removeStoredFile()` to delete both the on-disk blob and the row.
   */
  store(args: AuraStoreArgs): Promise<AuraStoredFileResult>;
  getUrl(storageId: string): Promise<string>;
  removeStoredFile(storageId: string): Promise<void>;
}
