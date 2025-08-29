import { Plugin, App, MarkdownPostProcessorContext, MarkdownRenderer, MarkdownView, Notice, parseYaml, requestUrl, setIcon, TAbstractFile, TFile, Workspace, WorkspaceLeaf } from "obsidian";
import { analyseSrcLines, extractSrcLines, getFileName, getLocalSource } from "./utils";

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

export class embeddedCode {
	title: string;
	path: string;
	lineFilter: string;
	functionFilter: string;
	embedType: string; // web or file
	codeLang: string;
	app: App;
	content: string;
	yamlConf: string;
    metaYaml: any;
	container: HTMLElement;
	plugin: Plugin;
	context: MarkdownPostProcessorContext;

	constructor(container: HTMLElement, plugin: Plugin, context: MarkdownPostProcessorContext) {
		this.container = container;
		this.container.id = "embeded-code";
		this.plugin = plugin
		this.context = context;
		this.app = this.plugin.app;
	}

	getFile(path: string) {
		return this.app.vault.getAbstractFileByPath(path);
	}

	createMetaInfo() {
		const newDiv = document.createElement('div');
		newDiv.classList.add("filepath");
		newDiv.textContent = this.path;
		newDiv.style.display = 'none';
		this.container.appendChild(newDiv);
	}

	calculateIndentation(line: string): number | null {
		if (!line.trim()) {
			return null;
		}
		// Calculate the number of leading spaces
		return line.match(/^\s*/)?.[0].length || 0;
	}

	findFunctionRange(lang: string, functionName: string, fileContent: string) {
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

		if (startLine == -1) {
			console.log(`Function could not be found`);
			return null;
		}

		let LastValidLine = -1;
		if (endDetectionMethod === 'indent') {
			// Example: Detect end by checking for a decrease in indentation
			const startIndentation = this.calculateIndentation(lines[startLine]);
			if (startIndentation != null) {
				for (let i = startLine + 1; i < lines.length; i++) {
					const currentIndentation = this.calculateIndentation(lines[i]);
					if (currentIndentation == null) {
						continue;
					}

					if (currentIndentation <= startIndentation) {
						endLine = LastValidLine; // Found a line with equal or less indentation
						break;
					}
					LastValidLine = i;
				}
			} else {
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
					endLine = i + 1; // Found the line where the closing bracket is
					break;
				}
			}

			if (endLine == -1) {
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

	filterContent() {
		let srcLinesNum: number[] = []
		const srcFunctionNameString = this.metaYaml.FUNCTION
		if (srcFunctionNameString) {
			let functions = srcFunctionNameString.split(",");

			for (let f = 0; f < functions.length; f++) {

				let functionName = functions[f];

				let foundLines = this.findFunctionRange(this.codeLang, functionName, this.content)
				if (foundLines) {
					for (let i = foundLines[0]; i <= foundLines[1]; i++) {
						srcLinesNum.push(i);
					}
				}
			}

			//Sort and add ... in gaps
			if (functions.length > 1) {
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

		const srcLinesNumString = this.metaYaml.LINES
		if (srcLinesNumString) {
			srcLinesNum = analyseSrcLines(srcLinesNumString)
		}

		if (srcLinesNum.length != 0) {
			this.content = extractSrcLines(this.content, srcLinesNum)
		}
	}

	async parseYaml(yamlContent: string) {
		this.yamlConf = yamlContent;
		let tFile: TAbstractFile | null;
		try {
			this.metaYaml = parseYaml(this.yamlConf)
		} catch (e) {
			await MarkdownRenderer.render(this.app, "`ERROR: invalid embedding (invalid YAML)`", this.container, '', this.plugin)
			return
		}

		let srcPath = this.metaYaml.PATH ?? this.metaYaml.FILE
		if (!srcPath) {
			await MarkdownRenderer.render(this.app, "`ERROR: invalid source path`", this.container, '', this.plugin)
			return
		}

		if (srcPath.startsWith("https://") || srcPath.startsWith("http://")) {
			try {
				let httpResp = await requestUrl({ url: srcPath, method: "GET" })
				this.path = srcPath.replace(/^(http[s]?:\/\/)/, '');
				this.content = httpResp.text
				this.embedType = "web";
			} catch (e) {
				const errMsg = `\`ERROR: could't fetch '${srcPath}'\``
				await MarkdownRenderer.render(this.app, errMsg, this.container, '', this.plugin)
				return
			}
		} else if (srcPath.startsWith("vault://")) {
			this.path = srcPath.replace(/^(vault:\/\/)/, '');
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
					this.embedType = "file"
				} else {
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

		this.title = this.metaYaml.TITLE
		if (!this.title) {
			this.title = getFileName(this.path)
		}

        this.codeLang = this.title.split('.').at(-1)!

		this.filterContent();

	}

	// parseYaml needs to be called before this function
	async render() {
		this.filterContent();
		MarkdownRenderer.render(this.app, '```' + this.codeLang + '\n' + this.content + '\n```', this.container, '', this.plugin);
		this.addTitleLivePreview();
		this.addModifyButton();
	}

	addModifyButton() {
		let editButton = this.container.querySelector('.markdown-code-edit') as HTMLButtonElement;

		if (editButton) {
			editButton.addEventListener('click', async () => {
				let file = this.getFile(this.path);
				this.editFile(file, this.app.workspace, this.embedType == "web");
			});
		} else {
			new Notice(`Cannot locate Edit Button`);
		}

		let refreshButton = this.container.querySelector('.markdown-code-refresh') as HTMLButtonElement;

		if (refreshButton) {
			refreshButton.addEventListener('click', async () => {
				let file = this.getFile(this.path);
				this.Refresh(this.app.workspace, this.container);
			});
		} else {
			new Notice(`Cannot locate Refresh Button`);
		}

		let copyButton = this.container.querySelector('.copy-code-button') as HTMLButtonElement;
		if (copyButton) {
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

	editFile(tFile: TAbstractFile | null, workspace: Workspace, webFile: boolean) {
		if (tFile !== null) {
			let currentFile = workspace.getActiveFile()?.path;
			this.openFile(tFile.path);
			if (currentFile) {
				this.tryRefresh(workspace, currentFile, tFile.path, 3000, 300000);
			} else {
			}

		} else if (webFile) {
			new Notice(`Cannot directly edit website loaded files (consider saving locally)`);
		} else {
			new Notice(`Error opening file for editing!`);
		}
	}

	openFile(path: string) {
		let alreadyOpen = false;

		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (alreadyOpen) { return }
			const viewState = leaf.getViewState();
			if (viewState.state?.file == path) {

				// file is already open in another leaf
				this.app.workspace.setActiveLeaf(leaf);
				alreadyOpen = true;
			}
		});

		if (!alreadyOpen) {
			// Create new tab
			this.app.workspace.openLinkText(path, path, true);
		}
	}

	Refresh(space: Workspace, element: HTMLElement) {
		space.getActiveViewOfType(MarkdownView)?.previewMode.rerender(true);

		element.childNodes[1].remove();

		this.render().then();
	}

	tryRefresh(space: Workspace, currentFile: string, codePath: string, interval: number, timeout: number) {
		let elapsedTime = 0;

		const intervalId = setInterval(() => {
			if (space.getActiveFile()?.path == currentFile) {
				// Condition is met, stop waiting
				clearInterval(intervalId);

				//Handle refreshing page

				space.containerEl.findAll("#embeded-code").forEach(element => {
					var elementPath = element.find('.filepath')?.textContent;
					if (elementPath == codePath) {
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