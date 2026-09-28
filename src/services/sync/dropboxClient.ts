import { getValidAccessToken } from './dropboxAuth';
import { isE2EEEnabled, getActiveCryptoKey, getActiveSalt } from '../crypto/e2eeManager';
import { isCryptoEnvelope, encryptPayload, decryptPayload } from '../crypto/webCrypto';

export interface DropboxFileMetadata {
  name: string;
  path_lower: string;
  path_display: string;
  id: string;
  client_modified: string;
  server_modified: string;
  rev: string;
  size: number;
}

/**
 * 遞歸列出 Dropbox App 目錄下的所有檔案與修訂版本號 (rev)
 * 單次呼叫即可感知所有檔案的遠端版本變動
 */
export async function listRemoteFolder(folderPath = ''): Promise<DropboxFileMetadata[]> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Dropbox not authenticated');

  const files: DropboxFileMetadata[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  try {
    while (hasMore) {
      const requestUrl: string = cursor
        ? 'https://api.dropboxapi.com/2/files/list_folder/continue'
        : 'https://api.dropboxapi.com/2/files/list_folder';

      const requestBody: string = cursor
        ? JSON.stringify({ cursor })
        : JSON.stringify({ path: folderPath, recursive: true, include_deleted: false });

      const res: Response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      });

      if (res.status === 409) {
        // 目錄尚不存在（初次使用）
        return [];
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to list folder (${res.status}): ${errorText}`);
      }

      const resData: any = await res.json();
      const entries = resData.entries || [];

      for (const entry of entries) {
        if (entry['.tag'] === 'file') {
          files.push({
            name: entry.name,
            path_lower: entry.path_lower,
            path_display: entry.path_display || entry.path_lower,
            id: entry.id,
            client_modified: entry.client_modified,
            server_modified: entry.server_modified,
            rev: entry.rev,
            size: entry.size,
          });
        }
      }

      hasMore = Boolean(resData.has_more);
      cursor = resData.cursor || null;
    }
  } catch (err: any) {
    if (err?.message?.includes('path/not_found')) {
      return [];
    }
    throw err;
  }

  return files;
}

/**
 * 從指定遠端路徑下載單一 JSON 檔案並解析
 */
export async function downloadJsonFile<T>(filePath: string): Promise<T | null> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Dropbox not authenticated');

  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

  const response = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: normalizedPath }),
    },
  });

  if (response.status === 409) {
    // 檔案不存在
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Download skipped for ${filePath} (${response.status}): ${errorText}`);
    return null;
  }

  try {
    const raw = await response.json();
    if (isCryptoEnvelope(raw)) {
      const key = getActiveCryptoKey();
      if (!key) {
        throw new Error('E2EE_LOCKED');
      }
      return await decryptPayload<T>(raw, key);
    }
    return raw as T;
  } catch (err: any) {
    if (err?.message === 'E2EE_LOCKED') {
      throw err;
    }
    return null;
  }
}

/**
 * 上傳指定 JSON 資料至特定遠端路徑 (覆蓋模式)
 * 若已啟用端到端加密，自動將內容封裝為 AES-256-GCM 密文信封
 * @returns 該檔案上傳後 Dropbox 生成的最新 rev 修訂版本號
 */
export async function uploadJsonFile(filePath: string, data: any): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Dropbox not authenticated');

  const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`;

  // 非 manifest.json 且啟用 E2EE 時，執行端到端加密
  let dataToUpload = data;
  if (normalizedPath !== '/manifest.json' && isE2EEEnabled()) {
    const key = getActiveCryptoKey();
    const salt = getActiveSalt();
    if (key && salt) {
      dataToUpload = await encryptPayload(data, key, salt);
    }
  }

  const bodyContent = JSON.stringify(dataToUpload, null, 2);
  const encoder = new TextEncoder();
  const bodyBuffer = encoder.encode(bodyContent);

  const response = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: normalizedPath,
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: bodyBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Upload failed for ${filePath} (${response.status}):`, errorText);
    throw new Error(`Failed to upload file ${filePath} (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  return result.rev as string;
}

/**
 * 刪除遠端指定檔案或資料夾
 */
export async function deleteRemotePath(path: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) return;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  try {
    await fetch('https://api.dropboxapi.com/2/files/delete_v2', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: normalizedPath }),
    });
  } catch {
    // Ignore deletion errors for missing files
  }
}
