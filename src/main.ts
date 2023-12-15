import { Plugin, MarkdownRenderer, TFile, MarkdownPostProcessorContext, MarkdownView, parseYaml, requestUrl} from 'obsidian';
import { EmbedAndEditSettings, viewType, DEFAULT_SETTINGS} from "./settings";
import { analyseSrcLines, extractSrcLines, getLocalSource, getFileName} from "./utils";
import { CodeEditorView } from "./codeEditorView";
import { CreateCodeFileModal } from "./createCodeFileModal";
import { CodeFilesSettingsTab } from "./codeFilesSettingsTab";
import { t } from 'src/lang/helpers';
import { FenceEditModal } from "./fenceEditModal";
import { FenceEditContext } from "./fenceEditContext";
import { mountCodeEditor } from "./mountCodeEditor";
import { getLanguage } from './ObsidianUtils';

declare module "obsidian" {
	interface Workspace {
		on(
			name: "hover-link",
			callback: (e: MouseEvent) => any,
			ctx?: any,
		): EventRef;
	}
}


export default class EmbedAndEditCode extends Plugin {
	settings: EmbedAndEditSettings;
	observer: MutationObserver;

	public hover: {
		linkText: string;
		sourcePath: string;
		event: MouseEvent;
	} = {
			linkText: "",
			sourcePath: "",
			event: new MouseEvent(""),
		};


	async onload() {
		await this.loadSettings();

		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));

		this.registerMarkdownPostProcessor((element, context) => {
			this.addTitle(element, context);
		});

		this.settings.extensions.forEach(e => {
			let l = getLanguage(e)
			this.registerRenderer(l)
		});

		if (!this.app.workspace.getLeavesOfType(viewType)){
			this.registerView(viewType, leaf => new CodeEditorView(leaf, this));
		}

		try {
			this.registerExtensions(this.settings.extensions, viewType);
		} catch (e) {
		}
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				menu.addItem((item) => {
					item
						.setTitle(t("CREATE_CODE"))
						.setIcon("file-json")
						.onClick(async () => {
							new CreateCodeFileModal(this, file).open();
						});
				});
			})
		);

		this.addRibbonIcon('file-json', t("CREATE_CODE"), async () => {
			let activeFile = this.app.workspace.getActiveFile() ?? undefined;
			if (activeFile){
				console.log(`create file at ${activeFile?.path}`)
			}else{
				console.log("Can't get active")
			}
			new CreateCodeFileModal(this, activeFile).open();
		});

		this.addCommand({
			id: 'create',
			name: 'Create new code file',
			callback: async () => {
				let activeFile = this.app.workspace.getActiveFile() ?? undefined;
				if (activeFile){
					console.log(`create file at ${activeFile?.path}`)
				}else{
					console.log("Can't get active")
				}
				
				new CreateCodeFileModal(this, activeFile).open();
			}
		});
		
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu) => {
				if (!FenceEditContext.create(this).isInFence()) {
					return;
				}
				menu.addItem((item) => {
					item.setTitle(t("EDIT_FENCE"))
						.setIcon("code")
						.onClick(() => {
							FenceEditModal.openOnCurrentCode(this);
						});
				});
			})
		);


		//internal links
		this.observer = new MutationObserver(async (mutation) => {
			if (mutation.length !== 1) return;
			if (mutation[0].addedNodes.length !== 1) return;
			if (this.hover.linkText === null) return;
			//@ts-ignore
			if (mutation[0].addedNodes[0].className !== "popover hover-popover") return;
			const file = this.app.metadataCache.getFirstLinkpathDest(this.hover.linkText, this.hover.sourcePath);
			if (!file) return;
			// check file.extension in this.settings.extensions array
			let valid = this.settings.extensions.includes(file.extension);
			if (valid === false) return;
			const fileContent = await this.app.vault.read(file);

			const node: Node = mutation[0].addedNodes[0];
			const contentEl = createDiv();
			new mountCodeEditor(
				contentEl,
				this,
				fileContent,
				file.extension,
				false,
				true
			);

			let w = 700;
			let h = 500;
			let gep = 10;
			if (node instanceof HTMLDivElement) {
				let x = this.hover.event.clientX;
				let y = this.hover.event.clientY;
				let target = this.hover.event.target as HTMLElement;
				let targetRect = target.getBoundingClientRect();
				let targetTop = targetRect.top;
				let targetBottom = targetRect.bottom;
				let targeRight = targetRect.right
				node.style.position = "absolute";
				node.style.left = `${x + gep}px`;

				let spaceBelow = window.innerHeight - y - gep * 3;
				let spaceAbove = y - gep * 3;
				if (spaceBelow > h) {
					node.style.top = `${targetBottom + gep}px`;
				} else if (spaceAbove > h) {
					node.style.top = `${targetTop - h - gep}px`;
				} else {
					node.style.top = `${targetTop - (h / 2) - gep}px`;
					node.style.left = `${targeRight + gep * 2}px`;
				}
			}

			contentEl.setCssProps({
				"width": `${w}px`,
				"height": `${h}px`,
				"padding-top": "10px",
				"padding-bottom": "10px",
			});

			node.empty();
			node.appendChild(contentEl);

		});

		this.registerEvent(this.app.workspace.on("hover-link", async (event: any) => {
			const linkText: string = event.linktext;
			const sourcePath: string = event.sourcePath;
			if (!linkText || !sourcePath) return;
			this.hover.linkText = linkText;
			this.hover.sourcePath = sourcePath;
			this.hover.event = event.event;
		}));

		this.observer.observe(document, { childList: true, subtree: true });

	}

	onunload() {
		const openLeaves = this.app.workspace.getLeavesOfType(viewType);
        openLeaves.forEach((leaf) => leaf.detach());
		this.observer.disconnect();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() { 
		await this.saveData(this.settings);
	}

	async registerRenderer(lang: string) {
		this.registerMarkdownCodeBlockProcessor(`embed-${lang}`, async (meta, el, ctx) => {
			let fullSrc = ""
			let src = ""

			let metaYaml: any
			try {
				metaYaml = parseYaml(meta)
			} catch(e) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid embedding (invalid YAML)`", el, '', this)
				return
			}

			let srcPath = metaYaml.PATH
			if (!srcPath) {
				await MarkdownRenderer.renderMarkdown("`ERROR: invalid source path`", el, '', this)
				return
			}

			if (srcPath.startsWith("https://") || srcPath.startsWith("http://")) {
				try {
					let httpResp = await requestUrl({url: srcPath, method: "GET"})
					fullSrc = httpResp.text
				} catch(e) {
					const errMsg = `\`ERROR: could't fetch '${srcPath}'\``
					await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
					return
				}
			} else if (srcPath.startsWith("vault://")) {
				srcPath = srcPath.replace(/^(vault:\/\/)/,'');

				var tFile = app.vault.getAbstractFileByPath(srcPath)
				if (tFile instanceof TFile) {
					fullSrc = await app.vault.read(tFile)
				} else {

					srcPath = getLocalSource(ctx, srcPath)
					tFile = app.vault.getAbstractFileByPath(srcPath)
					if (tFile instanceof TFile) {
						fullSrc = await app.vault.read(tFile)
					}else{
						const errMsg = `\`ERROR: could't read file '${srcPath}'\``
						await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
						return
					}
				}
			} else {
				const errMsg = "`ERROR: invalid source path, use 'vault://...' or 'http[s]://...'`"
				await MarkdownRenderer.renderMarkdown(errMsg, el, '', this)
				return
			}

			let srcLinesNum: number[] = []
			const srcLinesNumString = metaYaml.LINES
			if (srcLinesNumString) {
				srcLinesNum = analyseSrcLines(srcLinesNumString)
			}

			if (srcLinesNum.length == 0) {
				src = fullSrc
			} else {
				src = extractSrcLines(fullSrc, srcLinesNum)
			}

			let title = metaYaml.TITLE
			if (!title) {
				title = getFileName(srcPath)
			}

			await MarkdownRenderer.renderMarkdown('```' + lang + '\n' + src + '\n```', el, '', this)
			this.addTitleLivePreview(el, title);
		});
	}

	addTitleLivePreview(el: HTMLElement, title: string) {
		const codeElm = el.querySelector('pre > code')
		if (!codeElm) { return }
		const pre = codeElm.parentElement as HTMLPreElement;

		this.insertTitlePreElement(pre, title)
	}

	addTitle(el: HTMLElement, context: MarkdownPostProcessorContext) {
		// add some commecnt 
		let codeElm = el.querySelector('pre > code')
		if (!codeElm) {
			return
		}

		const pre = codeElm.parentElement as HTMLPreElement;

		const codeSection = context.getSectionInfo(pre)
		if (!codeSection) {
			return
		}

		const view = app.workspace.getActiveViewOfType(MarkdownView)
		if (!view) {
			return
		}

		const num = codeSection.lineStart
		const codeBlockFirstLine = view.editor.getLine(num)

		let matchTitle = codeBlockFirstLine.match(/TITLE:\s*"([^"]*)"/i)
		if (matchTitle == null) {
			return
		}

		const title = matchTitle[1]
		if (title == "") {
			return
		}

		this.insertTitlePreElement(pre, title)

		this.attachModifyListener(codeElm, pre)
	}

	attachModifyListener(codeElm: Element, pre: HTMLPreElement){
		let editButton = pre.querySelector('.obsidian-markdown-code-edit')
		if (editButton){
			editButton.addEventListener('click', () => {
			
			});
		}
	}

	insertTitlePreElement(pre: HTMLPreElement, title: string) {
		// Creates Title
		let titleElement = document.createElement("pre");
		titleElement.appendText(title);
		titleElement.className = "obsidian-embed-code-file";
		pre.prepend(titleElement);

		// Creates Modify Button
		let editButton = document.createElement("button");
		editButton.appendText("Modify")
		editButton.addClass("obsidian-markdown-code-edit")
		
		pre.append(editButton)
	}
}
