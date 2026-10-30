import { getSession, logout } from "../../auth/session";
import { Species } from "../../assets/sprites";
import { sprite } from "../../ui/art";
import { h } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { avatar, memberSince, trainerId } from "./avatar";

export function trainerSection(): HTMLElement {
  const account = getSession()!.account;

  const signOut = h(
    "button",
    {
      type: "button",
      class: "btn btn-ghost w-full sm:w-auto",
      on: {
        click: async () => {
          signOut.disabled = true;
          await logout();
        },
      },
    },
    icon("logout", "size-5"),
    "Sign out",
  );

  const row = (label: string, value: Node | string) =>
    h(
      "div",
      { class: "flex flex-col gap-0.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6" },
      h("dt", { class: "text-sm text-ink-muted" }, label),
      h("dd", { class: "min-w-0 truncate font-medium" }, value),
    );

  return h(
    "div",
    { class: "mx-auto max-w-3xl space-y-6" },
    h("h1", { class: "font-display text-4xl font-bold" }, "Trainer"),
    h(
      "section",
      { class: "panel relative overflow-hidden", "aria-label": "Trainer card" },
      h("div", { class: "h-24 bg-gradient-to-r from-night-600 via-night-500 to-ember-500/60 sm:h-28" }),
      sprite(Species.eevee, "absolute right-4 top-6 size-24 sm:right-8 sm:size-28"),
      h(
        "div",
        { class: "px-5 pb-6 sm:px-8" },
        h("div", { class: "-mt-10 inline-block rounded-full ring-4 ring-night-850" }, avatar(account, "size-20")),
        h("h2", { class: "mt-3 truncate font-display text-3xl font-bold" }, account.displayName),
        h(
          "div",
          { class: "mt-2 flex flex-wrap gap-2" },
          h("span", { class: "chip" }, trainerId(account)),
          ...account.roles.map((r) => h("span", { class: `chip ${r === "admin" ? "text-berry-400" : "text-aqua-300"}` }, r)),
        ),
        h(
          "dl",
          { class: "mt-6 divide-y divide-white/5 border-y border-white/5" },
          row("Email", account.email),
          row("Trainer since", memberSince(account)),
          row("Signed in with", "Google"),
        ),
      ),
    ),
    h(
      "section",
      { class: "panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6" },
      h(
        "div",
        { class: "flex items-start gap-3" },
        icon("shield", "mt-0.5 size-5 shrink-0 text-leaf-400"),
        h(
          "p",
          { class: "text-sm text-ink-soft" },
          "You stay signed in on this device for 30 days, renewed every time you play.",
        ),
      ),
      signOut,
    ),
  );
}
