import { DataAdapter } from "obsidian";
import { Extension } from "@codemirror/state"
import CodeFilesPlugin from "./main";
import { KeyBinding } from "@codemirror/view";
export type ConfigType = "string" | "integer" | "boolean" | "enum" | "array" | "object" | "record" | "preset function" | "preset variable";
export const ConfigTypes = ["string" , "integer" , "boolean" , "enum", "array" , "object" , "record" , "preset function" , "preset variable"]
export type ExtensionType = "extension" | "theme" | "keymap" | "language";
export const ExtensionTypes = ["extension" , "theme" , "keymap" , "language"]
export type InitStyle = ExtensionExport["setup"]; 
export const InitStyles = ["constant", "function", "facet"]

export interface BaseConfigOption {
    name: string;
    id: string;
    type: ConfigType;
    default?: any;
}

export interface BooleanConfigOption extends BaseConfigOption {
    type: "boolean";
    default?: boolean;
}

export interface EnumConfigOption extends BaseConfigOption {
    type: "enum";
    options: string[];
    default?: string;
}

export interface ArrayConfigOption extends BaseConfigOption {
    type: "array";
    arrayType: {
        type: "string" | "integer" | "boolean";
    };
    default?: any[];
}

export interface ObjectConfigOption extends BaseConfigOption {
    type: "object";
    config?: ConfigOptions[];
    default?: Record<string, any>;
}

export interface RecordConfigOption extends BaseConfigOption {
    type: "record";
    recordType: {
        key: "string" | "integer";
        value: "string" | "integer" | "boolean" | "array" | "object" | "record";
    }
}

export type ConfigOptions = BaseConfigOption | EnumConfigOption | ObjectConfigOption | RecordConfigOption | BooleanConfigOption | ArrayConfigOption;

interface PostFunctionCall {
    function: string;
    args?: any[];
}

interface BaseExport {
    name: string;
    id: string;
    type: ExtensionType;
    config?: ConfigOptions[];
}

interface ThemeExport {
    name: string;
    id: string;
    type: 'theme';
    themeType: 'base' | 'full'
    config?: ConfigOptions[];
}

interface FunctionInit {
    setup: "function";
    args?: Record<string, any>;
    post?: PostFunctionCall[];
}

interface FacetInit {
    setup: "facet";
    dependencies: string[];
    post?: PostFunctionCall[];
}

interface ConstInit {
    setup: "constant";
    post?: PostFunctionCall[];
}

export type ExtensionExport = 
    | (BaseExport & FunctionInit)
    | (BaseExport & FacetInit)
    | (BaseExport & ConstInit)
    | (ThemeExport & ConstInit);

export interface ModuleSettings {
    name: string,
    id: string,
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

    // Check for user modules
    for (const module of (appConfig.modules ?? [])) {
        if (!module.enabled) continue;

        console.log("Module Enabled:")
        console.log(module.moduleId)
        
        const modulePath = `${plugin.manifest.dir}/modules/${module.moduleId}`
        const jsonSettings = await adapter.read(`/${modulePath}/.obsidianEmbedSettings`)
        const embedSettings: ModuleSettings = JSON.parse(jsonSettings)

        console.log("COMPARE RUNNING VS STORED")
        console.log(embedSettings)
        console.log(appConfig.moduleDefintions)
        
        const modSettings = await plugin.extensionLoader.loadExtension(modulePath, embedSettings);


        console.log(modSettings.extension)
        settings.extension = settings.extension.concat(modSettings.extension)
        settings.keymap = settings.keymap.concat(modSettings.keymap)
        settings.theme = settings.theme.concat(modSettings.theme)
    }

    // load builtin modules (if enabled)

    if (appConfig.wordWrap) {
        const { EditorView } = (window as any).__HOST_CM__["@codemirror/view"];
        settings.extension.push(EditorView.lineWrapping);
    }

    if (appConfig.lineNumbers) {
        const { lineNumbers } = (window as any).__HOST_CM__["@codemirror/view"];
        settings.extension.push(lineNumbers());
    }

    if (appConfig.folding) {
        const { foldGutter } = await import("@codemirror/fold");
        settings.extension.push(foldGutter());
    }

    if (appConfig.fontSize) {
        const { EditorView } = (window as any).__HOST_CM__["@codemirror/view"];
        settings.extension.push(EditorView.theme({
            "&": {
                fontSize: `${appConfig.fontSize}px`
            }
        }));
    }

    console.log("Final Settings:")
    console.log(settings)

    return settings
}

