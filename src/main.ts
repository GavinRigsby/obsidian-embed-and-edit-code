import { Plugin, MarkdownRenderer, TFile, MarkdownPostProcessorContext, MarkdownView, parseYaml, requestUrl, Notice, TAbstractFile, WorkspaceLeaf, Workspace, App, setIcon, addIcon} from 'obsidian';
import { EmbedAndEditSettings, viewType, DEFAULT_SETTINGS} from "./settings";
import { analyseSrcLines, extractSrcLines, getLocalSource, getFileName} from "./utils";
import { CodeEditorView } from "./codeEditorView";
import { CreateCodeFileModal } from "./createCodeFileModal";
import { CodeFilesSettingsTab } from "./codeFilesSettingsTab";
import { t } from 'src/lang/helpers';
import { FenceEditModal } from "./fenceEditModal";
import { FenceEditContext } from "./fenceEditContext";
import { mountCodeEditor } from "./mountCodeEditor";
import { languages, extensions } from './constants';

declare module "obsidian" {
	interface Workspace {
		on(
			name: "hover-link",
			callback: (e: MouseEvent) => any,
			ctx?: any,
		): EventRef;
	}
}

interface FunctionTemplate {
	startTemplate: string;
	endDetectionMethod: string; // "indent", "brackets", or custom methods
}

interface LanguageTemplates {
	[key: string]: FunctionTemplate;
}

const languageTemplates: LanguageTemplates = {
	python: {
	  startTemplate: 'def\\s+${func_name}\\s*\\(',
	  endDetectionMethod: 'indent',
	},
	c: {
	  startTemplate: '(?:int|void|char)\\s+${func_name}\\s*\\([^)]*\\)\\s*\\{',
	  endDetectionMethod: 'brackets',
	},
	csharp: {
	  startTemplate: '(?:public|private|protected)\\s+(?:static\\s+)?(?:void|int|string)\\s+${func_name}\\s*\\([^)]*\\)\\s*\\{',
	  endDetectionMethod: 'brackets',
	},
	bash: {
	  startTemplate: '${func_name}\\s*\\(\\)\\s*{',
	  endDetectionMethod: 'brackets',
	},
	ruby: {
	  startTemplate: 'def\\s+${func_name}',
	  endDetectionMethod: 'indent',
	},
	javascript: {
		startTemplate: '${func_name}\\([\\w, ]*\\)\\s*{',
		endDetectionMethod: 'brackets',
	},
	// Add more languages and their templates as needed
  };

class EmbeddedCode{

	title: string;
	path: string;
	lineFilter: string;
	functionFilter: string;
	embedType: string; // web or file
	codeLang: string;
	app: App;
	content: string;
	yamlConf: string;
	container: HTMLElement;
	plugin: Plugin;
	context: MarkdownPostProcessorContext;

	constructor(container: HTMLElement, plugin: Plugin, context: MarkdownPostProcessorContext, lang: string) {
		this.container = container;
		this.container.id = "embeded-code";
		this.plugin = plugin
		this.context = context;
		this.app = this.plugin.app;
		this.codeLang = lang;
	}

	

	getFile(path: string){
		return this.app.vault.getAbstractFileByPath(path);
	}

	createMetaInfo(){
		const newDiv = document.createElement('div');
		newDiv.classList.add("filepath");
		newDiv.textContent = this.path;
		newDiv.style.display = 'none';
		this.container.appendChild(newDiv);
	}

	calculateIndentation(line: string): number | null{
		if (!line.trim()) {
			return null;
		}
		// Calculate the number of leading spaces
		return line.match(/^\s*/)?.[0].length || 0;
	}

	findFunctionRange(lang: string, functionName: string, fileContent: string){
		const template = languageTemplates[lang];

		if (!template) {
			console.error(`Templates not defined for language: ${lang}`);
			return null;
		}

		const { startTemplate, endDetectionMethod } = template;

		const startPattern = new RegExp(startTemplate.replace('${func_name}', functionName));

		const lines = fileContent.split('\n');
		let startLine = -1;
		let endLine = -1;

		for (let i = 0; i < lines.length; i++) {
			if (startPattern.test(lines[i])) {
				startLine = i;
				break;
			}
		}

		if (startLine == -1){
			console.log(`Function could not be found`);
			return null;
		}

		let LastValidLine = -1;
		if (endDetectionMethod === 'indent') {
			// Example: Detect end by checking for a decrease in indentation
			const startIndentation = this.calculateIndentation(lines[startLine]);
			if (startIndentation != null){
				for (let i = startLine + 1; i < lines.length; i++) {
					const currentIndentation = this.calculateIndentation(lines[i]);
					if (currentIndentation == null){
						continue;
					}

					if (currentIndentation <= startIndentation) {
						endLine = LastValidLine; // Found a line with equal or less indentation
						break;
					}
					LastValidLine = i;
				}
			}else{
				console.error(`Empty Function Line No Indentation Found`);
			}
			

		} else if (endDetectionMethod === 'brackets') {
			// Example: Detect end by counting opening and closing brackets
			let bracketCount = 0;
			for (let i = startLine; i < lines.length; i++) {
				const line = lines[i];
				
				bracketCount += (line.match(/\{/g) || []).length;
				bracketCount -= (line.match(/\}/g) || []).length;

				if (bracketCount == 0) {
					endLine =  i + 1; // Found the line where the closing bracket is
					break;
				}
			}

			if (endLine == -1){
				endLine = lines.length;
			}
			
		} else {
			// Custom end detection method
			// Adjust this based on your specific requirements for each language
			console.error(`Unsupported end detection method: ${endDetectionMethod}`);
			return null;
		}

		if (endLine !== -1) {
			return [startLine + 1, endLine + 1]; // Return line numbers (1-indexed)
		} else {
			new Notice(`Function ${functionName} not found in the file.`);
			return null;
		}
	}

	filterContent(){
		let metaYaml;

		try {
			metaYaml = parseYaml(this.yamlConf)
		} catch(e) {
			new Notice("`ERROR: invalid embedding (invalid YAML)`")
			return
		}

		let srcLinesNum: number[] = []
		const srcFunctionNameString = metaYaml.FUNCTION
		if (srcFunctionNameString){
			let functions = srcFunctionNameString.split(",");

			for (let f = 0; f < functions.length; f++){

				let functionName = functions[f];

				let foundLines = this.findFunctionRange(this.codeLang, functionName, this.content)
				if (foundLines){
					for (let i = foundLines[0]; i <= foundLines[1]; i++) {
						srcLinesNum.push(i);
					}
				}
			}

			//Sort and add ... in gaps
			if (functions.length > 1){
				const sortedNumbers = srcLinesNum.slice().sort((a, b) => a - b);

				// Step 2: Iterate over the sorted array and insert 0 in the gaps
				for (let i = 0; i < sortedNumbers.length - 1; i++) {
					const currentNumber = sortedNumbers[i];
					const nextNumber = sortedNumbers[i + 1];
				
					if (nextNumber - currentNumber > 1) {
						// Step 3: If a gap is found, insert 0 in the gap
						sortedNumbers.splice(i + 1, 0, 0);
					}
				}
				srcLinesNum = sortedNumbers;
			}
			srcLinesNum.push(0);

		}
		
		const srcLinesNumString = metaYaml.LINES
		if (srcLinesNumString) {
			srcLinesNum = analyseSrcLines(srcLinesNumString)
		}

		if (srcLinesNum.length != 0) {
			this.content = extractSrcLines(this.content, srcLinesNum)
		}
	}

	async parseYaml(yamlContent: string) {
		this.yamlConf = yamlContent;
		let metaYaml: any
		let tFile : TAbstractFile | null;
		try {
			metaYaml = parseYaml(this.yamlConf)
		} catch(e) {
			await MarkdownRenderer.render(this.app, "`ERROR: invalid embedding (invalid YAML)`", this.container, '', this.plugin)
			return
		}

		let srcPath = metaYaml.PATH
		if (!srcPath) {
			await MarkdownRenderer.render(this.app, "`ERROR: invalid source path`", this.container, '', this.plugin)
			return
		}

		if (srcPath.startsWith("https://") || srcPath.startsWith("http://")) {
			try {
				let httpResp = await requestUrl({url: srcPath, method: "GET"})
				this.path = srcPath.replace(/^(http[s]?:\/\/)/,'');
				this.content = httpResp.text
				this.embedType = "web";
			} catch(e) {
				const errMsg = `\`ERROR: could't fetch '${srcPath}'\``
				await MarkdownRenderer.render(this.app, errMsg, this.container, '', this.plugin)
				return
			}
		} else if (srcPath.startsWith("vault://")) {
			this.path = srcPath.replace(/^(vault:\/\/)/,'');
			tFile = this.getFile(this.path)
			if (tFile instanceof TFile) {

				this.createMetaInfo();
				this.content = await this.app.vault.read(tFile);
				this.embedType = "file";

			} else {
				this.path = getLocalSource(this.context, this.path);
				tFile = this.app.vault.getAbstractFileByPath(this.path);
				if (tFile instanceof TFile) {
					this.createMetaInfo();
					this.content = await this.app.vault.read(tFile);
					this.embedType ="file"
				}else{
					const errMsg = `\`ERROR: could't read file '${this.path}'\``
					await MarkdownRenderer.render(this.app, errMsg, this.container, '', this.plugin)
					return
				}
			}
		} else {
			const errMsg = "`ERROR: invalid source path, use 'vault://...' or 'http[s]://...'`"
			await MarkdownRenderer.render(this.app, errMsg, this.container, '', this.plugin)
			return
		}
		
		this.title = metaYaml.TITLE
		if (!this.title) {
			this.title = getFileName(this.path)
		}

		this.filterContent();

	}

	async render (){
		if (this.embedType == "file"){
			let tfile = this.getFile(this.path);
			if (tfile instanceof TFile){
				this.content = await this.app.vault.read(tfile);
			}
		}
		this.filterContent();
		MarkdownRenderer.render(this.app, '```' + this.codeLang + '\n' + this.content + '\n```', this.container, '', this.plugin);
		this.addTitleLivePreview();
		this.addModifyButton();
	}

	addModifyButton() {
		let editButton = this.container.querySelector('.markdown-code-edit') as HTMLButtonElement;

		if (editButton){
			editButton.addEventListener('click', async () => {
				let file = this.getFile(this.path);
				this.editFile(file, this.app.workspace, this.embedType == "web");
			});
		}else{
			new Notice(`Cannot locate Edit Button`);
		}

		let refreshButton = this.container.querySelector('.markdown-code-refresh') as HTMLButtonElement;

		if (refreshButton){
			refreshButton.addEventListener('click', async () => {
				let file = this.getFile(this.path);
				this.Refresh(this.app.workspace, this.container);
			});
		}else{
			new Notice(`Cannot locate Refresh Button`);
		}

		let copyButton = this.container.querySelector('.copy-code-button') as HTMLButtonElement;
		if (copyButton){
			setIcon(copyButton, 'clipboard');
			copyButton.ariaLabel = "Copy to Clipboard";
		}
		

	}

	addTitleLivePreview() {
		const codeElm = this.container.querySelector('pre > code')
		if (!codeElm) { return }
		const pre = codeElm.parentElement as HTMLPreElement;

		this.insertTitlePreElement(pre, this.title)
	}

	addTitle() {
		// add some commecnt 
		let codeElm = this.container.querySelector('pre > code')
		if (!codeElm) {
			return
		}

		const pre = codeElm.parentElement as HTMLPreElement;

		const codeSection = this.context.getSectionInfo(pre)
		if (!codeSection) {
			return
		}

		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
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
	}


	insertTitlePreElement(pre: HTMLPreElement, title: string) {
		// Creates Title
		let titleElement = document.createElement("pre");
		titleElement.appendText(title);
		titleElement.className = "embed-code-file";
		pre.prepend(titleElement);

		// Creates Modify Button
		let editButton = document.createElement("button");
		editButton.addClass("markdown-code-edit");
		setIcon(editButton, 'pencil');
		editButton.ariaLabel = "Edit Code File";
		pre.append(editButton);

		let refreshButton = document.createElement("button");
		refreshButton.addClass("markdown-code-refresh");
		setIcon(refreshButton, 'code-refresh');
		refreshButton.ariaLabel = "Refresh Content";
		pre.append(refreshButton);  
	}

	editFile(tFile : TAbstractFile | null, workspace : Workspace, webFile : boolean){
		if (tFile !== null){
			let currentFile = workspace.getActiveFile()?.path;
			this.openFile(tFile.path);
			if (currentFile){
				this.tryRefresh(workspace, currentFile, tFile.path,  3000, 300000);
			}else{
			}

		}else if (webFile){
			new Notice(`Cannot directly edit website loaded files (consider saving locally)`);
		}else{
			new Notice(`Error opening file for editing!`);
		}
	}

	openFile(path:string) {
		let alreadyOpen = false;

		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (alreadyOpen){ return }
			const viewState = leaf.getViewState();
			if (viewState.state?.file == path){
				
				// file is already open in another leaf
				this.app.workspace.setActiveLeaf(leaf);
				alreadyOpen = true;
			}
		});

		if (!alreadyOpen){
			// Create new tab
			this.app.workspace.openLinkText(path, path, true);
		}
	}



	Refresh(space: Workspace, element: HTMLElement){
		space.getActiveViewOfType(MarkdownView)?.previewMode.rerender(true);

		element.childNodes[1].remove();
		
		this.render().then();

		//var htmlContent = element.innerHTML;
		//element.innerHTML = htmlContent;
	}

	tryRefresh(space: Workspace, currentFile: string, codePath: string,  interval: number, timeout: number) {
		let elapsedTime = 0;
		
		const intervalId = setInterval(() => {
			if (space.getActiveFile()?.path == currentFile) {
			// Condition is met, stop waiting
			clearInterval(intervalId);

			//Handle refreshing page
			
			space.containerEl.findAll("#embeded-code").forEach (element =>{
				var elementPath = element.find('.filepath')?.textContent;
				if (elementPath == codePath)
				{
					this.Refresh(space, element);
					// Rerender in reading view
				}
			});
			
			} else {
				elapsedTime += interval;
			
				if (elapsedTime >= timeout) {
					// Timeout reached, stop waiting
					clearInterval(intervalId);
					console.log('Timeout reached. Stop waiting.');
				}
			}
		}, interval);
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

		// Create custom refresh svg as Lucide refresh fills incorrectly in codeblock
		addIcon("code-refresh", `<g transform="matrix(3.33 0 0 3.33 50 50)"  >
		<path style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-dashoffset: 0; stroke-linejoin: miter; stroke-miterlimit: 4; fill-rule: nonzero; opacity: 1;"  transform=" translate(-15, -15)" d="M 15 3 C 12.031398 3 9.3028202 4.0834384 7.2070312 5.875 C 6.92097953443116 6.102722442718219 6.781996312146395 6.468394217532747 6.84458079887411 6.828625043966701 C 6.907165285601823 7.188855870400655 7.161341070445081 7.486222400749947 7.507438614792125 7.604118779359328 C 7.8535361591391695 7.722015157968709 8.236385060652946 7.641647866224133 8.5058594 7.394531200000001 C 10.25407 5.9000929 12.516602 5 15 5 C 20.19656 5 24.450989 8.9379267 24.951172 14 L 22 14 L 26 20 L 30 14 L 26.949219 14 C 26.437925 7.8516588 21.277839 3 15 3 z M 4 10 L 0 16 L 3.0507812 16 C 3.562075 22.148341 8.7221607 27 15 27 C 17.968602 27 20.69718 25.916562 22.792969 24.125 C 23.07902234348135 23.89727811487935 23.21800696636432 23.531605633011267 23.155422803510252 23.17137377040107 C 23.092838640656183 22.811141907790866 22.838662106347986 22.51377449397328 22.492563490644887 22.395878266348475 C 22.14646487494179 22.27798203872367 21.76361505519577 22.35835059547272 21.494141 22.605469 C 19.74593 24.099907 17.483398 25 15 25 C 9.80344 25 5.5490109 21.062074 5.0488281 16 L 8 16 L 4 10 z" stroke-linecap="round" />
		</g>`)

		languages.forEach(e => {
			this.registerRenderer(e)
		});

		if (this.app.workspace.getLeavesOfType(viewType).length < 1){
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
					"top" : top
				})
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
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() { 
		await this.saveData(this.settings);
	}

	async registerRenderer(lang: string) {
		this.registerMarkdownCodeBlockProcessor(`embed-${lang}`, async (meta, el, ctx) => {
			let embed = new EmbeddedCode(el, this, ctx, lang);
			await embed.parseYaml(meta);
			embed.render();
			
		});
	}
}
