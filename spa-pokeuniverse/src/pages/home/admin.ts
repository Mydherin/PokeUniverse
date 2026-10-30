// Admin section: shown only to admins. The server confirms access before anything is shown.

import { api, ApiError } from "../../api/client";
import { h } from "../../ui/dom";
import { icon } from "../../ui/icons";

export function adminSection(): HTMLElement {
  const status = h("p", { class: "text-ink-muted", role: "status" }, "Checking access…");
  const panel = h("section", { class: "panel flex items-center gap-3 p-5 sm:p-6" }, icon("shield", "size-5 shrink-0 text-ink-muted"), status);

  const show = (ok: boolean, text: string) => {
    panel.replaceChildren(icon(ok ? "check" : "shield", `size-5 shrink-0 ${ok ? "text-leaf-400" : "text-berry-400"}`), h("p", { role: "status" }, text));
  };

  api("/api/admin/access").then(
    () => show(true, "Admin access confirmed by the server."),
    (e) => show(false, e instanceof ApiError && e.status === 403 ? "You don't have admin access." : "Couldn't reach the server. Try again later."),
  );

  return h("div", { class: "mx-auto max-w-3xl space-y-6" }, h("h1", { class: "font-display text-4xl font-bold" }, "Admin"), panel);
}
