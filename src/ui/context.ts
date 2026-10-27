import type { Session } from "../session";
export interface AppState {
  exists: boolean;
  firstRunTip?: boolean;
  backupDismissed?: boolean;
  oldVault?: import("../storage").OldVaultOffer;
  recovery?: import("../storage").RecoveryOffer;
  view: "codes" | "backups" | "settings";
}
export interface AppContext {
  session: Session;
  state: AppState;
  isExtension: boolean;
  isPopup: boolean;
  isVisible: () => boolean;
  run: (action: () => void | Promise<void>) => Promise<void>;
  announce: (message: string, error?: boolean) => void;
  modal: (title: string, content: Node) => void;
  closeDialog: () => void;
  dialogSignal: () => AbortSignal;
  render: () => void;
  confirmAction: (
    title: string,
    message: string,
    label: string,
    action: (signal: AbortSignal) => Promise<void>,
  ) => void;
}

export function dialogOperation(ctx: AppContext): AbortSignal {
  return AbortSignal.any([
    ctx.session.cancellationSignal(),
    ctx.dialogSignal(),
  ]);
}
