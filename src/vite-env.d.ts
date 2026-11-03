/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_ENGINE_ENDPOINT?: string;
  readonly VITE_ENABLE_SIMULATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
