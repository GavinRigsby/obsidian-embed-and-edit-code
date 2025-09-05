import { ModuleConfig, ModuleSettings } from "./embedSettings";

export interface EmbedAndEditSettings {
	folding: boolean
	allowAllFiletypes: boolean;
	lineNumbers: boolean;
	wordWrap: boolean;
	minimap: boolean;
	semanticValidation: boolean;
	syntaxValidation: boolean;
	themeColor: string;
	fontSize: number;
}

type ModuleImport = string | CodeMirrorGeneric

export interface CodeMirrorExtensionSetting {
	id: string;
	name: string;
	imports: ModuleImport[]
	enabled: boolean;
	config?: any; // you can define a more specific type if needed
}

export interface CodeMirrorGeneric {

}

export interface CodeMirrorImport {
	name: string;
	value: string;
	type: "Theme" | "Keymap" | "Extension" | "Language"
}

export interface CodemirrorSetup {
	type: "computedExtension",
	dependencies: string[],
	factory: any
}

export interface CodeMirrorModuleConfig {
	name: string,
	description: string,
	entry: string,
	imports: CodeMirrorImport[],
	setup: CodemirrorSetup,
	config: CodeMirrorModuleSettings[]
}

export interface CodeMirrorModuleSettings {
	key: string,
	label: string,
	type: string,
	default: any,
	options: string[]
}

export interface Theme {
	name: string;
	id: string;
	moduleId: string; // Module name or BuiltIn
}

export interface CodeMirrorSettings {
	folding: boolean
	allowAllFiletypes: boolean;
	lineNumbers: boolean;
	wordWrap: boolean;
	semanticValidation: boolean;
	syntaxValidation: boolean;
	themeColor: string;
	fontSize: number;
	availableThemes: Theme[];
	
	// Enabled Codemirror Community Extensions
	theme: string;
	extensions: string[];
	keymaps: string[];
	languages: string[];

	modules?: ModuleConfig[] // saved module data from user (active, settings)
	moduleDefintions?: Record<string, ModuleSettings> // Allows useage of id to reference defintion (loaded from module settings)
}

export const DEFAULT_SETTINGS: CodeMirrorSettings = {
	folding: true,
	allowAllFiletypes: false,
	lineNumbers: true,
	wordWrap: true,
	semanticValidation: true,
	syntaxValidation: true,
	themeColor: "AUTO",
	fontSize: 16,
	theme: "One Dark",
	extensions: [],
	keymaps: [],
	languages: [],
	availableThemes: [{
		name: "One Dark",
		id: "one-dark",
		moduleId: "BuiltIn"
	}]
}

export const viewType = "code-editor";