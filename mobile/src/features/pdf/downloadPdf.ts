/**
 * Shared "download a PDF from a Tomo backend route" helper.
 *
 * Used by CV export and Timeline export. Centralises:
 *   - Auth header attachment
 *   - Web vs native code paths (blob window.open vs FileSystem + Sharing)
 *   - Probe-then-download (createDownloadResumable doesn't throw on non-2xx,
 *     it would silently save a JSON error body as a .pdf)
 *   - X-Fallback-URL handling (web only)
 *   - SDK 54 cacheDirectory location (expo-file-system/legacy)
 */

import { Platform, Linking, Alert } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "../../services/apiConfig";
import { getIdToken } from "../../services/auth";

export interface DownloadPdfOptions {
  /** Path under API_BASE_URL, e.g. "/api/v1/cv/pdf" or "/api/v1/timeline/pdf". */
  path: string;
  /** HTTP method. Defaults to "GET". */
  method?: "GET" | "POST";
  /** JSON body for POST. Ignored for GET. */
  body?: unknown;
  /** Filename stem used for the cached file + Sharing dialog. No extension. */
  filenameStem: string;
  /** Title for the iOS Sharing sheet. */
  dialogTitle?: string;
  /** Alert title used when something goes wrong (native only). */
  errorTitle?: string;
}

export async function downloadPdf(opts: DownloadPdfOptions): Promise<void> {
  const url = `${API_BASE_URL}${opts.path}`;
  const method = opts.method ?? "GET";

  try {
    const token = await getIdToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (method === "POST") headers["Content-Type"] = "application/json";

    const init: RequestInit = { method, headers };
    if (method === "POST" && opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    if (Platform.OS === "web") {
      const res = await fetch(url, init);
      if (!res.ok) {
        const fallback = res.headers.get("X-Fallback-URL");
        if (fallback) { await WebBrowser.openBrowserAsync(fallback); return; }
        throw new Error(await readError(res));
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      return;
    }

    // Native: probe first to surface real server errors instead of saving
    // an error JSON body as a .pdf.
    const probe = await fetch(url, init);
    if (!probe.ok) throw new Error(await readError(probe));

    const cacheDir = (FileSystem as any).cacheDirectory as string | undefined;
    if (!cacheDir) throw new Error("No writable cache directory");
    const localPath = `${cacheDir}${opts.filenameStem}-${Date.now()}.pdf`;

    // createDownloadResumable only supports GET. For POST, we already have
    // the bytes from the probe — write directly.
    let savedUri: string;
    if (method === "GET") {
      const dl = await FileSystem.createDownloadResumable(
        url,
        localPath,
        { headers }
      ).downloadAsync();
      if (!dl) throw new Error("Download failed");
      savedUri = dl.uri;
    } else {
      const arrayBuf = await probe.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuf);
      await (FileSystem as any).writeAsStringAsync(localPath, base64, {
        encoding: (FileSystem as any).EncodingType?.Base64 ?? "base64",
      });
      savedUri = localPath;
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(savedUri, {
        mimeType: "application/pdf",
        dialogTitle: opts.dialogTitle ?? "Save PDF",
        UTI: "com.adobe.pdf",
      });
    } else if (Platform.OS === "android") {
      const contentUri = await (FileSystem as any).getContentUriAsync(savedUri);
      await Linking.openURL(contentUri);
    } else {
      await Linking.openURL(savedUri);
    }
  } catch (err) {
    if (Platform.OS !== "web") {
      const msg = err instanceof Error ? err.message : String(err);
      Alert.alert(opts.errorTitle ?? "PDF", `Could not download the PDF.\n\n${msg}`);
    }
    throw err;
  }
}

async function readError(res: Response): Promise<string> {
  let detail = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.detail) detail += ` — ${body.detail}`;
    else if (body?.error) detail += ` — ${body.error}`;
  } catch { /* not JSON */ }
  return detail;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  // btoa exists in Hermes via the global polyfill that React Native ships.
  return (globalThis as any).btoa
    ? (globalThis as any).btoa(binary)
    : Buffer.from(binary, "binary").toString("base64");
}
