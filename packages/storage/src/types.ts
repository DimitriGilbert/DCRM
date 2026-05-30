/**
 * Metadata returned after successfully storing a file.
 */
export interface StoredFile {
  /** Backend-relative path or key identifying the stored file. */
  path: string;
  /** Size of the stored file in bytes. */
  size: number;
  /** MIME type of the stored file, if known. */
  mimeType: string;
}

/**
 * Quota and size limits for a storage backend.
 */
export interface StorageLimits {
  /** Maximum size of a single file in bytes. */
  maxFileSize: number;
  /** Maximum total storage per user in bytes, or `null` for unlimited. */
  userQuota: number | null;
}

/**
 * Abstract storage backend interface. Both local filesystem and S3-compatible
 * backends implement this interface so consumers are backend-agnostic.
 */
export interface StorageBackend {
  /** Human-readable name for error messages and logging. */
  readonly name: string;

  /**
   * Store a file for a given user.
   *
   * @param userId - Owner of the file (used for path partitioning / quota).
   * @param key - Backend-relative key or path (e.g. "client/abc123/file.pdf").
   * @param data - Raw file bytes.
   * @param mimeType - MIME type of the file.
   * @returns Metadata about the stored file.
   */
  put(
    userId: string,
    key: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<StoredFile>;

  /**
   * Retrieve a file.
   *
   * @param userId - Owner of the file (enforced scope check).
   * @param key - Backend-relative key or path.
   * @returns The raw file bytes.
   * @throws {StorageError} when the file does not exist.
   */
  get(userId: string, key: string): Promise<Uint8Array>;

  /**
   * Delete a file.
   *
   * @param userId - Owner of the file (enforced scope check).
   * @param key - Backend-relative key or path.
   * @throws {StorageError} when the file does not exist.
   */
  delete(userId: string, key: string): Promise<void>;

  /**
   * Check whether a file exists.
   *
   * @param userId - Owner of the file.
   * @param key - Backend-relative key or path.
   */
  exists(userId: string, key: string): Promise<boolean>;

  /**
   * Return the configured limits for this backend.
   */
  getLimits(): StorageLimits;
}

/**
 * Error thrown by storage backends for expected failure modes.
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "QUOTA_EXCEEDED" | "FILE_TOO_LARGE" | "PUT_FAILED" | "DELETE_FAILED" | "GET_FAILED",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
