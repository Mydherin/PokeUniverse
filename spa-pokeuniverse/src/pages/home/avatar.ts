import type { Account } from "@pokeuniverse/contracts/auth/v1/auth";
import { h } from "../../ui/dom";

/** Google profile picture, or the trainer's initial when there is none. */
export function avatar(account: Account, size: string): HTMLElement {
  const initial = h(
    "span",
    { class: `grid ${size} shrink-0 place-items-center rounded-full bg-gradient-to-br from-volt-300 to-ember-400 text-lg font-bold text-night-950`, "aria-hidden": "true" },
    (account.displayName.trim()[0] ?? "?").toUpperCase(),
  );
  if (!account.pictureUrl) return initial;
  const img = h("img", {
    src: account.pictureUrl,
    alt: "",
    referrerpolicy: "no-referrer",
    class: `${size} shrink-0 rounded-full object-cover ring-2 ring-white/10`,
  });
  img.addEventListener("error", () => img.replaceWith(initial), { once: true });
  return img;
}

export function firstName(account: Account): string {
  return account.displayName.trim().split(/\s+/)[0] || "Trainer";
}

export function memberSince(account: Account): string {
  return new Date(Number(account.createdAt) * 1000).toLocaleDateString("en", { year: "numeric", month: "long" });
}

export function trainerId(account: Account): string {
  return `#${account.id.toString().padStart(6, "0")}`;
}
