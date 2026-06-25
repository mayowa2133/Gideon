import type { GideonApi } from "../main/preload";

declare global {
  interface Window {
    gideon: GideonApi;
  }
}

export {};

