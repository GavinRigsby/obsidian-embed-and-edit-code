import { DataAdapter, FileSystemAdapter } from "obsidian";
import { CodeMirrorSettings } from "./settings";
import { Extension } from "@codemirror/state"
import path from "path";
import CodeFilesPlugin from "./main";
import { readFileSync } from "fs";
import { KeyBinding, EditorView } from "@codemirror/view";
export type ConfigType = "string" | "number" | "boolean" | "enum";
export type ExtensionType = "extension" | "theme" | "keymap" | "language";
export type InitStyle = "constant" | "function" | "facet"
export const ConfigTypes = ["string" , "number" , "boolean" , "enum"]
export const ExtensionTypes = ["extension" , "theme" , "keymap" , "language"]
export const InitStyles = ["constant", "function", "facet"]

interface ConfigOption {
    name: string;
    type: ConfigType;
    default: string | number | boolean;
    options?: string[]; // for enum
}

interface PostFunctionCall {
    function: string;
    args?: any[];
}

interface BaseExport {
    name: string;
    type: ExtensionType;
    config?: ConfigOption[];
}

interface ThemeExport {
    name: string;
    type: 'theme'
    themeType: 'base' | 'full'
    config?: ConfigOption[];
}

interface FunctionInit {
    setup: "function";
    args?: Record<string, any>;
    post?: PostFunctionCall[];
}

interface FacetInit {
    setup: "facet";
    compute: {
        with: string;
        method: string;
        args?: Record<string, any>;
    };
    post?: PostFunctionCall[];
}

interface ConstInit {
    setup: "const";
    post?: PostFunctionCall[];
}

export type ExtensionExport = (BaseExport | ThemeExport) & (FunctionInit | FacetInit | ConstInit);

export interface ModuleSettings {
    name: string, 
    description: string,
    entry: string;
    imports: ExtensionExport[];
}

export interface ModuleConfig {
    moduleId: string,
    enabled: boolean;
    preferences: Record<string, any>; // stores user supplied config values
}

function resolveTemplates(obj: any, configValues: Record<string, any>): any {
    if (typeof obj === "string") {
        return obj.replace(/{{(.*?)}}/g, (_, key) => configValues[key]?.toString() ?? "");
    }
    if (Array.isArray(obj)) {
        return obj.map(v => resolveTemplates(v, configValues));
    }
    if (typeof obj === "object" && obj !== null) {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(obj)) {
            result[k] = resolveTemplates(v, configValues);
        }
        return result;
    }
    return obj;
}

export interface CM_Plugins {
    extension: Extension[]
    theme: Extension[]
    keymap: KeyBinding[]
    language: Extension[]
}

// 📥 Load and creates module instance and populates configs for module
export async function loadModules(plugin: CodeFilesPlugin, adapter: DataAdapter) : Promise<Record<string, Extension[]>> {

    const appConfig = plugin.settings

    let settings = {
        extension: [] as Extension[],
        keymap: [] as Extension[],
        theme: [] as Extension[],
        language: [] as Extension[]
    }

    console.log("LOAD MODULES")

    for (const module of (appConfig.modules ?? [])) {
        if (!module.enabled) continue;

        console.log("Module Enabled:")
        console.log(module.moduleId)
        
        const modulePath = `${plugin.manifest.dir}/modules/${module.moduleId}`
        const jsonSettings = await adapter.read(`/${modulePath}/.obsidianEmbedSettings`)
        const embedSettings: ModuleSettings = JSON.parse(jsonSettings)

        
        const modSettings = await plugin.extensionLoader.loadExtension(modulePath, embedSettings);


        console.log(modSettings.extension)
        settings.extension = settings.extension.concat(modSettings.extension)
        settings.keymap = settings.keymap.concat(modSettings.keymap)
        settings.theme = settings.theme.concat(modSettings.theme)
    }

    return settings
}

// Dummy resolvers (replace with actual implementations)
async function resolveFunction(path: string, name: string, args: any) {
    console.log(`Calling ${name} with`, args);
    return { extension: true };
}

async function computeFacet(path: string, method: string, args: any) {
    console.log(`Computing facet via ${method} with`, args);
    return { extension: true };
}

async function resolveConst(path: string, name: string) {
    const mod = await import(path);
    const result = mod[name];

    return result;
}