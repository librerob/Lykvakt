import type { Session } from "../session";
export interface AppState {
  exists: boolean;
  firstRunTip?: boolean;
  oldVault?: import("../storage").OldVaultOffer;
  recovery?: import("../storage").RecoveryOffer;
  view: "codes" | "backups" | "settings";
}
export interface AppContext {
  session: Session;
  state: AppState;
  isExtension: boolean;
  fullWindow: boolean;
  run: (action: () => void | Promise<void>) => Promise<void>;
  announce: (message: string, error?: boolean) => void;
  modal: (title: string, content: Node) => void;
  closeDialog: () => void;
  render: () => void;
  confirmAction: (
    title: string,
    message: string,
    label: string,
    action: () => Promise<void>,
  ) => void;
}
