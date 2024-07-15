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

export const DEFAULT_SETTINGS: EmbedAndEditSettings = {
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

export const viewType = "code-editor";

