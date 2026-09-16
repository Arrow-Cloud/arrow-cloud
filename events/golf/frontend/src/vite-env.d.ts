/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Lambda Function URL for the golf event submit API (set after CDK deploy) */
  readonly VITE_GOLF_SUBMIT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
