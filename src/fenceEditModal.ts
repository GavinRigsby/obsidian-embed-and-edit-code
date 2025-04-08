import { Modal, Notice, TFile } from "obsidian";
import { mountCodeEditor } from "./mountCodeEditor";
import CodeFilesPlugin from "./main";
import { FenceEditContext } from "./fenceEditContext";
import { getLanguageExtension } from "./ObsidianUtils";
import { LanguageSupport } from "@codemirror/language";

export class FenceEditModal extends Modal {
	private codeEditor: mountCodeEditor;

	private constructor(
		private plugin: CodeFilesPlugin,
		private code: string,
		private language: LanguageSupport,
		private onSave: (changedCode: string) => void
	) {
		super(plugin.app);
	}

	onOpen() {
		super.onOpen();

		this.codeEditor = new mountCodeEditor(
			this.contentEl,
			this.plugin,
			this.code,
			this.language,
		);

		this.modalEl.setCssProps({
			"--dialog-width": "90vw",
			"--dialog-height": "90vh",
		});
		this.modalEl.classList.add("dialog-height")

		let closeButton = this.modalEl.querySelector<HTMLDivElement>(
			".modal-close-button"
		)
		this.modalEl.classList.add(".btn-close-modal")
	}

	onClose() {
		super.onClose();
		this.onSave(this.codeEditor.getValue());
	}

	static async openOnCurrentCode(plugin: CodeFilesPlugin) {
		const context = FenceEditContext.create(plugin);

		if (!context.isInFence()) {
			new Notice("Your cursor is currently not in a valid code block.");
			return;
		}

		const fenceData = context.getFenceData();

		if (!fenceData) {
			return;
		}

		const language = await getLanguageExtension(fenceData.content)

		if (language == null){
			return;
		}

		new FenceEditModal(
			plugin,
			fenceData.content,
			language,
			(value) => context.replaceFenceContent(value)
		).open();
	}

}
