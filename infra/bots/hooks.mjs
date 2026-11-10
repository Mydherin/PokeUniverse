// Lets Node run the generated contracts and the client's movement rules as they are: they use
// enums (which plain type stripping refuses) and extensionless relative imports (as Vite allows).
// Packages resolve as the contracts' (@bufbuild/protobuf), so infra/bots needs no install.
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";

const CONTRACTS = new URL("../../lib-contracts/gen/ts/package.json", import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
      if (specifier.startsWith(".")) return next(`${specifier}.ts`, context);
      return next(specifier, { ...context, parentURL: CONTRACTS });
    }
  },
  load(url, context, next) {
    if (!url.startsWith("file:") || !url.endsWith(".ts")) return next(url, context);
    const source = readFileSync(new URL(url), "utf8");
    return { format: "module", source: stripTypeScriptTypes(source, { mode: "transform", sourceUrl: url }), shortCircuit: true };
  },
});
