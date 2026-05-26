declare module 'virtual:nfp/runtime-config' {
  type SlidesStatus =
    | { kind: 'resolved'; path: string }
    | { kind: 'configured-but-missing'; configuredPath: string }
    | { kind: 'no-config-no-file' }
    | { kind: 'no-config-multiple-files'; candidates: string[] };
  interface NoteFirstPresenterConfig {
    slides?: string;
    build?: { outDir?: string };
    export?: {
      outDir?: string;
      imageDir?: string;
      format?: { template: string; extension: string };
    };
  }
  const config: {
    cwd: string;
    slidesStatus: SlidesStatus;
    dbPath: string;
    cacheRoot: string;
    fullConfig: NoteFirstPresenterConfig | null;
  };
  export default config;
}
