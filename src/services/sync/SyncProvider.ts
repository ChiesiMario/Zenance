export interface SyncProvider {
  /** Authenticate with the remote provider */
  authenticate(): Promise<void>;
  
  /** Check if currently authenticated */
  isAuthenticated(): boolean;
  
  /** Upload data to the remote provider */
  upload(data: string, filename: string): Promise<void>;
  
  /** Download data from the remote provider */
  download(filename: string): Promise<string | null>;
  
  /** Get the last modified time of the remote file */
  getLastModified(filename: string): Promise<Date | null>;
}
