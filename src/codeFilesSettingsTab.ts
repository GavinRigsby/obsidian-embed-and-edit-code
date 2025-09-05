import { App, DataAdapter, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import CodeFilesPlugin from "./main";
import { t } from 'src/lang/helpers';
import { THEME_COLOR } from "./constants";
import path from "path";
import EmbedAndEditCode from "./main";
import { ExtensionExport, ModuleSettings } from "./embedSettings";
import { PluginSettingsModal } from "./pluginSettingsModal";
import { unzipSync, Unzipped, decompressSync } from "fflate";
import { TarLocalFile, untar } from "untar.js";
import { ensureDir } from "./utils";

type SourceType = "npm" | "github";

export const Capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface StartingModuleSettings extends ModuleSettings {
	source: string,
	sourceType: "npm" | "github",
}

export class CustomModuleModal extends Modal {

	plugin: EmbedAndEditCode;
	moduleModal: PluginSettingsModal;
	data: StartingModuleSettings = {
		name: "",
		id: "",
		description: "",
		entry: "",
		imports: [],
		source: "",
		sourceType: "npm",
	}

	constructor(app: App, plugin: EmbedAndEditCode) {
		super(app);
		this.plugin = plugin
		this.moduleModal = new PluginSettingsModal(app, plugin);
		this.moduleModal.setOnClose(() => {
			Object.assign(this.data, this.moduleModal.module);
			this.display();
		}); // refresh on close
	}

	onOpen() {
		this.display();
	}

	display() {
		console.log("DISPLAY MODAL")
		console.log(this.data)

		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add Custom Plugin" });

		// Source selector (NPM or GitHub)
		new Setting(contentEl)
			.setName("Source Type")
			.setDesc("Choose how to fetch the plugin's code")
			.addDropdown(drop => {
				drop.addOption("npm", "NPM Package");
				drop.addOption("github", "GitHub URL");
				drop.setValue(this.data.sourceType || "npm");
				drop.onChange((val: SourceType) => {
					this.data.sourceType = val;
					sourceSetting.setName(val === "npm" ? "Package Name" : "GitHub URL");
					sourceSetting.setDesc(val === "npm" ? "Enter the NPM package name" : "Enter the Github URL")
				});
			});

		// Source (Package name or URL)
		const sourceSetting = new Setting(contentEl)
			.setName("Package Name")
			.setDesc("Enter the NPM package name")
			.addText(text => text
				.setValue(this.data.source)
				.onChange(val => this.data.source = val));

		// Name
		new Setting(contentEl)
			.setName("Plugin Name")
			.setDesc("Name of the plugin in the Obsidian settings")
			.addText(text => text
				.onChange(val => this.data.name = val)
				.setValue(this.data.name));

		// Description
		new Setting(contentEl)
			.setName("Description")
			.setDesc("Description of what this plugin does")
			.addTextArea(text => text
				.onChange(val => this.data.description = val)
				.setValue(this.data.description));


		new Setting(contentEl)
			.setName("Plugin Modules")
			.setDesc("Codemirror theme, extension, language, or keymap to import from the plugin")
			.setHeading()
			.addButton(btn =>
				btn.setButtonText("+ Add Modules")
					.onClick(() => {
						this.moduleModal.createImport(this.data as ModuleSettings);
					}
					));


		// show already configured imports
		this.data.imports.forEach(imp => {
			new Setting(contentEl)
				.setName(imp.name)
				.setClass("indented-setting")
				.addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							this.moduleModal.showImport(this.data as ModuleSettings, imp.name)
						}))
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Module')
						.setClass('mod-warning')
						.onClick(async () => {
							this.data.imports.remove(imp);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		})

		// Confirm / Cancel
		new Setting(contentEl)
			.addButton(btn => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(btn => btn.setButtonText("Add Plugin").setCta().onClick(() => this.onSubmit()));
	}

	private async downloadFile(url: string, destinationPath: string, adapter: DataAdapter): Promise<void> {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
		const arrayBuffer = await response.arrayBuffer();
		await adapter.writeBinary(destinationPath, arrayBuffer);
	}

	// async extractZip(buffer: ArrayBuffer, outputDir: string, adapter: DataAdapter) {
	// 	const files = await decompress(Buffer.from(buffer), undefined, { strip: 1 });
	// 	for (const file of files) {
	// 		const filePath = path.join(outputDir, file.path);
	// 		if (file.type === 'file') {
	// 			await adapter.writeBinary(filePath, file.data);
	// 		} else if (file.type === 'directory') {
	// 			await adapter.mkdir(filePath);
	// 		}
	// 	}
	// }

	getBufferCopy(data: Uint8Array<ArrayBufferLike>): ArrayBuffer {
		const copy = new Uint8Array(data.length);
		copy.set(data);
		return copy.buffer;
	}


	async extractTarGz(buffer: ArrayBuffer, outputDir: string, adapter: DataAdapter) {
		const uint8 = new Uint8Array(buffer);
		const tarData = this.getBufferCopy(decompressSync(uint8)); // decompress gzip to tar Uint8Array
		const files: TarLocalFile[] = untar(tarData);

		for (const file of files) {
			const fileData = file.fileData;

			let filePath = file.name.replace(/\\/g, "/").replace(/^package\//, "");
			const fullPath = path.join(outputDir, filePath);
			// Only process files (not directories)
			if (fileData instanceof Uint8Array) {
				// Always copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
				const data = this.getBufferCopy(fileData);
				console.log(`Writing file: ${fullPath}`);
				await ensureDir(adapter, path.dirname(fullPath));
				await adapter.writeBinary(fullPath, data);
			} else {
				console.log(`Creating directory: ${fullPath}`);
				await adapter.mkdir(fullPath);
			}
		}
	}


	async extractZip(buffer: ArrayBuffer, outputDir: string, adapter: DataAdapter) {
		const uint8 = new Uint8Array(buffer);
		const files: Unzipped = unzipSync(uint8);

		for (const [filePath, fileData] of Object.entries(files)) {
			const fullPath = outputDir + "/" + filePath.replace(/\\/g, "/");
			if (fileData instanceof Uint8Array) {
				// Always copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
				const data = this.getBufferCopy(fileData);
				await adapter.writeBinary(fullPath, data);
			} else {
				await adapter.mkdir(fullPath);
			}
		}
	}


	private async downloadPackageWithDependencies(
		packageName: string,
		outputDir: string,
		version: string = 'latest',
		seen = new Set<string>(),
		dependency: boolean = false,
	) {

		const adapter = this.app.vault.adapter;
		const registryUrl = 'https://registry.npmjs.org';
		const id = `${packageName}@${version}`;
		if (seen.has(id)) return; // avoid circular deps or re-downloading
		seen.add(id);

		const encodedName = encodeURIComponent(packageName);
		console.log(`DOWNLOADING PACKAGE FROM: ${registryUrl}/${encodedName}`)
		const response = await fetch(`${registryUrl}/${encodedName}`);
		if (!response.ok) throw new Error(`Failed to fetch metadata for ${packageName}`);

		const metadata = await response.json();
		const pkg = metadata.versions[version] || metadata.versions[metadata['dist-tags'][version]];
		if (!pkg) throw new Error(`Could not resolve version ${version} of ${packageName}`);

		const tarballUrl = pkg.dist.tarball;
		const folder = dependency ? path.join(outputDir, "node_modules", packageName) : outputDir;

		await adapter.mkdir(folder);

		// Download and extract
		const tarResponse = await fetch(tarballUrl);
		if (!tarResponse.ok) throw new Error(`Failed to download tarball for ${packageName}`);
		const arrayBuffer = await tarResponse.arrayBuffer();

		await this.extractTarGz(arrayBuffer, folder, adapter);

		console.log(`Downloaded and extracted ${packageName}@${version} to ${folder}`);

		// Recursively download dependencies
		const pkgJsonPath = path.join(folder, 'package.json');
		const content = await adapter.read(pkgJsonPath);
		const parsed = JSON.parse(content);
		const deps = parsed.dependencies || {};

		// Check if in host packages
		for (const [depName, depVersion] of Object.entries(deps)) {

			if (depName in Object.keys((window as any).__HOST_CM__)) {
				console.log(`Skipping host package ${depName}`);
				continue; // skip these
			}

			console.log(`Downloading dependency ${depName}@${depVersion}`);
			await this.downloadPackageWithDependencies(depName, outputDir, (depVersion as string).replace("^", ""), seen, true);
		}
	}

	async onSubmit() {
		if (!this.data.name || !this.data.source) {
			new Notice("Please fill in the required fields.");
			return;
		}

		if (this.data.imports.length === 0) {
			new Notice("Please add at least one module to import.");
			return;
		}

		const pluginPath = path.join('.obsidian', 'plugins', 'embed-and-edit-code', 'modules');
		this.data.id = this.data.name.replace(/ /g, "-").toLowerCase();
		let dest = path.join(pluginPath, this.data.id)
		console.log(`DESTINATION PATH: ${dest}`)
		const adapter = this.app.vault.adapter;
		await adapter.mkdir(dest);

		if (this.data.sourceType == "npm") {
			const packageName = this.data.source;
			await this.downloadPackageWithDependencies(packageName, dest);
			console.log(`DOWNLOADED PACKAGE ${packageName} to ${dest}`)
		}
		else {
			const repoUrl = this.data.source;
			const match = repoUrl.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w.-]+))?/);

			if (!match) throw new Error("Invalid GitHub URL");

			const [, owner, repo, branch] = match;
			const zipUrl = `https://github.com/${owner}/${repo.split('.')[0]}/archive/refs/heads/${branch || 'main'}.zip`;
			let tmpZip = path.join(dest, "tmp.zip");
			await this.downloadFile(zipUrl, tmpZip, adapter);

			const zipBuffer = await adapter.readBinary(tmpZip);
			await this.extractZip(zipBuffer, tmpZip, adapter);

			await adapter.remove(tmpZip);

			const pkgJsonPath = path.join(dest, 'package.json');
			const content = await adapter.read(pkgJsonPath);
			const parsed = JSON.parse(content);
			const deps = parsed.dependencies || {};

			for (const [depName, depVersion] of Object.entries(deps)) {

				if (depName in Object.keys((window as any).__HOST_CM__)) {
					console.log(`Skipping package ${depName}`);
					continue; // skip these
				}

				console.log(`Downloading dependency ${depName}@${depVersion}`);
				await this.downloadPackageWithDependencies(depName, dest, (depVersion as string).replace("^", ""), new Set<string>(), true);
			}

		}

		// The files have been downloaded now lets create the config
		
		console.log(`Look for package.json in ${dest}`)
		const pkgJsonPath = path.join(dest, 'package.json');
		if (!await adapter.exists(pkgJsonPath)) console.warn("ISSUE FINDING PACKAGE");

		else {
			let pkgContent = await adapter.read(pkgJsonPath);

			let pkgData = JSON.parse(pkgContent)
			let entryPoint =
				pkgData.module ||
				pkgData.main ||
				(pkgData.exports && typeof pkgData.exports === "object" ? pkgData.exports.import : undefined) ||
				(pkgData.exports && typeof pkgData.exports === "string" ? pkgData.exports : undefined);

			console.log(`ENTRY POINT ${entryPoint}`)
			if (!entryPoint) {
				new Notice("Could not determine entry point of the package. Please ensure the package.json has a 'module', 'exports.import', or 'main' field.");
				return;
			}

			// process module and dependencies
			await this.plugin.extensionLoader.loadModuleRecursive(dest, entryPoint, "<root>")

			let settingsData = {
				name: this.data.name,
				description: this.data.description,
				entry: entryPoint,
				imports: this.data.imports.map(x => {

					// if (x.type == "theme") {
					// 	console.log("ADDING THEME TO AVAILABLE THEMES")
					// 	console.log(`${x.name} from ${this.data.id}`)
					// 	this.plugin.settings.availableThemes.push({
					// 		name: x.name,
					// 		id: x.id,
					// 		moduleId: this.data.id
					// 	})
					// }
					return {
						name: x.name,
						id: x.id,
						type: x.type,
						setup: x.setup,
					}
				})
			}

			// write data to .obsidianEmbedSettings
			await adapter.write(path.join(dest, ".obsidianEmbedSettings"), JSON.stringify(settingsData))

			this.plugin.settings.moduleDefintions![this.data.name] = settingsData as ModuleSettings

			this.plugin.settings.modules!.push({
				moduleId: this.data.name.replace(/ /g, "-").toLowerCase(),
				enabled: false,
				preferences: {}
			});

			console.log("PLUGIN SETTINGS");
			console.log(this.plugin.settings)
		}

		this.close();
	}


	findFirstFile = async (
		adapter: DataAdapter,
		rootDir: string,
		filename: string
	): Promise<string | null> => {
		try {
			const entries = await adapter.list(rootDir);

			for (const file of entries.files) {
				if (path.basename(file) === filename) {
					return file;
				}
			}

			for (const folder of entries.folders) {
				const result = await this.findFirstFile(adapter, folder, filename);
				if (result) return result;
			}

			return null;
		} catch (err) {
			console.error(`Error reading directory ${rootDir}:`, err);
			return null;
		}
	}
}

// Sample data for supported modules
const SUPPORTED_MODULES = [
	{
		name: "CodeMirror Minimap",
		description: "Adds a minimap to the editor.",
		id: "codemirror-minimap"
	},
	{
		name: "VSCode Search",
		description: "Adds vscode-style search functionality.",
		id: "codemirror-vscodesearch"
	}
];

class WarningModal extends Modal {
	onConfirm: () => void;

	constructor(app: App, onConfirm: () => void) {
		super(app);
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "⚠️ Use with Caution" });

		contentEl.createEl("p", {
			text: "Adding custom plugins can be risky. These plugins can execute code on your system, potentially introducing security or stability issues. Only add plugins from trusted sources."
		});

		new Setting(contentEl)
			.addButton(btn =>
				btn.setButtonText("Cancel")
					.onClick(() => this.close())
			)
			.addButton(btn =>
				btn.setButtonText("Proceed Anyway")
					.setWarning()
					.onClick(() => {
						this.close();
						this.onConfirm();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}


export class AddCodeMirrorPluginModal extends Modal {
	onAddCustom: () => void;
	onCloseCallback: () => void;

	constructor(app: App, plugin: EmbedAndEditCode) {
		super(app);
		this.onAddCustom = () => {
			new CustomModuleModal(app, plugin).open();
		};
	}

	addOnClose(callback: () => void) {
		this.onCloseCallback = callback;
	}

	onOpen() {
		this.display();
	}

	display() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Add CodeMirror Plugin" });

		// Add Custom Module button
		new Setting(contentEl)
			.addButton(btn =>
				btn.setButtonText("Add Custom Plugin")
					.setCta()
					.onClick(() => {
						this.close();
						new WarningModal(this.app, this.onAddCustom).open();
					})
			);

		// Supported Modules as Cards
		SUPPORTED_MODULES.forEach(module => {
			const card = contentEl.createDiv("module-card");
			card.addClass("mod-card");

			let cardLeft = card.createDiv();
			cardLeft.createEl("h3", { text: module.name });
			cardLeft.createEl("p", { text: module.description });

			const addBtn = card.createEl("button", { text: "Add Plugin" });
			addBtn.addClass("mod-cta");
			addBtn.onclick = () => {
				this.close();
				console.warn("Supported modules not yet implemented.");
			};
		});
	}

	onClose() {
		this.contentEl.empty();
		this.onCloseCallback?.();
	}
}

export class CodeMirrorModuleSettingsModal extends Modal {
	module: ModuleSettings;
	plugin: CodeFilesPlugin;
	moduleModal: PluginSettingsModal;

	onCloseCallback: () => void;

	setOnClose(callback: () => void) {
		this.onCloseCallback = callback;
	}

	constructor(app: App, plugin: CodeFilesPlugin, module: ModuleSettings) {
		super(app);
		this.plugin = plugin;
		this.module = module;
		this.moduleModal = new PluginSettingsModal(app, plugin, module);
		this.moduleModal.setOnClose(this.display.bind(this))
	}

	onOpen() {
		this.display();
	}

	display() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `${this.module.name} Settings` });

		new Setting(contentEl)
			.addButton(btn =>
				btn.setButtonText('Add Module')
					.setCta()
					.onClick(() => this.moduleModal.createImport(this.module))
			);


		// Split imports into their own types for viewing
		let importData: { [key: string]: ExtensionExport[] } = {
			extensions: [],
			themes: [],
			keymaps: [],
			languages: []
		};

		this.module.imports.forEach((imp, index) => {
			let importType = imp.type.toString() + "s";
			importData[importType].push(imp);
		})

		if (importData.themes.length > 0) {
			contentEl.createEl("h3", { text: "Themes" });
		}

		console.log("THEME")
		importData.themes.forEach(theme => {
			let enabled = this.plugin.settings.availableThemes.filter(t => t.name == theme.name).length == 1;

			new Setting(contentEl)
				.setName(theme.name)
				.setClass("indented-setting")
				.addToggle(toggle =>
					toggle
						.setValue(enabled)
						.onChange(async (value) => {
							if (value) {
								console.log("ADDING THEME TO AVAILABLE THEMES (1)")
								console.log(`${theme.name} from ${module.id}`)
								this.plugin.settings.availableThemes.push({
									name: theme.name,
									id: theme.id,
									moduleId: module.id
								});
							} else {
								console.log("REMOVING THEME FROM AVAILABLE THEMES")
								console.log(`${theme.name} from ${module.id}`)
								this.plugin.settings.availableThemes.remove({
									name: theme.name,
									id: theme.id,
									moduleId: module.id
								});
							}

							console.log(`SAVE THEME SETTINGS`)
							console.log(this.module.imports)
							await this.plugin.saveSettings();
						})
				)
				.addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							this.moduleModal.showImport(this.module, theme.name)
						}))
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Module')
						.setClass('mod-warning')
						.onClick(async () => {
							this.module.imports.remove(theme);
							this.plugin.settings.availableThemes = this.plugin.settings.availableThemes.filter(t => t.name != theme.name)
							await this.plugin.saveSettings();
							this.display();
						})
				);
		})

		console.log("EXTENSION")
		if (importData.extensions.length > 0) {
			contentEl.createEl("h3", { text: "Extensions" });
		}

		importData.extensions.forEach(extension => {
			const enabled = this.plugin.settings.extensions.includes(extension.name);


			console.log(`Extension ${extension.name} is enabled? ${enabled}`)
			console.log(this.plugin.settings.extensions)

			new Setting(contentEl)
				.setName(extension.name)
				.setClass("indented-setting")
				.addToggle(toggle =>
					toggle
						.setValue(enabled)
						.onChange(async (value) => {
							if (value) {
								this.plugin.settings.extensions.push(extension.name);

							} else {
								this.plugin.settings.extensions.remove(extension.name);
							}
							await this.plugin.saveSettings();
						})
				)
				.addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							this.moduleModal.showImport(this.module, extension.name)
						}))
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Module')
						.setClass('mod-warning')
						.onClick(async () => {
							this.module.imports.remove(extension);
							if (this.plugin.settings.extensions.includes(extension.name)) {
								this.plugin.settings.extensions.remove(extension.name);
							}
							await this.plugin.saveSettings();
							this.display();
						})
				);
		})

		console.log("LANG")
		if (importData.languages.length > 0) {
			contentEl.createEl("h3", { text: "Languages" });
		}

		importData.languages.forEach(language => {
			const enabled = this.plugin.settings.languages.includes(language.name);

			new Setting(contentEl)
				.setName(language.name)
				.setClass("indented-setting")
				.addToggle(toggle =>
					toggle
						.setValue(enabled)
						.onChange(async (value) => {
							if (value) {
								this.plugin.settings.languages.push(language.name);
							} else {
								this.plugin.settings.languages.remove(language.name);
							}
							await this.plugin.saveSettings();
						})
				)
				.addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							this.moduleModal.showImport(this.module, language.name)
						}))
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Module')
						.setClass('mod-warning')
						.onClick(async () => {
						})
				);
		})

		console.log("KEYMAPS")
		if (importData.keymaps.length > 0) {
			contentEl.createEl("h3", { text: "Keymaps" });
		}

		importData.keymaps.forEach(keymap => {
			const enabled = this.plugin.settings.keymaps.includes(keymap.name);

			new Setting(contentEl)
				.setName(keymap.name)
				.setClass("indented-setting")
				.addToggle(toggle =>
					toggle
						.setValue(enabled)
						.onChange(async (value) => {
							if (value) {
								this.plugin.settings.keymaps.push(keymap.name);
							} else {
								this.plugin.settings.keymaps.remove(keymap.name);
							}
							await this.plugin.saveSettings();
						})
				).addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							this.moduleModal.showImport(this.module, keymap.name)
						}))
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Module')
						.setClass('mod-warning')
						.onClick(async () => {
						})
				);
		})

	}

	onClose() {
		this.contentEl.empty();
		this.onCloseCallback?.();
	}
}

export class CodeFilesSettingsTab extends PluginSettingTab {
	plugin: CodeFilesPlugin;

	constructor(app: App, plugin: CodeFilesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	saveModuleSettings = async (moduleId: string, moduleDefinition: ModuleSettings) => {
		const adapter = this.app.vault.adapter;
		const basePath = path.join('.obsidian', 'plugins', 'embed-and-edit-code', 'modules');
		await adapter.write(path.join(basePath, moduleId, ".obsidianEmbedSettings"), JSON.stringify(moduleDefinition));
		await this.plugin.saveSettings();
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: t('CODE_SETTING') });

		new Setting(containerEl)
			.setName(t("BASE_COLOR"))
			.setDesc(t('BASE_COLOR_DESC'))
			.addDropdown(async (dropdown) => {
				for (const key in THEME_COLOR) {
					// @ts-ignore
					dropdown.addOption(key, t(key));
				}
				dropdown.setValue(this.plugin.settings.themeColor);
				dropdown.onChange(async (option) => {
					this.plugin.settings.themeColor = option;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Theme")
			.setDesc("Choose a theme for the editor, defaults to oneDark")
			.addDropdown(async (dropdown) => {
				this.plugin.settings.availableThemes.forEach(x => dropdown.addOption(x.id, x.name))
				dropdown.setValue(this.plugin.settings.theme);
				dropdown.onChange(async (option) => {
					this.plugin.settings.theme = option;
					await this.plugin.saveSettings();
				});
			});

		let fontSizeText: HTMLDivElement;
		new Setting(containerEl)
			.setName(t('FONT_SIZE'))
			.setDesc(t('FONT_SIZE_DESC'))
			.addSlider(slider => slider
				.setLimits(5, 30, 1)
				.setValue(this.plugin.settings.fontSize)
				.onChange(async (value) => {
					fontSizeText.innerText = " " + value.toString();
					this.plugin.settings.fontSize = value;
					await this.plugin.saveSettings();
				}))
			.settingEl.createDiv('', (el) => {
				fontSizeText = el;
				el.className = "setting-elm"
				el.innerText = " " + this.plugin.settings.fontSize.toString();
			});

		new Setting(containerEl)
			.setName(t('WORDWRAP'))
			.setDesc(t('WORDWRAP_DESC'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.wordWrap)
				.onChange(async (value) => {
					this.plugin.settings.wordWrap = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('LINE_NUMBERS'))
			.setDesc(t('LINE_NUMBERS_DESC'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.lineNumbers)
				.onChange(async (value) => {
					this.plugin.settings.lineNumbers = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('FOLDING'))
			.setDesc(t('FOLDING_DESC'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.folding)
				.onChange(async (value) => {
					this.plugin.settings.folding = value;
					await this.plugin.saveSettings();
				}));


		containerEl.createEl('h2', { text: 'Plugins' })

		new Setting(containerEl)
			.setName('Add CodeMirror Plugin')
			.setDesc('Import CodeMirror plugin to use within obsidian')
			.addButton(btn =>
				btn.setButtonText('Add Plugin')
					.setCta()
					.onClick(() => {
						const addPluginModal = new AddCodeMirrorPluginModal(
							this.app,
							this.plugin
						)
						addPluginModal.addOnClose(() => { this.display(); });
						addPluginModal.open();
					})
			);


		let moduleDiv = document.createElement("div")

		const RenderModules = () => {
			// Render the list of extensions
			moduleDiv.innerHTML = ""

			this.plugin.settings.modules?.forEach((ext, index) => {

				const moduleDefinition = this.plugin.settings.moduleDefintions![ext.moduleId]

				console.log("MODULE DEFINITION")
				console.log(moduleDefinition)

				const extSetting = new Setting(moduleDiv)
					.setName(moduleDefinition.name)
					.addToggle(toggle =>
						toggle
							.setValue(ext.enabled)
							.onChange(async (value) => {
								this.plugin.settings.modules![index].enabled = value;
								this.saveModuleSettings(ext.moduleId, moduleDefinition);
							})
					)
					.addButton(btn =>
						btn.setIcon('pencil')
							.setTooltip('Edit Settings')
							.onClick(() => {
								// Open edit modal
								const editPlugin = new CodeMirrorModuleSettingsModal(this.app, this.plugin, moduleDefinition);
								editPlugin.setOnClose(() => {
									this.saveModuleSettings(ext.moduleId, moduleDefinition);
									this.display();
								})
								editPlugin.open();
							})
					)
					.addButton(btn =>
						btn.setIcon('trash')
							.setTooltip('Delete Plugin')
							.setClass('mod-warning')
							.onClick(async () => {
								// Remove the folder and files
								const pluginPath = path.join('.obsidian', 'plugins', 'embed-and-edit-code', 'modules');
								let dest = path.join(pluginPath, ext.moduleId)
								const adapter = this.app.vault.adapter;
								adapter.rmdir(dest, true);


								this.plugin.settings.modules!.remove(ext);
								moduleDefinition.imports.forEach(imp => {
									if (imp.type == "theme" && this.plugin.settings.availableThemes.filter(t => t.name == imp.name).length == 1) {
										this.plugin.settings.availableThemes.remove({
											name: imp.name,
											id: imp.id,
											moduleId: ext.moduleId
										})
									}
									if (imp.type == "extension" && this.plugin.settings.extensions.includes(imp.name)) {
										this.plugin.settings.extensions.remove(imp.name)
									}
									if (imp.type == "language" && this.plugin.settings.languages.includes(imp.name)) {
										this.plugin.settings.languages.remove(imp.name)
									}
									if (imp.type == "keymap" && this.plugin.settings.keymaps.includes(imp.name)) {
										this.plugin.settings.keymaps.remove(imp.name)
									}
								});

								delete this.plugin.settings.moduleDefintions![ext.moduleId]
								this.saveModuleSettings(ext.moduleId, moduleDefinition);
								this.display();
							})
					);

				this.containerEl.appendChild(moduleDiv);
			});
		}

		RenderModules();
	}
}
