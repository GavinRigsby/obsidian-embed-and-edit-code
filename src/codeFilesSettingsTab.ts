import { App, DataAdapter, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import CodeFilesPlugin from "./main";
import { t } from 'src/lang/helpers';
import decompress from 'decompress';
import * as fs from "fs"
import * as https from 'https';
import { THEME_COLOR } from "./constants";
import path from "path";
import EmbedAndEditCode from "./main";
import { ExtensionExport, ExtensionType, InitStyle, InitStyles, ModuleSettings } from "./embedSettings";
import de from "./lang/locale/de";

(globalThis as any).codemirrorModules = {
	"@codemirror/state": require("@codemirror/state"),
	"@codemirror/view": require("@codemirror/view"),
	"@codemirror/language": require("@codemirror/language")
};

type SourceType = "npm" | "github";

export interface CustomPluginData {
	sourceType: "npm" | "github";
	source: string;
	name: string; 
	description: string;
	imports: ImportEntry[];
}

export interface ImportEntry {
	name: string;
	value: string;
	type: ExtensionType;	
	setup: InitStyle;		// constant, function, facet
	configs?: ConfigEntry[]; // Facets or Functions may need config
}

export interface ConfigEntry {
	key: string;
	name: string;
	optional?: boolean;
	type: "string" | "boolean" | "number" | "object";
	default: any;
	options?: any[];
	
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class CustomModuleModal extends Modal {

	plugin: EmbedAndEditCode;

	constructor(app: App, plugin: EmbedAndEditCode) {
		super(app);
		this.plugin = plugin
	}

	private data: CustomPluginData = {
		name: "",
		description: "",
		source: "",
		sourceType: "npm",
		imports: []
	}

	onOpen() {
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
				drop.setValue("npm");
				drop.onChange((val: SourceType) => {
					this.data.sourceType = val;
					sourceSetting.setName(val === "npm" ? "Package Name" : "GitHub URL");
					sourceSetting.setDesc(val === "npm" ? "Enter the NPM package name": "Enter the Github URL")
				});
			});

		// Source (Package name or URL)
		const sourceSetting = new Setting(contentEl)
			.setName("Package Name")
			.setDesc("Enter the NPM package name")
			.addText(text => text.onChange(val => this.data.source = val));

		// Name
		new Setting(contentEl)
			.setName("Plugin Name")
			.setDesc("Name of the plugin in the Obsidian settings")
			.addText(text => text.onChange(val => this.data.name = val));

		// Description
		new Setting(contentEl)
			.setName("Description")
			.setDesc("Description of what this plugin does")
			.addTextArea(text => text.onChange(val => this.data.description = val));

		// Imports		
		const addImportField = () => {
			const importEntry: ImportEntry = { name: "", value: "", type: "extension", setup: "constant" };
			this.data.imports.push(importEntry);

			// Wrapper with styles to separate entries
			const wrapper = importsContainer.createDiv("import-entry-wrapper");
			wrapper.style.border = "1px solid var(--background-modifier-border)";
			wrapper.style.padding = "8px";
			wrapper.style.marginBottom = "10px";
			wrapper.style.borderRadius = "6px";
			wrapper.style.backgroundColor = "var(--background-primary)";

			// Name and Import Name row
			new Setting(wrapper)
				.setName("Import Info")
				.addText(text => text
					.setPlaceholder("Readable Name")
					.setValue(importEntry.name)
					.onChange(val => importEntry.name = val))
				.addText(text => text
					.setPlaceholder("Import name")
					.setValue(importEntry.value)
					.onChange(val => importEntry.value = val));

			// Type and Setup style row
			new Setting(wrapper)
				.setName("Module Type")
				.addDropdown(drop => drop
					.addOptions({
						extension: "Extension",
						theme: "Theme",
						keymap: "Keymap",
						lang: "Language"
					})
					.setValue(importEntry.type)
					.onChange(val => {
						importEntry.type = val as ImportEntry["type"];
						themeStyleSetting.settingEl.style.display = val === "theme" ? "" : "none";
						extensionFormatSettings.settingEl.style.display = val === "extension" ? "" : "none";
					}))
			
			const extensionFormatSettings = new Setting(wrapper)
				.setName("Extension Format")
				.setDesc("Choose how this extension should be provided to CodeMirror. \nSome extensions are used directly, while others need to be called as functions or configured through facets.")
				.addDropdown(drop => {
					drop.setValue(importEntry.setup)
						.onChange(val => {
							importEntry.setup = val as InitStyle
							functionExtensionWrapper.style.display = val === "function" ? "" : "none";
						})
						.addOptions( InitStyles.reduce<Record<string, string>>((acc, word) => {
							acc[word] = capitalize(word);
							return acc;
							}, {}))
				});


			const functionExtensionWrapper = wrapper.createDiv();

			// Add an h2 and description
			functionExtensionWrapper.createEl("h2", { text: "Function options" });

			functionExtensionWrapper.style.display = "none";

			new Setting(functionExtensionWrapper)
			.setName("Function Arguments")
			.setDesc("Add arguments to be passed to the function when initializing the extension")
			.setHeading()
			.addButton(btn => btn.setButtonText("+ Add Function Arugment").onClick(() => addFunctionConfig(importEntry, functionExtensionWrapper)));


			const themeStyleSetting = new Setting(wrapper)
				.setName("Theme Style")
				.addDropdown(drop => {
					drop.setValue("full")
						.addOptions({
							full: "Full",
							base: "Base"
						})
				});

			themeStyleSetting.settingEl.style.display = importEntry.type === "theme" ? "" : "none"

			// Trash button
			new Setting(wrapper)
				.addExtraButton(btn => btn
					.setIcon("trash")
					.setTooltip("Remove import")
					.onClick(() => {
						this.data.imports.remove(importEntry);
						wrapper.remove();
					}));
		};


		const addFunctionConfig = (parent: any, functionExtensionWrapper: HTMLDivElement, nestingIndex = 1) => {
			const configEntry: ConfigEntry = {
				key: "", name: "", type: "string", default: "",
			};
			parent.configs = [configEntry];

			const color = nestingIndex % 2 == 0 ? "var(--background-primary)" : "var(--background-secondary)";
			
			const configWrapper = functionExtensionWrapper.createDiv("config-entry-wrapper");
			configWrapper.style.border = "1px dashed var(--background-modifier-border)";
			configWrapper.style.padding = "8px";
			configWrapper.style.marginBottom = "10px";
			configWrapper.style.borderRadius = "6px";
			configWrapper.style.backgroundColor = color;

			new Setting(configWrapper)
				.setName("Argument Name")
				.setDesc("Name of the argument to be passed to the function")
				.addText(text => 
					text.setPlaceholder("arg1")
					.setValue(configEntry.key)
					.onChange(val => configEntry.key = val))
				
			new Setting(configWrapper)
				.setName("Argument Type")
				.setDesc("Type of the argument")
				.addDropdown(drop => drop
					.addOptions({
						string: "String",
						number: "Number",
						boolean: "Boolean",
						object: "Object"
					})
					.setValue(configEntry.type)
					.onChange(val => {
						configEntry.type = val as ConfigEntry["type"];
						updateType();
					}));
				
			updateType();
			
			new Setting(configWrapper)
				.setName("Optional")
				.addToggle(toggle => toggle
					.setValue(!!configEntry.optional)
					.onChange(val => configEntry.optional = val));
			
			const defaultValueSetting = new Setting(configWrapper)
				.setName("Default Value")
				.setDesc("Default value if no value is provided")
			

			const allowedOptionsSetting = new Setting(configWrapper)
				.setName("Allowed Options")
				.setDesc("Allowed options for this argument (for enum types) - comma separated")
				.addText(text => text
					.setPlaceholder("option1, option2, option3")
					.setValue(configEntry.options ? configEntry.options.join(", ") : "")
					.onChange(val => configEntry.options = val.split(",").map(s => s.trim())));

			function updateType() {

				defaultValueSetting.clear();

				defaultValueSetting.setName("Default Value")
				.setDesc("Default value if no value is provided")

				if (configEntry.type === "boolean") {

					defaultValueSetting.addToggle(toggle => toggle
						.setValue(!!configEntry.default)
						.onChange(val => configEntry.default = val));
					
					allowedOptionsSetting.settingEl.style.display = "none";
					nestedArgumentSettings.settingEl.style.display = "none";
				} 
				else if (configEntry.type === "number") {
					
					defaultValueSetting.addText(text => text
						.setPlaceholder("0")
						.setValue(configEntry.default.toString())
						.onChange(val => configEntry.default = parseInt(val) || 0));

					allowedOptionsSetting.settingEl.style.display = "none";
					nestedArgumentSettings.settingEl.style.display = "none";
				}
				else if (configEntry.type === "string") 
				{
					defaultValueSetting.addText(text => text
						.setPlaceholder("default")
						.setValue(configEntry.default)
						.onChange(val => configEntry.default = val));

					allowedOptionsSetting.settingEl.style.display = "";
					nestedArgumentSettings.settingEl.style.display = "none";
				} 
				else {
					nestedArgumentSettings.settingEl.style.display = "";
					defaultValueSetting.settingEl.style.display = "none";
				}
			}

			const nestedArgumentSettings = new Setting(configWrapper)
			.setName("Arguments")
			.setDesc("Add arguments for nested objects")
			.setHeading()
			.addButton(btn => btn.setButtonText("+ Add Function Arugment").onClick(() => addFunctionConfig(configEntry, configWrapper, nestingIndex + 1)));

			nestedArgumentSettings.settingEl.style.display = "none";
		}

		const importsContainer = contentEl.createDiv();

		new Setting(importsContainer)
			.setName("Plugin Modules")
			.setDesc("Codemirror theme, extension, language, or keymap to import from the plugin")
			.setHeading()
			.addButton(btn => btn.setButtonText("+ Add Module").onClick(addImportField));

		// Confirm / Cancel
		new Setting(contentEl)
			.addButton(btn => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(btn => btn.setButtonText("Add Plugin").setCta().onClick(() => this.onSubmit()));
	}


	async downloadZip(url: string, destinationPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const fileStream = fs.createWriteStream(destinationPath);
			console.log(url)
			https.get(url, (res) => {

				if (res.statusCode === 302 && res.headers.location) {
					// Follow redirect
					return this.downloadZip(res.headers.location, destinationPath).then(resolve).catch(reject);
				}

				if (res.statusCode !== 200) {
					reject(new Error(`Download failed with status ${res.statusCode}`));
					return;
				}
				res.pipe(fileStream);
				fileStream.on('finish', () => {
					fileStream.close();
					resolve();
				});
			}).on('error', (err) => {
				fs.unlinkSync(destinationPath);
				reject(err);
			});
		});
	}
	
	private async rewriteImports(dir: string, root: string, baseUrl: string) {
		const files = await fs.promises.readdir(dir, { withFileTypes: true });
		const dependencyDir = path.join(root, 'dependencies');
		const packageEntryCache = new Map<string, string>();

		for (const file of files) {
			const fullPath = path.join(dir, file.name);
			if (file.isDirectory()) {
				await this.rewriteImports(fullPath, root, baseUrl);
			} else if (file.isFile() && file.name.endsWith('js')) {
				let content = await fs.promises.readFile(fullPath, 'utf-8');

				// Handles both import ... from '...' and import '...'
				const importRegex = /import\s*{\s*([^}]+?)\s*}\s*from\s*['"]([^'"]+)['"]/g;
				// Handles require('...')
				const requireRegex = /(?:var|let|const)\s+([a-zA-Z0-9_$]+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;

				const matches = [...content.matchAll(importRegex), ...content.matchAll(requireRegex)];

				for (const match of matches) {

					const imports = match[1];
					const fullPkg = match[2];

					console.log(match);
					const safePkgName = fullPkg.replace('/', '__')

					if (!packageEntryCache.has(fullPkg)) {

						// Check if package is present in globals
						if (fullPkg in (globalThis as any).codemirrorModules) {

							let import_str = `const { ${imports} } = globalThis.codemirrorModules["${fullPkg}"]`
							console.log(`${fullPkg} in shared packages`)
							console.log(import_str)
							console.log(match)

							content = content.replace(match[0], import_str);
							continue;
						}

						// not global get entry from package.json						
						const pkgPath = path.join(dependencyDir, safePkgName, 'package.json');

						try {
							const pkgJsonRaw = await fs.promises.readFile(pkgPath, 'utf-8');
							const pkgJson = JSON.parse(pkgJsonRaw);
							
							const mainEntry = pkgJson.module || pkgJson.exports?.import || pkgJson.main || 'index.js';
							packageEntryCache.set(fullPkg, mainEntry);
						} catch (e) {
							console.log(`ERROR FINDING ENTRY ${e}`)
							packageEntryCache.set(fullPkg, 'index.js'); // fallback
						}
					}
					
					const entryFile = packageEntryCache.get(fullPkg)!;
					console.log(`Main entry for ${safePkgName} is ${entryFile}`)

					const fullUrl = `${baseUrl}/dependencies/${safePkgName}/${entryFile}`.replace(/\\/g, '/');


					// Replace using the original match string
					content = content.replace(match[0], match[0].replace(fullPkg, fullUrl));
				}

				await fs.promises.writeFile(fullPath, content);
			}
		}
	}

	private async downloadPackageWithDependencies(
		packageName: string,
		outputDir: string,
		version: string = 'latest',
		seen = new Set<string>(),
		dependency: boolean = false
	) {

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

		const folder = dependency ? path.join(outputDir, "dependencies", packageName.replace('/', '__')) : outputDir//path.join(outputDir, packageName.replace('/', '__'));

		// Download and extract
		const tarResponse = await fetch(tarballUrl);
		if (!tarResponse.ok) throw new Error(`Failed to download tarball for ${packageName}`);
		await fs.promises.mkdir(folder, { recursive: true });

		const arrayBuffer = await tarResponse.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		await decompress(buffer, folder, {
			strip: 1
		});

		// Recursively download dependencies
		const pkgJsonPath = path.join(folder, 'package.json');
		const content = await fs.promises.readFile(pkgJsonPath, 'utf-8');
		const parsed = JSON.parse(content);
		const deps = parsed.dependencies || {};

		console.log("DEPS")
		console.log(deps)

		for (const [depName, depVersion] of Object.entries(deps)) {

			if (depName in (globalThis as any).codemirrorModules){
				continue; // skip these
			}

			await this.downloadPackageWithDependencies(depName, outputDir, (depVersion as string).replace("^", ""), seen, true);
		}
	}

	async onSubmit() {
		if (!this.data.name || !this.data.source) {
			new Notice("Please fill in the required fields.");
			return;
		}

		const pluginPath = path.join('.obsidian', 'plugins', 'embed-and-edit-code', 'modules');
		let dest = path.join(pluginPath, this.data.name.replace(" ", "_"))
		const adapter = this.app.vault.adapter;
		await adapter.mkdir(dest);
		let absdest = path.join((adapter as any).basePath, dest)

		if (this.data.sourceType == "npm") {
			const packageName = this.data.source;

			await this.downloadPackageWithDependencies(packageName, absdest);
			await this.rewriteImports(absdest, absdest, `http://localhost:8443/${this.data.name.replace(" ", "_")}`)
		}
		else {
			const repoUrl = this.data.source;
			const match = repoUrl.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/([\w.-]+))?/);

			if (!match) throw new Error("Invalid GitHub URL");

			const [, owner, repo, branch] = match;
			const zipUrl = `https://github.com/${owner}/${repo.split('.')[0]}/archive/refs/heads/${branch || 'main'}.zip`;
			let tmpZip = path.join(absdest, "tmp.zip");
			console.log(tmpZip)
			await this.downloadZip(zipUrl, tmpZip);
			console.log("DOWNLOADED")
			await decompress(tmpZip, absdest);
			await fs.rm(tmpZip, () => { });
		}

		// The files have been downloaded now lets create the config
		let settingsFile = path.join(dest, ".obsidianEmbedSettings")
		let pkg = await this.findFirstFile(adapter, dest, "package.json")
		if (!pkg) console.warn("ISSUE FINDING PACKAGE");

		else {
			let pkgContent = await adapter.read(pkg)

			adapter.list

			let pkgDir = path.dirname(pkg)

			let pkgData = JSON.parse(pkgContent)

			let settingsData = {
				name: this.data.name,
				description: this.data.description,
				entry: pkgData.module || pkgData.exports.import,
				imports: this.data.imports.map(x => {

					if (x.type == "theme") {
						this.plugin.settings.availableThemes.push({
							name: x.name,
							moduleId: this.data.name
						})
					}
					return {
						name: x.value,
						type: x.type,
						setup: x.setup,
					}
				})
			}

			this.plugin.settings.moduleDefintions![this.data.name] = settingsData as ModuleSettings

			this.plugin.settings.modules!.push({
				moduleId: this.data.name,
				enabled: false,
				preferences: {}
			});


			console.log(settingsData);
			console.log(this.plugin.settings)

			adapter.write(path.normalize(settingsFile), JSON.stringify(settingsData, null, 2))
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
	onSelect: (moduleId: string) => void;
	onAddCustom: () => void;

	constructor(app: App, onSelect: (id: string) => void, onAddCustom: () => void) {
		super(app);
		this.onSelect = onSelect;
		this.onAddCustom = onAddCustom;
	}

	onOpen() {
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
				this.onSelect(module.id);
			};
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class CodeMirrorModuleSettingsModal extends Modal {
	module: ModuleSettings;
	plugin: CodeFilesPlugin;

	

	constructor(app: App, plugin: CodeFilesPlugin, module: ModuleSettings) {
		super(app);
		this.module = module;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: `${this.module.name} Settings` });

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
			contentEl.createEl("h3", {text: "Themes"});
		}

		console.log("THEME")
		importData.themes.forEach( theme => {
			let enabled = this.plugin.settings.availableThemes.filter(t => t.name == theme.name).length == 1;

			new Setting(contentEl)
			.setName(theme.name)
			.setClass("indented-setting")
			.addToggle(toggle =>
				toggle
				.setValue(enabled)
				.onChange(async (value) => {
					if (value) {
						this.plugin.settings.availableThemes.push({
							name: theme.name,
							moduleId: module.id
						});
					} else {
						this.plugin.settings.availableThemes.remove({
							name: theme.name,
							moduleId: module.id
						});
					}
					await this.plugin.saveSettings();
				})
			)
		})

		console.log("EXTENSION")
		if (importData.extensions.length > 0) {
			contentEl.createEl("h3", {text: "Extensions"});
		}

		importData.extensions.forEach( extension => {
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
		})

		console.log("LANG")
		if (importData.languages.length > 0) {
			contentEl.createEl("h3", {text: "Languages"});
		}

		importData.languages.forEach( language => {
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
		})

		console.log("KEYMAPS")
		if (importData.keymaps.length > 0) {
			contentEl.createEl("h3", {text: "Keymaps"});
		}

		importData.keymaps.forEach( keymap => {
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
			)
		})
		
	}

	onClose() {
		this.contentEl.empty();
	}
}

export class CodeFilesSettingsTab extends PluginSettingTab {
	plugin: CodeFilesPlugin;

	constructor(app: App, plugin: CodeFilesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
				this.plugin.settings.availableThemes.forEach(x => dropdown.addOption(x.name, x.name))
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
			.setName(t('MINIMAP'))
			.setDesc(t('MINIMAP_DESC'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.minimap)
				.onChange(async (value) => {
					this.plugin.settings.minimap = value;
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
						new AddCodeMirrorPluginModal(
							this.app,
							(selectedModuleId) => {
								// Handle adding supported module
								console.log("Add supported module:", selectedModuleId);
								// Add logic here to enable and load the module
							},
							() => {
								// Handle adding custom module
								console.log("Show file picker or path input for custom module");
								// You could show a file dialog or another modal for input
								new CustomModuleModal(this.app, this.plugin).open();
							}
						).open();					
					})
			);


		let moduleDiv = document.createElement("div")

		const RenderModules = () => {
			// Render the list of extensions
			moduleDiv.innerHTML = ""

			this.plugin.settings.modules?.forEach((ext, index) => {

				const moduleDefinition = this.plugin.settings.moduleDefintions![ext.moduleId]

				const extSetting = new Setting(moduleDiv)
				.setName(moduleDefinition.name)
				.addToggle(toggle =>
					toggle
						.setValue(ext.enabled)
						.onChange(async (value) => {
							this.plugin.settings.modules![index].enabled = value;
							await this.plugin.saveSettings();
						})
				)
				.addButton(btn =>
					btn.setIcon('pencil')
						.setTooltip('Edit Settings')
						.onClick(() => {
							// Open edit modal
							new CodeMirrorModuleSettingsModal(this.app, this.plugin, moduleDefinition).open();
						})
				)
				.addButton(btn =>
					btn.setIcon('trash')
						.setTooltip('Delete Extension')
						.setClass('mod-warning')
						.onClick(async () => {
							// Remove the module

						})
				);

				this.containerEl.appendChild(moduleDiv);
			});
		}

		RenderModules();
	}
}
