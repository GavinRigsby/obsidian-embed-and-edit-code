import { Setting } from "obsidian";

declare module "obsidian" {
    interface Setting {
        addMultiDropdown(
            callback: (drop: MultiDropdownBuilder) => void
        ): Setting;
    }
}

export interface MultiDropdownBuilder {
    addOption(label: string, value: string): MultiDropdownBuilder;
    addOptions(options: Record<string, string>): MultiDropdownBuilder;
    setValue(values: string[]): MultiDropdownBuilder;
    onChange(callback: (values: string[]) => void): MultiDropdownBuilder;
}



Setting.prototype.addMultiDropdown = function (
    callback: (drop: MultiDropdownBuilder) => void
): Setting {
    const container = this.controlEl;
    container.empty();
    container.style.position = "relative";

    let selectedValues: string[] = [];
    let options: { label: string; value: string }[] = [];
    let changeCallback: (values: string[]) => void = () => { };


    // Create the "fake dropdown" button
    const btn = container.createEl("button", { cls: "dropdown" });
    btn.style.width = "100%";
    btn.style.textAlign = "left";
    btn.style.display = "flex";
    btn.style.justifyContent = "space-between";
    btn.textContent = "Select...";

    const listEl = container.createEl("div", { cls: "multiselect-dropdown" });
    listEl.style.display = "none";
    listEl.style.position = "absolute";
    listEl.style.background = "var(--background-secondary)";
    listEl.style.border = "1px solid var(--interactive-border)";
    listEl.style.padding = "4px 0";
    listEl.style.minWidth = `${btn.offsetWidth}px`;
    listEl.style.zIndex = "1000";
    listEl.style.maxHeight = "200px";
    listEl.style.overflowY = "auto";
    listEl.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";


    const updateButtonLabel = () => {
        btn.firstChild!.textContent =
            selectedValues.length === 0
                ? "Select..."
                : options
                    .filter((o) => selectedValues.includes(o.value))
                    .map((o) => o.label)
                    .join(", ");
    };

    const checkboxes: { value: string; checkbox: HTMLInputElement }[] = [];

    const builder: MultiDropdownBuilder = {
        addOption(label: string, value: string) {
            options.push({ label, value });

            const item = listEl.createEl("div", { cls: "multiselect-item" });
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.padding = "2px 8px";
            item.style.cursor = "pointer";

            const checkbox = item.createEl("input", { type: "checkbox" });
            checkbox.style.marginRight = "6px";

            const text = item.createEl("span", { text: label });

            checkboxes.push({ value, checkbox });

            const updateCheckbox = () => {
                checkbox.checked = selectedValues.includes(value);
            };
            updateCheckbox();

            item.onclick = (e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent closing immediately

                if (selectedValues.includes(value)) {
                    selectedValues = selectedValues.filter((v) => v !== value);
                } else {
                    selectedValues.push(value);
                }

                updateCheckbox();
                updateButtonLabel();
                changeCallback(selectedValues);
            };

            return builder;
        },
        addOptions(opts: Record<string, string>) {

            for (const [key, value] of Object.entries(opts)) {
                builder.addOption(value, key);
            }
            return builder;
        },
        setValue(values: string[]) {
            selectedValues = values.slice();
            updateButtonLabel();

            checkboxes.forEach(({ value, checkbox }) => {
                checkbox.checked = selectedValues.includes(value);
            });

            return builder;
        },
        onChange(cb: (values: string[]) => void) {
            changeCallback = cb;
            return builder;
        },
    };

    callback(builder);

    btn.onclick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        listEl.style.display = listEl.style.display === "none" ? "block" : "none";

        // Position below button
        listEl.style.top = `${btn.offsetHeight + 2}px`;
        listEl.style.left = "0px";
    };

    // Close if clicked outside
    document.addEventListener("click", (e) => {
        if (!container.contains(e.target as Node)) {
            listEl.style.display = "none";
        }
    });

    return this;
};
