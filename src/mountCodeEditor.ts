
import CodeFilesPlugin from "./main";
import { EditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { LanguageSupport } from "@codemirror/language";
import { basicSetup } from "codemirror";

export class mountCodeEditor {
	contentEl: HTMLElement;
	value = "";
	codeMirrorEditor: EditorView;
	plugin: CodeFilesPlugin;

	constructor(contentEl: HTMLElement, plugin: CodeFilesPlugin, code: string, language: LanguageSupport, miniMap: boolean = true, wordWrap: boolean = false) {
		this.contentEl = contentEl;
		this.plugin = plugin;
		this.value = code;
		
		// Basic editor mostly just syntax highlighting (all functionality within codeEditorView)
		this.codeMirrorEditor = new EditorView({
            doc: code,
            extensions: [
				basicSetup,
                language,
                oneDark
            ],
            parent: this.contentEl,
        });
	}

	getValue() {
		return this.codeMirrorEditor.state.doc.toString();
	}
}
