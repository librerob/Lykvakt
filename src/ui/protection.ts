import {
  button,
  el,
  form,
  helpBlock,
  input,
  select,
  submit,
  technicalDetails,
} from "../dom";
import { busyCopy } from "../help";
import { calibrateProtection } from "../kdf";
import {
  DEFAULT_KDF,
  EXTRA_KDF,
  upgradePolicy,
  type Argon2Policy,
} from "../kdf-policy";
import type { AppContext } from "./context";

export function createProtection(ctx: AppContext) {
  const choice = select(
    "protection",
    "How strongly should we protect your vault?",
    {
      recommended: "Recommended",
      extra: "Extra strong",
      tune: "Tune for this computer",
    },
    "recommended",
  );
  const description = el(
    "p",
    { class: "hint" },
    "Strong and quick. Best for most people.",
  );
  const memory = select(
    "calibrationMemory",
    "Memory for the speed test",
    {
      "65536": "64 MiB (recommended)",
      "131072": "128 MiB",
      "262144": "256 MiB",
    },
    "65536",
  );
  let calibrated: Argon2Policy | undefined;
  let testing = false;
  const result = el("div", { class: "notice", "data-calibration-result": "" });
  result.hidden = true;
  const test = button(
    "Test this computer",
    () =>
      ctx.run(async () => {
        if (testing) return;
        testing = true;
        test.disabled =
          choice.control.disabled =
          memory.control.disabled =
            true;
        const epoch = ctx.session.epoch();
        ctx.announce(busyCopy.test);
        try {
          const measured = await calibrateProtection(
            Number(memory.control.value),
            ctx.session.cancellationSignal(),
          );
          ctx.session.check();
          if (epoch !== ctx.session.epoch()) return;
          calibrated = measured.policy;
          result.replaceChildren(
            el(
              "p",
              {},
              "A test pass took about " +
                (measured.measuredMs / 1000).toFixed(1) +
                " seconds. The suggested setting should take around " +
                (measured.estimatedMs / 1000).toFixed(1) +
                " seconds. Review it, then choose Apply protection. Your vault has not changed yet.",
            ),
            technicalDetails(el("p", {}, describe(calibrated))),
          );
          result.hidden = false;
          ctx.announce(
            "Speed test complete. Review the result before applying it.",
          );
        } finally {
          testing = false;
          test.disabled =
            choice.control.disabled =
            memory.control.disabled =
              false;
        }
      }),
    "button tonal",
  );
  const probe = el(
    "div",
    { class: "stack" },
    technicalDetails(
      memory.wrapper,
      el(
        "p",
        {},
        "More memory can make guessing harder, but needs more temporary workspace. The probe uses one pass; a saved slot always uses at least three.",
      ),
    ),
    test,
    result,
  );
  probe.hidden = true;
  choice.control.addEventListener("change", () => {
    calibrated = undefined;
    result.hidden = true;
    probe.hidden = choice.control.value !== "tune";
    description.textContent =
      choice.control.value === "extra"
        ? "Takes a little longer to unlock. Good if you have a fast computer."
        : choice.control.value === "tune"
          ? "Test this computer, review the result, then choose whether to apply it."
          : "Strong and quick. Best for most people.";
  });
  memory.control.addEventListener("change", () => {
    calibrated = undefined;
    result.hidden = true;
  });
  function selected(): Argon2Policy {
    if (choice.control.value === "tune") {
      if (!calibrated)
        throw new Error(
          "Choose Test this computer and review its result first.",
        );
      return calibrated;
    }
    return choice.control.value === "extra"
      ? { ...EXTRA_KDF }
      : { ...DEFAULT_KDF };
  }
  function forPasswordChange(): Argon2Policy {
    const desired = selected(),
      current = ctx.session.current().password;
    const upgraded = upgradePolicy(current, desired);
    return upgraded?.kdf === "Argon2id"
      ? upgraded
      : current.kdf === "Argon2id"
        ? current
        : desired;
  }
  function apply(): void {
    const policy = selected();
    const password = input("protectionPassword", "Master password", "password");
    password.control.required = true;
    ctx.modal(
      "Apply password protection",
      form(
        async (_fields, f) =>
          ctx.run(async () => {
            const epoch = ctx.session.epoch();
            ctx.announce(busyCopy.protect);
            try {
              await ctx.session.unlock(password.control.value, policy);
              ctx.session.check();
              if (epoch !== ctx.session.epoch()) return;
              ctx.state.upgradeNoticeDismissed = false;
            } finally {
              f.reset();
              password.control.value = "";
            }
            const pending = upgradePolicy(
              ctx.session.current().password,
              policy,
            );
            ctx.closeDialog();
            ctx.render();
            ctx.announce(
              pending
                ? "Your password worked, but stronger protection could not be saved. Your vault is still open. Try applying it again."
                : "Your vault is protected with at least the setting you chose. Your password and codes are unchanged.",
            );
          }),
        el(
          "p",
          {},
          "Enter your current password to save this protection setting. A stronger setting already in your vault will be kept.",
        ),
        password.wrapper,
        helpBlock("password"),
        submit("Apply protection"),
      ),
    );
  }
  const current = ctx.session.current().password;
  const currentDescription =
    current.kdf === "Argon2id"
      ? describe(current)
      : "Current slot: PBKDF2-SHA256, " +
        current.iterations +
        " iterations. Password unlock can upgrade it to Argon2id.";
  return {
    panel: el(
      "div",
      { class: "settings-section stack" },
      el("h2", {}, "Password protection"),
      choice.wrapper,
      description,
      helpBlock("protection"),
      technicalDetails(el("p", {}, currentDescription)),
      probe,
      button(
        "Apply protection",
        () => ctx.run(async () => apply()),
        "button tonal",
      ),
    ),
    forPasswordChange,
  };
}
function describe(policy: Argon2Policy): string {
  return (
    "Argon2id v0x13; " +
    policy.m +
    " KiB; " +
    policy.t +
    " passes; p=" +
    policy.p +
    "."
  );
}
