
import { normalizePath, TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import { viewType } from "./settings";
import CodeFilesPlugin from "./main";
import { Extension } from '@codemirror/state';
import { getLanguage, getThemeColor, genEditorSettings, getLanguageExtension } from "./ObsidianUtils";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { showMinimap } from "@replit/codemirror-minimap"
import {defaultKeymap} from "@codemirror/commands"
import {
	defaultHighlightStyle, syntaxHighlighting, indentOnInput,
	bracketMatching, foldGutter, foldKeymap,
	LanguageSupport
  } from "@codemirror/language"

import {
	autocompletion, completionKeymap, closeBrackets,
	closeBracketsKeymap
} from "@codemirror/autocomplete"
import { searchKeymap, search } from "@codemirror/search"
import { SymbolTree } from "@rigstech/codemirror-symboltree"


export class CodeEditorView extends TextFileView {

	value = "";
	codeMirrorEditor: EditorView;


	constructor(leaf: WorkspaceLeaf, private plugin: CodeFilesPlugin) {
		super(leaf);
	}

	/*
	execute order: onOpen -> onLoadFile -> setViewData -> onUnloadFile -> onClose
	*/
	async onOpen() {
		console.log("Opened Editor")
		await super.onOpen();
	}

	async onLoadFile(file: TFile) {
		// Set up the container for the CodeMirror editor
        const container = this.contentEl;
		container.empty();

		const languageExtension = await getLanguageExtension(file.extension);

		if (languageExtension == null){
			console.error(`No language found for extension .${file.extension}`)
			return;
		}

		console.log(`Open new file with language ${languageExtension.language.name}`)

		let setting = genEditorSettings(this.plugin.settings, this.file?.extension ?? "");
	
		let create = (v: EditorView) => {
			const dom = document.createElement('div');
			return { dom }
		}

		// Create the CodeMirror editor instance
        this.codeMirrorEditor = new EditorView({
            doc: await this.app.vault.read(file),
            extensions: [
                basicSetup,
				showMinimap.compute(['doc'], (state) => {
					return {
					  create,
					  /* optional */
					  displayText: 'characters',
					  showOverlay: 'mouse-over'
					}
				}),
				search(),
				keymap.of([...defaultKeymap, ...searchKeymap]),
				SymbolTree,
                languageExtension,
                oneDark
            ],
            parent: container,
        });

		const symbolTreePlugin = this.codeMirrorEditor.plugin(SymbolTree);

		if (symbolTreePlugin) {
		 	symbolTreePlugin.updateOptions({
		 		side: 'right' // Change the side to right
		 	});
		} 
		
		// const model = this.monacoEditor.getModel();
		// monaco.editor.setModelLanguage(model, this.getLanguage());
		await super.onLoadFile(file);

		const cmEditorDiv = document.querySelector(".cm-editor") as HTMLDivElement | null;

		if (cmEditorDiv){
			cmEditorDiv.style.height = "86vh"
		}
		else {
			console.error("Editor Div not found!")
		}
	}

	async onUnloadFile(file: TFile) {
		await super.onUnloadFile(file);
		this.codeMirrorEditor.destroy();
	}

	async onClose() {
		await super.onClose();
	}

	onResize() {
		this.codeMirrorEditor.requestMeasure();
	}

	getViewType(): string {
		return viewType;
	}

	getContext(file?: TFile) {
		return file?.path ?? this.file?.path;
	}

	getViewData = () => {
		return this.codeMirrorEditor.state.doc.toString();
	}

	setViewData = (data: string, clear: boolean) => {
		if (clear) {
            this.codeMirrorEditor.dispatch({
                changes: { from: 0, to: this.codeMirrorEditor.state.doc.length, insert: data }
            });
        } else {
            this.codeMirrorEditor.dispatch({
                changes: { from: this.codeMirrorEditor.state.doc.length, insert: data }
            });
        }
	}

	clear = () => {
		this.codeMirrorEditor.dispatch({
            changes: { from: 0, to: this.codeMirrorEditor.state.doc.length, insert: '' }
        });
	}
}
