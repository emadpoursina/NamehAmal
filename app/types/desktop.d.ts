import type { NamehAmalDesktop } from "@/electron/ipc-channels";

declare global {
  interface Window {
    namehAmalDesktop?: NamehAmalDesktop;
  }
}

export {};
