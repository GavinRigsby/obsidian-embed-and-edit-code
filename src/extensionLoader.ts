import { App, FileSystemAdapter, Notice } from "obsidian";
import CodeFilesPlugin from "./main";
import { ModuleSettings } from "./embedSettings";
import { CodeMirrorSettings } from "./settings";
import { Extension } from "@codemirror/state"
import path from "path";

interface ManifestEntry {
  name: string;
  version: string;
  url: string;
  from: string;
}

interface ModuleRecord {
  key: string;     // pkg@version or <abs-path>
  url: string;     // blob URL
  version: string;
  name: string;
}

export class ExtensionLoader {
  private app: App;
  private plugin: CodeFilesPlugin;
  private cache: Map<string, ModuleRecord> = new Map();
  private manifest: ManifestEntry[] = [];

  constructor(app: App, plugin: CodeFilesPlugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Load a user extension entrypoint.
   * @param filePath Vault path or plugin data file path
   */


  async loadExtension(modulePath: string, moduleSettings: ModuleSettings): Promise<any> {

    const appConfig: CodeMirrorSettings = this.plugin.settings;

    let settings = {
      extension: [] as Extension[],
      keymap: [] as Extension[],
      theme: [] as Extension[]
    }

    const url = await this.loadModuleRecursive(modulePath, moduleSettings.entry, "<root>");

    if (!url) {
      // return empty (no data to load)
      return settings;
    }

    let useBuiltinTheme = false;

    if (appConfig.theme == "One Dark") {
      useBuiltinTheme = true;
      const { oneDark } = await import("@codemirror/theme-one-dark");
      settings.theme.push(oneDark)
    }

    for (const exp of moduleSettings.imports) {
      if (exp.type == "language") continue; // We will handle this later
      const regType = exp.type === "theme" ? "theme" : exp.type + "s" as keyof CodeMirrorSettings; // themes, keymaps, etc.


      console.log(`Checking import ${exp.name} of type ${exp.type} from ${moduleSettings.name}`)

      // Handle theme
      if (regType === "theme") {
        if (useBuiltinTheme) continue;
        console.log(`THEME: ${appConfig.theme} vs ${exp.id}`)

        if (appConfig.theme === exp.id) { // only load the theme if it's the active one
          const mod = await import(/* @vite-ignore */ url);
          if (settings[exp.type].length > 0) {
            console.warn("Multiple themes loaded, this may cause issues");
          }
          settings[exp.type].push(mod[exp.id])
          console.log("LOAD THEME")
          console.log(mod)
          console.log(exp)
          console.log(mod[exp.id])
        }
        continue;
      }

      if ((appConfig[regType] as string[]).includes(exp.name)) { // checks if the given item is enabled in the settings


        const mod = await import(/* @vite-ignore */ url);

        if (regType === "extensions") {
          const moduleImport = mod[exp.name]
          if (exp.setup == "constant") {
            settings[exp.type].push(moduleImport)
          }
          else if (exp.setup == "function") {
            // still need to handle parameters here
            settings[exp.type].push(moduleImport())
          }
          else if (exp.setup == "facet") {
            // still need to handle parameters here
            settings[exp.type].push(
              moduleImport.compute([...exp.dependencies], (state: any) => {
                return {};
              }));

          }
        }

        else {
          settings[exp.type].push(mod[exp.name])
        }

        console.log(mod)
      }
    }

    console.log("all imports:")
    console.log(settings)

    return settings

  }

  /**
   * Recursively load a module, rewrite imports, and create a blob URL.
   */
  async loadModuleRecursive(basePath: string, modPath: string, from: string): Promise<string | undefined> {

    const filePath = path.join(basePath, modPath)

    const absKey = `file: ${filePath}`;

    if (this.cache.has(absKey)) {
      console.log(`Cache hit for ${absKey}`);
      return this.cache.get(absKey)!.url;
    }
    console.log(`Loading module file ${filePath}...`);

    // 1. Read raw source
    try {
      const raw = await this.app.vault.adapter.read(filePath);

      // 2. Rewrite imports
      const rewritten = await this.rewriteImports(raw, basePath, modPath);
      console.log(`File Rewritten ${filePath}`)
      console.log(this.cache)
      console.log(rewritten)

      // 3. Create blob + URL
      const blob = new Blob([rewritten], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);

      // 4. Cache
      this.cache.set(absKey, {
        key: absKey,
        url: blobUrl,
        version: "local",
        name: filePath,
      });

      console.log(`Save module to path ${absKey}`);

      this.manifest.push({
        name: filePath,
        version: "local",
        url: blobUrl,
        from,
      });

      return blobUrl;
    }
    catch (e) {
      console.error(`Failed to load module file: ${filePath}`, e);
      new Notice(`Failed to load module file: ${filePath}. See console for details.`);
    }
  }

  /**
   * Rewrite import statements to point at blob URLs.
   */
  private async rewriteImports(code: string, basePath: string, modPath: string): Promise<string> {
    const importRegex = /import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/g;
    const exportRegex = /export\s+(?:\*\s+from|{[^}]+}\s+from)\s+["']([^"']+)["']/g;

    const CORE_CM = new Set<string>(Object.keys((window as any).__HOST_CM__));
    const fromPath = path.join(basePath, modPath);

    const rewriteSpecifier = async (match: string, specifier: string): Promise<string> => {
      //
      // --- 1. Host-provided modules
      //
      if (CORE_CM.has(specifier)) {
        // Side-effect only: import "x"
        if (/^import\s+['"]/.test(match)) {
          return `window.__HOST_CM__["${specifier}"];`;
        }

        // import * as ns from "x"
        const starMatch = /^import\s+\*\s+as\s+(\w+)\s+from/.exec(match);
        if (starMatch) {
          const ns = starMatch[1];
          return `const ${ns} = window.__HOST_CM__["${specifier}"];`;
        }

        // import { a, b as c } from "x"
        const namedMatch = /^import\s*{([^}]+)}\s*from/.exec(match);
        if (namedMatch) {
          const imports = namedMatch[1].split(',')
            .map(s => s.trim())
            .map(s => {
              const [orig, alias] = s.split(/\s+as\s+/);
              return alias ? `${orig.trim()}: ${alias.trim()}` : orig.trim();
            })
            .join(', ');
          return `const { ${imports} } = window.__HOST_CM__["${specifier}"];`;
        }

        // import defaultExport from "x"
        const defaultMatch = /^import\s+(\w+)\s+from/.exec(match);
        if (defaultMatch) {
          const def = defaultMatch[1];
          return `const ${def} = window.__HOST_CM__["${specifier}"].default ?? window.__HOST_CM__["${specifier}"];`;
        }

        // export * from "x"
        if (/^export\s+\*\s+from/.test(match)) {
          return `export * from window.__HOST_CM__["${specifier}"];`;
        }

        // export { a, b as c } from "x"
        const exportNamedMatch = /^export\s*{([^}]+)}\s*from/.exec(match);
        if (exportNamedMatch) {
          const exports = exportNamedMatch[1].split(',')
            .map(s => s.trim())
            .map(s => {
              const [orig, alias] = s.split(/\s+as\s+/);
              return alias ? `${orig.trim()}: ${alias.trim()}` : orig.trim();
            })
            .join(', ');
          return `export const { ${exports} } = window.__HOST_CM__["${specifier}"];`;
        }

        // export { default } from "x"
        if (/^export\s*{[^}]*default[^}]*}\s*from/.test(match)) {
          return `export default window.__HOST_CM__["${specifier}"].default ?? window.__HOST_CM__["${specifier}"];`;
        }

        return match; // fallback
      }

      //
      // --- 2. Relative paths
      //
      if (specifier.startsWith(".") || specifier.startsWith("/")) {

        const resolvedPath = this.resolvePath(basePath, fromPath, specifier);

        console.log(`Resolve relative import ${specifier} → ${resolvedPath} from ${fromPath}`);

        const url = await this.loadModuleRecursive(basePath, resolvedPath, specifier);
        return url ? match.replace(specifier, url) : match;
      }

      //
      // --- 3. Bare specifiers (npm-style deps)
      //
      const { version, entryPath } = await this.resolvePackage(basePath, specifier);
      const depKey = `${specifier}@${version}`;

      if (this.cache.has(depKey)) {
        return match.replace(specifier, this.cache.get(depKey)!.url);
      }

      const raw = await this.app.vault.adapter.read(entryPath);
      const rewrittenDep = await this.rewriteImports(raw, basePath, entryPath);

      const blob = new Blob([rewrittenDep], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);

      this.cache.set(depKey, { key: depKey, url: blobUrl, version, name: specifier });
      this.manifest.push({ name: specifier, version, url: blobUrl, from: fromPath });

      return match.replace(specifier, blobUrl);
    };

    // rewrite imports
    let rewritten = await this.replaceAsync(code, importRegex, rewriteSpecifier);

    // rewrite re-exports
    rewritten = await this.replaceAsync(rewritten, exportRegex, rewriteSpecifier);

    return rewritten;
  }

  /**
   * Resolve bare specifier → entry path + version
   * Looks up in deps folder (pre-downloaded releases).
   */
  private async resolvePackage(basePath: string, pkgName: string): Promise<{ version: string; entryPath: string }> {
    const pkgPath = `${basePath}/node_modules/${pkgName}`; // you choose how to store
    const pkgJsonPath = `${pkgPath}/package.json`;

    console.log(`Load Package from ${pkgPath}`)

    const pkgRaw = await this.app.vault.adapter.read(pkgJsonPath);
    const pkg = JSON.parse(pkgRaw);

    const version = pkg.version;
    const entry =
      pkg.module ||
      pkg.main ||
      (pkg.exports && typeof pkg.exports === "object" ? pkg.exports.import : undefined) ||
      (pkg.exports && typeof pkg.exports === "string" ? pkg.exports : undefined);

    const entryPath = `${pkgPath}/${entry}`;

    // Do some compatability check to determine if the extension's package fits with source codemirror (TODO)

    console.log(`Resolved Package ${entryPath} ${version}`)
    return { version, entryPath };
  }

  /**
   * Utility: resolve "./foo.js" relative to "fromPath"
   */
  private resolvePath(basePath: string, fromPath: string, relative: string): string {
    // Normalize slashes
    const basePathNorm = basePath.replace(/\\/g, "/");
    const fromPathNorm = fromPath.replace(/\\/g, "/");
    // Get the directory of fromPath
    const fromDir = path.posix.dirname(fromPathNorm);
    // Resolve the absolute path
    const absPath = path.posix.resolve(fromDir, relative);
    // Make it relative to basePath
    let relPath = path.posix.relative(basePathNorm, absPath);
    // If the result is not prefixed with ".", add "./"
    if (!relPath.startsWith(".")) relPath = "./" + relPath;
    // Convert to Windows-style slashes if you want, or keep as posix
    return relPath;
  }


  /**
   * Async string replace utility
   */
  private async replaceAsync(
      str: string,
      regex: RegExp,
      asyncFn: (match: string, ...groups: string[]) => Promise<string>
    ): Promise<string> {
    const promises: Promise<string>[] = [];
    str.replace(regex, (match, ...args) => {
      promises.push(asyncFn(match, ...args));
      return match;
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift()!);
  }

  /**
   * For debugging: dump loaded deps
   */
  getManifest(): ManifestEntry[] {
    return this.manifest;
  }

  /**
   * Cleanup blob URLs on unload
   */
  cleanup() {
    for (const rec of this.cache.values()) {
      URL.revokeObjectURL(rec.url);
    }
    this.cache.clear();
    this.manifest = [];
  }
}
