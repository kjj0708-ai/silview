export interface DesktopImage {
  id: string;
  url: string;
  name: string;
  size: number;
}

export interface DesktopLibrary {
  revision: number;
  version: string;
  files: DesktopImage[];
  selectedId: string | null;
  folderName: string | null;
}

declare global {
  interface Window {
    silviewDesktop?: {
      getLibrary(): Promise<DesktopLibrary>;
      onLibrary(callback: (library: DesktopLibrary) => void): () => void;
      onError(callback: (message: string) => void): () => void;
      openFiles(files: File[]): Promise<void>;
      openImages(): Promise<void>;
      openFolder(): Promise<void>;
      saveImage(url: string, name: string): Promise<void>;
      saveAll(images: { url: string; name: string }[]): Promise<void>;
      printImage(url: string): Promise<void>;
      openDefaultApps(): Promise<void>;
    };
  }
}
