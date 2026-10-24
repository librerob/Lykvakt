import { el, input, form, submit } from "../dom";
import { unwrapPassword } from "../crypto";
import type { AppContext } from "./context";
export function authenticateAction(
  ctx: AppContext,
  title: string,
  message: string,
  label: string,
  action: () => Promise<void>,
): void {
  const password = input("password", "Master password", "password");
  password.control.required = true;
  ctx.modal(
    title,
    form(
      async (_fields, f) =>
        ctx.run(async () => {
          ctx.announce("Verifying master password…");
          const epoch = ctx.session.epoch();
          let raw: Uint8Array | undefined;
          try {
            raw = await unwrapPassword(
              ctx.session.current(),
              password.control.value,
            );
          } finally {
            raw?.fill(0);
            f.reset();
            password.control.value = "";
          }
          ctx.session.check();
          if (epoch !== ctx.session.epoch())
            throw new Error("Authentication cancelled by locking.");
          ctx.announce("Master password confirmed.");
          ctx.closeDialog();
          await action();
        }),
      el("p", {}, message),
      password.wrapper,
      submit(label),
    ),
  );
}
