import { App, Modal, Setting } from "obsidian";
import EmbedAndEditCode from "./main";
import { BooleanConfigOption, ConfigOptions, ConfigType, ConfigTypes, EnumConfigOption, ExtensionExport, ExtensionType, ExtensionTypes, InitStyle, InitStyles, ModuleSettings, ObjectConfigOption } from "./embedSettings";
import { Capitalize } from "./codeFilesSettingsTab";
import "./multiDropdown";
import { getRegistryOptions, registry } from "./codemirrorRegistry";

// You control these

const defaultModule: ModuleSettings = {
    name: "New Module",
    id: "",
    entry: "",
    description: "",
    imports: [],
    
};

export class PluginSettingsModal extends Modal {
    plugin: EmbedAndEditCode;
    module: ModuleSettings;
    import: ExtensionExport;
    prev_import: ExtensionExport;

    onCloseCallbacks?: () => void;

    constructor(app: App, plugin: EmbedAndEditCode, module: ModuleSettings = defaultModule) {
        super(app);
        this.plugin = plugin;
        this.module = module;
    }

    showModule(module: ModuleSettings) {
        this.module = module;
        this.open();
    }

    showImport(module: ModuleSettings, importName: string) {
        this.module = module;
        let filtered = this.module.imports.filter(imp => imp.name === importName);
        if (filtered.length == 1) {
            this.prev_import = filtered[0];
            this.import = structuredClone(filtered[0]);
            this.open();
        }
    }

    createImport(module: ModuleSettings) {
        this.module = module;
        this.prev_import = {
            name: "",
            id: "",
            type: "extension",
            setup: "constant"
        };
        this.import = structuredClone(this.prev_import);
        this.open();
    }

    onOpen() {
        const { contentEl } = this;
        this.display(contentEl);
    }

    setOnClose(cb: () => void) {
        this.onCloseCallbacks = cb;
    }

    async onSubmit() {
        // Push changes if it doesn't exit yet        
        if (this.module.imports.contains(this.prev_import)) {
            this.module.imports.remove(this.prev_import)
        }
        this.module.imports.push(this.import)
        
        await this.plugin.saveSettings();
        this.close();
    }

    async display(containerEl: HTMLElement) {
        containerEl.empty();

        containerEl.createEl("h2", { text: "Module Editor" });

        const importSection = (imp: ExtensionExport) => {
            const impDiv = containerEl.createDiv({ cls: "import-block" });

            // Editable fields for the import
            new Setting(impDiv)
                .setName("Name")
                .setDesc("Readable name for this module ")
                .addText(text =>
                    text.setValue(imp.name || "")
                        .onChange(async (val) => {
                            imp.name = val;
                        })
                );

            new Setting(impDiv)
                .setName("ID")
                .setDesc("Name of the export from the CodeMirror module")
                .addText(text =>
                    text.setValue(imp.id || "")
                        .onChange(async (val) => {
                            imp.id = val;
                        })
                );

            new Setting(impDiv)
            .setName("Type")
            .setDesc("Type of CodeMirror module")
            .addDropdown(drop => {
                drop.addOptions(ExtensionTypes.reduce((obj, type) => { obj[type] = Capitalize(type); return obj; }, {} as Record<string, string>))
                .setValue(imp.type || "extensions")
                .onChange(async (val: ExtensionType) => {
                    imp.type = val;
                    this.display(containerEl); // re-render with new type
                });
            });

            new Setting(impDiv)
            .setName("Setup")
            .setDesc("How to use this module")
            .addDropdown(drop => {
                drop.addOptions(InitStyles.reduce((obj, type) => { obj[type] = Capitalize(type); return obj; }, {} as Record<string, string>))
                .setValue(imp.setup || "constant")
                .onChange(async (val: InitStyle) => {
                    imp.setup = val;
                    this.display(containerEl); // re-render with new type
                });
            });

            if (imp.setup === "facet") {
                new Setting(impDiv)
                .setName("Dependencies")
                .addMultiDropdown(drop => {
                    const options = getRegistryOptions("dependency");
                    
                    drop
                    .addOptions(options.reduce((obj, opt) => { obj[opt.value] = opt.label; return obj; }, {} as Record<string, string>))
                    .setValue(imp.dependencies || [])
                    .onChange(async (vals: string[]) => {
                        imp.dependencies = vals;
                        this.display(containerEl);                   
                    });                    
                });
            }

            if (imp.setup !== "constant") {
                // Config entries (dynamic list)
                if (!imp.config) imp.config = [];
                this.renderConfigList(impDiv, imp.config, imp);
            }

            

            return impDiv;
        }

        if (this.import) {
            importSection(this.import);
        }

        new Setting(containerEl)
			.addButton(btn => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton(btn => 
                btn.setButtonText("Save")
                .setCta()
                .onClick(() => this.onSubmit())
            );
    }

    

    renderConfigList(containerEl: HTMLElement, configs: ConfigOptions[], parent: any) {
        configs.forEach((cfg, index) => {
            const cfgContainer = containerEl.createDiv({ cls: "config-block" });
            cfgContainer.createEl("h4", { text: cfg.name || `Config ${index + 1}` });

            // Basic metadata
            new Setting(cfgContainer)
                .setName("Name")
                .addText(text =>
                    text.setValue(cfg.name || "")
                        .onChange(async (val) => {
                            cfg.name = val;
                        })
                );

            new Setting(cfgContainer)
                .setName("ID")
                .addText(text =>
                    text.setValue(cfg.id || "")
                        .onChange(async (val) => {
                            cfg.id = val;
                        })
                );

            new Setting(cfgContainer)
                .setName("Type")
                .addDropdown(drop => {
                    ConfigTypes.forEach(t => drop.addOption(t, t));
                    drop.setValue(cfg.type || "string")
                        .onChange(async (val) => {
                            cfg.type = val as ConfigType;
                            Object.assign(cfg, this.defaultShapeForType(val));
                            this.display(this.contentEl);
                        });
                });

            // Now render the type-specific fields
            this.renderConfig(cfgContainer, cfg, parent);

            // Remove this config
            const removeBtn = cfgContainer.createEl("button", { text: "Remove Config" });
            removeBtn.onclick = async () => {
                configs.splice(index, 1);
                this.display(this.contentEl);
            };
        });

        // Add new config
        const addBtn = containerEl.createEl("button", { text: "Add Config Entry" });
        addBtn.onclick = async () => {
            const shape = this.defaultShapeForType("string");
            if (shape){
                configs.push(shape);
            }
            this.display(this.contentEl);
        };
    }

    renderConfig(containerEl: HTMLElement, cfg: ConfigOptions, parent: any) {
        const currentValue = parent[cfg.id] ?? cfg.default;

        // boolean
        if (cfg.type === "boolean") {
            const boolCFG = cfg as BooleanConfigOption;
            new Setting(containerEl)
                .setName("Default")
                .addToggle(toggle =>
                    toggle.setValue(!!currentValue)
                        .onChange(async (val) => {
                            boolCFG.default = val;
                        })
                );
        }

        // string / integer
        if (cfg.type === "string" || cfg.type === "integer") {
            new Setting(containerEl)
                .setName("Default")
                .addText(text =>
                    text.setValue(currentValue ? String(currentValue) : "")
                        .onChange(async (val) => {
                            cfg.default = cfg.type === "integer" ? Number(val) : val;
                        })
                );
        }

        // enum
        if (cfg.type === "enum") {

            let enumCFG = cfg as EnumConfigOption;
            // edit options
            if (!enumCFG.options) enumCFG.options = [];
            enumCFG.options.forEach((opt: string, i: number) => {
                const row = containerEl.createDiv({ cls: "setting-item" });
                const input = row.createEl("input", { type: "text", value: opt });
                input.onblur = async () => {
                    enumCFG.options[i] = input.value;
                };
                const remove = row.createEl("button", { text: "x" });
                remove.onclick = async () => {
                    enumCFG.options.splice(i, 1);
                    this.display(this.contentEl);
                };
            });
            const addOpt = containerEl.createEl("button", { text: "Add Option" });
            addOpt.onclick = async () => {
                enumCFG.options.push("");
                this.display(this.contentEl);
            };

            new Setting(containerEl)
                .setName("Default")
                .addDropdown(drop => {
                    enumCFG.options.forEach((opt: string) => drop.addOption(opt, opt));
                    drop.setValue(enumCFG.default?.toString() ?? "")
                        .onChange(async (val) => {
                            cfg.default = val;
                        });
                });
        }

        // object
        if (cfg.type === "object") {
            let objCFG = cfg as ObjectConfigOption;
            if (!objCFG.config) objCFG.config = [];
            this.renderConfigList(containerEl, objCFG.config, cfg);
        }

        // array
        if (cfg.type === "array") {
            containerEl.createEl("p", { text: "Array editor (based on arrayType)" });
            // TODO: you can reuse renderConfigList if arrayType is object
        }

        // record
        // if (cfg.type === "record") {
        //     let recCFG = cfg as RecordConfigOption;
        //     if (!recCFG.recordType) recCFG.recordType = { key: "string", value: "string" };
        //     if (!recCFG.default) recCFG.default = {};
        //     const rec = recCFG.default;

        //     Object.entries(rec).forEach(([key, value]) => {
        //         const row = containerEl.createDiv({ cls: "setting-item" });
        //         const keyInput = row.createEl("input", { type: "text", value: key });
        //         const valInput = row.createEl("input", {
        //             type: recCFG.recordType.value === "integer" ? "number" : "text",
        //             value: String(value)
        //         });
        //         const update = async () => {
        //             if (rec === undefined) return;
        //             delete rec[key as keyof RecordConfigOption["default"]];
        //             rec[keyInput.value] = cfg.recordType.value === "integer"
        //                 ? Number(valInput.value)
        //                 : valInput.value;
        //         };
        //         keyInput.onblur = update;
        //         valInput.onblur = update;
        //         const removeBtn = row.createEl("button", { text: "x" });
        //         removeBtn.onclick = async () => {
        //             delete rec[key];
        //             this.display(this.contentEl);
        //         };
        //     });

        //     const addBtn = containerEl.createEl("button", { text: "Add Record Entry" });
        //     addBtn.onclick = async () => {
        //         rec[""] = cfg.recordType.value === "integer" ? 0 : "";
        //         this.display(this.contentEl);
        //     };
        // }

        // function
        if (cfg.type === "preset function") {
            new Setting(containerEl)
                .setName("Function")
                .addDropdown(drop => {
                    let options = getRegistryOptions("function");
                    
                    drop
                    .addOptions(options.reduce((obj, opt) => { obj[opt.value] = opt.label; return obj; }, {} as Record<string, string>))
                    .setValue(cfg.default ?? options[0]?.value ?? "")
                    .onChange(async (val) => {
                        cfg.default = val;
                    });
                });
        }

        // predefined
        if (cfg.type === "preset variable") {
            new Setting(containerEl)
                .setName("Predefined")
                .addDropdown(drop => {


                    let options = getRegistryOptions("variable");
                    
                    drop
                    .addOptions(options.reduce((obj, opt) => { obj[opt.value] = opt.label; return obj; }, {} as Record<string, string>))
                    .setValue(cfg.default ?? options[0]?.value ?? "")
                    .onChange(async (val) => {
                        cfg.default = val;
                    });
                });
        }
    }

    defaultShapeForType(type: string): ConfigOptions | undefined {
        switch (type) {
            case "boolean": return { name: "", id: "", type: "boolean", default: false };
            case "string": return { name: "", id: "", type: "string", default: "" };
            case "integer": return { name: "", id: "", type: "integer", default: 0 };
            case "enum": return { name: "", id: "", type: "enum", default: "", options: [] };
            case "object": return { name: "", id: "", type: "object", config: [] };
            case "array": return { name: "", id: "", type: "array", arrayType: { type: "string" }, default: [] };
            case "record": return { name: "", id: "", type: "record", recordType: { key: "string", value: "string" }, default: {} };
            case "preset function": return { name: "", id: "", type: "preset function", default: null };
            case "preset variable": return { name: "", id: "", type: "preset variable", default: null };
        }
    }

    onClose() {
        console.log("CLOSE MODULE MODAL")
        console.log(this.module)
        console.log(this.import)
        this.contentEl.empty();
        this.onCloseCallbacks?.();
    }
}
