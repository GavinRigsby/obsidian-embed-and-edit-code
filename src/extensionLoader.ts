import { App, FileSystemAdapter } from "obsidian";
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

    const url = await this.loadModuleRecursive(modulePath, moduleSettings.entry,  "<root>");

    for (const exp of moduleSettings.imports) {
      if (exp.type == "language") continue; // We will handle this later
      const regType = exp.type === "theme" ? "theme" : exp.type + "s" as keyof CodeMirrorSettings; // themes, keymaps, etc.


      if ((appConfig[regType] as string[]).includes(exp.name)) { // checks if the given item is enabled in the settings

        
        const mod = await import(/* @vite-ignore */ url);
        settings[exp.type] = mod[exp.name]

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
  private async loadModuleRecursive(basePath: string, modPath: string, from: string): Promise<string> {

    const filePath = path.join(basePath, modPath)

    const absKey = `file: ${filePath}`;
    console.log(`Try Loading ${absKey}`)
    if (this.cache.has(absKey)) {
      return this.cache.get(absKey)!.url;
    }

    // 1. Read raw source
    const raw = await this.app.vault.adapter.read(filePath);

    // 2. Rewrite imports
    const rewritten = await this.rewriteImports(raw, basePath, modPath);
    console.log(`File Rewritten ${filePath}`)
    console.log(this.cache)

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

    this.manifest.push({
      name: filePath,
      version: "local",
      url: blobUrl,
      from,
    });

    console.log()

    return blobUrl;
  }



  /**
   * Rewrite import statements to point at blob URLs.
   */
  private async rewriteImports(code: string, basePath: string, modPath: string): Promise<string> {
    const importRegex = /import\s+(?:.+?\s+from\s+)?["']([^"']+)["']/g;

    const CORE_CM = new Set([
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/commands",
      "@codemirror/search"
    ]);

    const fromPath = path.join(basePath, modPath)

    const rewritten = await this.replaceAsync(code, importRegex, async (match, specifier) => {

      if (CORE_CM.has(specifier)) {
        console.log(`Core Import: ${match} ${specifier}`);

        // side-effect-only import: import "@codemirror/state";
        if (/^import\s+['"]/.test(match)) {
          return `window.__HOST_CM__["${specifier}"];`;
        }

        // import * as X from "@codemirror/state";
        const starMatch = /^import\s+\*\s+as\s+(\w+)\s+from\s+['"][^'"]+['"]/.exec(match);
        if (starMatch) {
          const varName = starMatch[1];
          return `const ${varName} = window.__HOST_CM__["${specifier}"];`;
        }

        // Handle named imports: import { A, B as C } from "specifier";
        const namedMatch = /^import\s+{([^}]+)}\s+from\s+['"][^'"]+['"]/.exec(match);
        if (namedMatch) {
          const importsList = namedMatch[1].split(',').map(s => s.trim()).map(s => {
            // convert `X as Y` → `X: Y`
            const [orig, alias] = s.split(/\s+as\s+/);
            return alias ? `${orig.trim()}: ${alias.trim()}` : orig.trim();
          }).join(', ');

          return `const { ${importsList} } = window.__HOST_CM__["${specifier}"];`;
        }

        // fallback: just return the match unmodified
        return match;
      }

      if (specifier.startsWith(".") || specifier.startsWith("/")) {

        console.log(`relative ${fromPath} ${specifier}`)
        // local relative path inside user-provided extension
        const resolvedPath = this.resolvePath(fromPath, specifier);

        console.log(`Resolved: ${resolvedPath}`)

        const url = await this.loadModuleRecursive(basePath, resolvedPath, specifier);
        return match.replace(specifier, url);
      } else {
        // bare import like "@codemirror/state"

        console.log(`From Path: ${fromPath}`)
        const { version, entryPath } = await this.resolvePackage(basePath, specifier);

        

        const depKey = `${specifier}@${version}`;

        console.log(`bare import ${depKey}`)
        if (this.cache.has(depKey)) {
          return match.replace(specifier, this.cache.get(depKey)!.url);
        }

        const raw = await this.app.vault.adapter.read(entryPath);

        console.log(`Rewrite dependency: ${basePath} ${modPath}, ${entryPath}`)
        const rewrittenDep = await this.rewriteImports(raw, basePath, modPath);

        const blob = new Blob([rewrittenDep], { type: "application/javascript" });
        const blobUrl = URL.createObjectURL(blob);

        console.log(`Set Dep Key ${depKey}`)
        this.cache.set(depKey, {
          key: depKey,
          url: blobUrl,
          version,
          name: specifier,
        });

        this.manifest.push({
          name: specifier,
          version,
          url: blobUrl,
          from: fromPath,
        });

        return match.replace(specifier, blobUrl);
      }
    });

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
    const entry = pkg.module || pkg.main || "index.js";
    const entryPath = `${pkgPath}/${entry}`;

    // Do some compatability check to determine if the extension's package fits with source codemirror (TODO)

    console.log(`Resolved Package ${entryPath} ${version}`)
    return { version, entryPath };
  }

  /**
   * Utility: resolve "./foo.js" relative to "fromPath"
   */
  private resolvePath(fromPath: string, relative: string): string {
    const parts = fromPath.split("/");
    parts.pop(); // remove filename
    const resolved = [...parts, relative].join("/");
    return resolved;
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
