import { Plugin, addIcon } from 'obsidian';
import { viewType, DEFAULT_SETTINGS, CodeMirrorSettings, CodeMirrorModuleConfig } from "./settings";
import { CodeEditorView } from "./codeEditorView";
import { CreateCodeFileModal } from "./createCodeFileModal";
import { CodeFilesSettingsTab } from "./codeFilesSettingsTab";
import { t } from 'src/lang/helpers';
import { FenceEditModal } from "./fenceEditModal";
import { FenceEditContext } from "./fenceEditContext";
import { mountCodeEditor } from "./mountCodeEditor";
import { extensions } from './constants';
import { getLanguageExtension } from './ObsidianUtils';
import path from 'path';
import { embeddedCode } from './embeddedCode';
import { ModuleConfig, ModuleSettings } from './embedSettings';
import { ExtensionLoader } from './extensionLoader';

import * as CMState from '@codemirror/state'
import * as CMView from '@codemirror/view'
import * as CMSearch from '@codemirror/search'
import * as CMCommands from '@codemirror/commands'
import * as CMLint from '@codemirror/lint'
import * as CMLanguage from '@codemirror/language'
import * as LEZCommon from '@lezer/common'
import * as LEZHighlight from '@lezer/highlight'

;(window as any).__HOST_CM__ = {
	"@codemirror/state": CMState,
	"@codemirror/view": CMView,
	"@codemirror/search": CMSearch,
	"@codemirror/commands": CMCommands,
	"@codemirror/lint": CMLint,
	"@codemirror/language": CMLanguage,
	"@lezer/common": LEZCommon,
	"@lezer/highlight": LEZHighlight
}

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
	settings: CodeMirrorSettings;
	observer: MutationObserver;
	extensionLoader: ExtensionLoader;


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
		
		//const server = new LocalServer(8443);
		//const publicPath = path.join((this.app.vault.adapter as any).basePath, '.obsidian', 'plugins', 'embed-and-edit-code', 'modules')
		//server.start(publicPath);
		
		await this.loadSettings();

		this.extensionLoader = new ExtensionLoader(this.app, this);
		this.addSettingTab(new CodeFilesSettingsTab(this.app, this));

		// Create custom refresh svg as Lucide refresh fills incorrectly in codeblock
		addIcon("code-refresh", `<g transform="matrix(3.33 0 0 3.33 50 50)"  >
		<path style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill-rule: nonzero; opacity: 1;"  transform=" translate(-15, -15)" d="M 15 3 C 12.031398 3 9.3028202 4.0834384 7.2070312 5.875 C 6.92097953443116 6.102722442718219 6.781996312146395 6.468394217532747 6.84458079887411 6.828625043966701 C 6.907165285601823 7.188855870400655 7.161341070445081 7.486222400749947 7.507438614792125 7.604118779359328 C 7.8535361591391695 7.722015157968709 8.236385060652946 7.641647866224133 8.5058594 7.394531200000001 C 10.25407 5.9000929 12.516602 5 15 5 C 20.19656 5 24.450989 8.9379267 24.951172 14 L 22 14 L 26 20 L 30 14 L 26.949219 14 C 26.437925 7.8516588 21.277839 3 15 3 z M 4 10 L 0 16 L 3.0507812 16 C 3.562075 22.148341 8.7221607 27 15 27 C 17.968602 27 20.69718 25.916562 22.792969 24.125 C 23.07902234348135 23.89727811487935 23.21800696636432 23.531605633011267 23.155422803510252 23.17137377040107 C 23.092838640656183 22.811141907790866 22.838662106347986 22.51377449397328 22.492563490644887 22.395878266348475 C 22.14646487494179 22.27798203872367 21.76361505519577 22.35835059547272 21.494141 22.605469 C 19.74593 24.099907 17.483398 25 15 25 C 9.80344 25 5.5490109 21.062074 5.0488281 16 L 8 16 L 4 10 z" stroke-linecap="round" />
		</g>`)

		this.registerMarkdownCodeBlockProcessor(`embed-code`, async (meta, el, ctx) => {
			let embed = new embeddedCode(el, this, ctx);
			await embed.parseYaml(meta);
			embed.render();
		});

		if (this.app.workspace.getLeavesOfType(viewType).length < 1) {
			this.registerView(viewType, leaf => new CodeEditorView(leaf, this));
		}


		try {
			this.registerExtensions(extensions, viewType);
		} catch (e) {
			console.log("Register Extension Error: " + e)
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

			new CreateCodeFileModal(this, activeFile).open();
		});

		this.addCommand({
			id: 'create',
			name: 'Create new code file',
			callback: async () => {
				let activeFile = this.app.workspace.getActiveFile() ?? undefined;

				new CreateCodeFileModal(this, activeFile).open();
			}
		});

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {

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
			if (mutation.length !== 1 || mutation[0].addedNodes.length !== 1 || this.hover.linkText === null) return;

			//@ts-ignore
			if (mutation[0].addedNodes[0].className !== "popover hover-popover") return;
			const file = this.app.metadataCache.getFirstLinkpathDest(this.hover.linkText, this.hover.sourcePath);
			if (!file) return;
			const fileContent = await this.app.vault.read(file);


			let language = await getLanguageExtension(file.extension)
			if (language == null) {
				console.log("No Language Found")
				return
			}
			const node: Node = mutation[0].addedNodes[0];
			const contentEl = createDiv();
			new mountCodeEditor(
				contentEl,
				this,
				fileContent,
				language,
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

				let left = `${x + gep}px`;
				let top = '';

				let spaceBelow = window.innerHeight - y - gep * 3;
				let spaceAbove = y - gep * 3;
				if (spaceBelow > h) {
					top = `${targetBottom + gep}px`;
				} else if (spaceAbove > h) {
					top = `${targetTop - h - gep}px`;
				} else {
					top = `${targetTop - (h / 2) - gep}px`;
					left = `${targeRight + gep * 2}px`;
				}

				node.setCssProps({
					"postion": "absolution",
					"left": left,
					"top": top
				})
			}

			contentEl.setCssProps({
				"width": `${w}px`,
				"height": `${h}px`,
				"padding-top": "10px",
				"padding-bottom": "10px",
				"overflow-y": "auto"
			});

			node.empty();
			node.appendChild(contentEl);

		});

		this.observer.observe(document, { childList: true, subtree: true });

		this.registerEvent(this.app.workspace.on("hover-link", async (event: any) => {
			const linkText: string = event.linktext;
			const sourcePath: string = event.sourcePath;
			if (!linkText || !sourcePath) return;
			this.hover.linkText = linkText;
			this.hover.sourcePath = sourcePath;
			this.hover.event = event.event;
		}));


	}

	onunload() {
		const openLeaves = this.app.workspace.getLeavesOfType(viewType);
		openLeaves.forEach((leaf) => leaf.detach());
		this.observer.disconnect();
		this.extensionLoader.cleanup();
	}

	async loadSettings() {
		this.settings = Object.assign({},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);

		console.log(`Loaded Settings:`)
		console.log(this.settings)

		this.settings.moduleDefintions = await this.loadCodemirrorModules();
		
		for (const definition in this.settings.moduleDefintions) {
			if (!this.settings.modules) {
				this.settings.modules = []
			}

			const moduleDef : ModuleConfig = {
				moduleId: definition,
				enabled: true,
				preferences: {}
			}
			
			if (this.settings.modules.filter(m => m.moduleId == definition).length == 0){
				console.log(`Adding Module ${definition}`)
				this.settings.modules.push(moduleDef)
			}

			
		}
	}

	// Loads the data from the .embedSettings files
	async loadCodemirrorModules(): Promise<Record<string, ModuleSettings>> {

		const adapter = this.app.vault.adapter;

		console.log(path.join((adapter as any).getBasePath?.()));
		const pluginPath = path.join('.obsidian', 'plugins', this.manifest.id);

		let modulePath = path.join(pluginPath, 'modules');
		if (!await adapter.exists(modulePath)) {
			await adapter.mkdir(modulePath)
		}

		const { folders } = await adapter.list(modulePath);

		let modules: Record<string, ModuleSettings> = {}

		for (const folder of folders) {

			let pluginFile = path.join(folder, '.obsidianEmbedSettings');
			if (await adapter.exists(pluginFile)) {
				const info = await adapter.read(pluginFile);
				const data = JSON.parse(info) as ModuleSettings

				const moduleId = path.basename(folder)
				modules[moduleId] = data;

			} else {
				console.warn(`Cannot find .obsidianEmbedSettings file in ${folder}`)
			}
		}
		return modules
	}


	async saveSettings() {
		await this.saveData(this.settings);
	}

}
