import EmbedCodeFile from './main';

import { PluginSettingTab, Setting, App } from 'obsidian';

export interface EmbedAndEditSettings {
	extensions: string[];
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

export const DEFAULT_SETTINGS: EmbedAndEditSettings = {
	extensions: ["ts", "js", "py", "css", "c", "cpp", "go", "rs", "java", "lua", "php"],
	folding: true,
	allowAllFiletypes: false,
	lineNumbers: true,
	wordWrap: true,
	minimap: true,
	semanticValidation: true,
	syntaxValidation: true,
	themeColor: "AUTO",
	fontSize: 16,
}

export const viewType = "vscode-editor";

