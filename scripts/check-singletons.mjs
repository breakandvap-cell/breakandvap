/**
 * Vérifie qu'aucune instance dupliquée de React / TanStack Router n'est installée
 * et que les paquets TanStack sont alignés. Utilisé au build (plugin Vite) et en CLI.
 */
import { readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

const SINGLETONS = [
  "react",
  "react-dom",
  "@tanstack/react-router",
  "@tanstack/react-start",
  "@tanstack/router-core",
  "@tanstack/history",
];

function readPkg(dir) {
  const p = join(dir, "package.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Parcourt récursivement les dossiers node_modules pour trouver toutes les copies installées. */
function scan(nodeModulesDir, found, depth = 0) {
  if (depth > 6 || !existsSync(nodeModulesDir)) return found;
  let entries;
  try {
    entries = readdirSync(nodeModulesDir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const name = entry.name;
    if (name === ".bin" || name === ".cache" || name === ".vite") continue;
    const dir = join(nodeModulesDir, name);
    if (name.startsWith("@")) {
      scan(dir, found, depth); // les scopes ne comptent pas comme un niveau
      continue;
    }
    const pkgName = nodeModulesDir.endsWith(`node_modules/@${name.split("/")[0]}`)
      ? name
      : name;
    const pkg = readPkg(dir);
    const fullName = pkg?.name ?? pkgName;
    if (pkg && SINGLETONS.includes(fullName)) {
      let real = dir;
      try {
        real = realpathSync(dir);
      } catch {
        /* ignore */
      }
      const list = found.get(fullName) ?? [];
      if (!list.some((e) => e.path === real)) list.push({ path: real, version: pkg.version });
      found.set(fullName, list);
    }
    scan(join(dir, "node_modules"), found, depth + 1);
  }
  return found;
}

export function checkSingletons(root = process.cwd()) {
  const found = scan(resolve(root, "node_modules"), new Map());
  const errors = [];
  const report = [];

  for (const name of SINGLETONS) {
    const copies = found.get(name);
    if (!copies || copies.length === 0) continue;
    const versions = [...new Set(copies.map((c) => c.version))];
    report.push(`${name}: ${versions.join(", ")}`);
    if (copies.length > 1) {
      errors.push(
        `Instances multiples de "${name}" (${copies.length}) :\n` +
          copies.map((c) => `    - ${c.version} @ ${c.path}`).join("\n"),
      );
    }
  }

  // Alignement des paquets TanStack Router/Start sur la même version de router-core
  const routerCore = found.get("@tanstack/router-core")?.[0]?.version;
  const router = found.get("@tanstack/react-router")?.[0]?.version;
  if (routerCore && router && routerCore.split(".")[0] !== router.split(".")[0]) {
    errors.push(
      `Versions majeures désalignées : @tanstack/react-router ${router} vs @tanstack/router-core ${routerCore}`,
    );
  }

  return { errors, report };
}

export function assertSingletons(root = process.cwd()) {
  const { errors, report } = checkSingletons(root);
  if (errors.length > 0) {
    throw new Error(
      "Vérification des singletons échouée :\n  " +
        errors.join("\n  ") +
        "\n\n  Correctif : aligner les versions dans package.json puis réinstaller (bun install), " +
        "et supprimer node_modules/.vite.",
    );
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const report = assertSingletons();
    console.log("✔ Singletons OK\n  " + report.join("\n  "));
  } catch (error) {
    console.error("✖ " + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
