
import { Modifier, Scope, TextFileView, TFile, WorkspaceLeaf } from "obsidian";
import { viewType } from "./settings";
import CodeFilesPlugin from "./main";
import { getLanguageExtension } from "./ObsidianUtils";
import { EditorView, KeyBinding, keymap } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { espresso } from 'thememirror';
import { loadModules } from "./embedSettings";


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
		await super.onOpen();
	}

	async onLoadFile(file: TFile) {
		// Set up the container for the CodeMirror editor
		const container = this.contentEl;
		container.empty();

		const languageExtension = await getLanguageExtension(file.extension);

		if (languageExtension == null) {
			console.error(`No language found for extension .${file.extension}`)
			return;
		}

		let loadedModules = await loadModules(this.plugin, this.app.vault.adapter)
		let extensions = loadedModules["extension"]
		let keymaps = loadedModules["keymap"] as KeyBinding[]
		let themes = loadedModules["theme"]
		
		console.log("Editor Extensions:")
		console.log(extensions)

		// Create the CodeMirror editor instance
		this.codeMirrorEditor = new EditorView({
			doc: await this.app.vault.read(file),
			extensions: [
				minimalSetup,
				// showMinimap.compute(['doc'], (state) => {
				// 	return {
				// 		create,
				// 		/* optional */
				// 		displayText: 'characters',
				// 		showOverlay: 'mouse-over'
				// 	}
				// }),
				// vscodeSearch,
				// EditorView.lineWrapping // enable word wrapping
				 keymap.of([
				 	...keymaps
				 ]),
				// SymbolTree,
				//espresso,
				languageExtension,
				...extensions,
				...themes
			],
			parent: container,
		});

		// const symbolTreePlugin = this.codeMirrorEditor.plugin(SymbolTree);

		// if (symbolTreePlugin) {
		// 	symbolTreePlugin.updateOptions({
		// 		side: 'right' // Change the side to right
		// 	});
		// }

		this.overrideHotkeyFunctions();

		await super.onLoadFile(file);

		const cmEditorDiv = document.querySelector(".cm-editor") as HTMLDivElement | null;

		if (cmEditorDiv) {
			cmEditorDiv.style.height = "86vh"
		}
		else {
			console.error("Editor Div not found!")
		}
	}

	// Used to override Obsidian Hotkeys that conflict with editor hotkeys
	private overrideHotkeyFunctions() {

		this.scope = new Scope(this.app.scope)

		const bindings = this.codeMirrorEditor.state.facet(keymap).flat();

		for (const binding of bindings) {
			// Skip if no key or run function
			if (!binding.key || !binding.run) continue;
	
			// Convert "Mod-Shift-C" => { modifiers: ["Mod", "Shift"], key: "C" }
			const parts = binding.key.split("-");
			const key = parts.pop(); // actual key
			const modifiers = parts;
	
			this.scope.register(modifiers as Modifier[], key!, (evt: KeyboardEvent) => {
				this.runEditorCommand(evt);
			});
		}
	}

	private normalizeKey(event: KeyboardEvent): string {
		const isMac = /Mac/i.test(navigator.userAgent);
		const parts: string[] = [];

		if ((isMac && event.metaKey) || (!isMac && event.ctrlKey)) parts.push("Mod");
		if (event.altKey) parts.push("Alt");
		if (event.shiftKey) parts.push("Shift");
		let key = event.key;
		if (key === " ") key = "Space";
		else if (key === "Esc") key = "Escape";
		else if (key.startsWith("Arrow")) key = key;
		else key = key.length === 1 ? key.toLowerCase() : key;

		parts.push(key);

		return parts.join("-");
	}

	private runEditorCommand(event: KeyboardEvent) {
		if (!this.codeMirrorEditor) return;

		const key = this.normalizeKey(event);
		const bindings = this.codeMirrorEditor.state.facet(keymap).flat();
		const match = bindings.reverse().find(b => b.key === key);

		if (match) {
			const handled = match.run?.(this.codeMirrorEditor);
			
			if (handled) {
				event.preventDefault();
				event.stopPropagation();
			}
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
		if (this.codeMirrorEditor){
			this.codeMirrorEditor.requestMeasure();
		}		
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
