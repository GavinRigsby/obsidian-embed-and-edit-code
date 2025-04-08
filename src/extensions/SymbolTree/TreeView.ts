import { getCodiconSvg } from './Icons';
import { SymbolNode, SymbolTreeOptions } from './SymbolNode';

export class TreeView {
    private container: HTMLElement;
    private options: SymbolTreeOptions;

    constructor(
        container: HTMLElement,
        data: SymbolNode[],
        options: SymbolTreeOptions
    ) {
        this.options = options;
        this.container = container;
        this.render(data);
    }

    private createNodeElement(node: SymbolNode): HTMLElement {
        const nodeContainer = document.createElement('div');
        nodeContainer.style.userSelect = 'none';

        const nodeContent = document.createElement('div');
        nodeContent.style.display = 'flex';
        nodeContent.style.alignItems = 'center';
        nodeContent.style.padding = '4px';
        nodeContent.style.cursor = 'pointer';
        nodeContent.style.gap = '4px';
        nodeContent.style.borderRadius = '4px';
        nodeContent.style.color = '##abb2bf';
        nodeContent.style.fontSize = '13px';
        nodeContent.style.fontFamily = 'Consolas, "Courier New", monospace';

        const hasChildren = node.children && node.children.length > 0;
        let isExpanded = false;

        // Chevron or spacer
        const chevronContainer = document.createElement('span');
        chevronContainer.style.width = '16px';
        chevronContainer.style.height = '16px';
        chevronContainer.style.display = 'flex';
        chevronContainer.style.alignItems = 'center';
        chevronContainer.style.justifyContent = 'center';

        if (hasChildren) {
            chevronContainer.innerHTML = getCodiconSvg(`chevronright`)
        }
        nodeContent.appendChild(chevronContainer);

        // Symbol icon
        const iconContainer = document.createElement('span');
        iconContainer.innerHTML = getCodiconSvg(node.type);
        iconContainer.style.fontSize = '16px';
        nodeContent.appendChild(iconContainer);

        // Label
        const label = document.createElement('span');
        label.textContent = node.name;
        label.style.marginLeft = '4px';
        nodeContent.appendChild(label);

        // Type indicator
        const typeIndicator = document.createElement('span');
        typeIndicator.textContent = `: ${node.type}`;
        typeIndicator.style.color = '#767676';
        typeIndicator.style.fontSize = '12px';
        nodeContent.appendChild(typeIndicator);

        // Children container
        const childrenContainer = document.createElement('div');
        childrenContainer.style.paddingLeft = '20px';
        childrenContainer.style.display = 'none';

        if (hasChildren) {
            node.children!.forEach(child => {
                childrenContainer.appendChild(this.createNodeElement(child));
            });
        }

        // Event handlers
        chevronContainer.addEventListener('click', (event) => {
            if (hasChildren) {
                isExpanded = !isExpanded;
                chevronContainer.innerHTML = getCodiconSvg(`${isExpanded ? 'chevrondown' : 'chevronright'}`)
                childrenContainer.style.display = isExpanded ? 'block' : 'none';
            }
        });

        [iconContainer, label, typeIndicator].forEach((element) => {
            element.addEventListener('click', (event) => {
                this.options.onNodeClick?.(node, event);
            });
        });

        nodeContent.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.options.onNodeContextMenu?.(node, event);
        });

        // Hover effect
        nodeContent.addEventListener('mouseenter', () => {
            nodeContent.style.backgroundColor = '#f0f0f0';
        });

        nodeContent.addEventListener('mouseleave', () => {
            nodeContent.style.backgroundColor = '';
        });

        nodeContainer.appendChild(nodeContent);
        nodeContainer.appendChild(childrenContainer);
        return nodeContainer;
    }

    private render(data: SymbolNode[]): void {

        console.log("TreeView Render");
        this.container.style.fontFamily = 'Consolas, "Courier New", monospace';

        const nodeContainer = document.createElement('div');
        nodeContainer.style.whiteSpace = "nowrap";
        nodeContainer.style.overflow = "hidden";
        nodeContainer.style.textOverflow = "ellipsis";


        data.forEach(node => {
            nodeContainer.appendChild(this.createNodeElement(node));
        });

        console.log("Finished creating nodes");

        const grabber = document.createElement('div');
        grabber.className = "grabber"
        grabber.style.width = "2px";
        grabber.style.background = "#aaa";
        grabber.style.cursor = "ew-resize";
        grabber.style.height = "100%";
        grabber.style.position = "absolute";
        grabber.style.top = "0";

        if (this.options.side === "left"){
            grabber.style.right = "0";
            this.container.style.left = "0";
            this.container.style.right = "auto";
        }else{
            grabber.style.left = "0";
            this.container.style.right = "0"; 
            this.container.style.left = "auto";
        }

        let isResizing = false;
        grabber.addEventListener('mousedown', (e: MouseEvent) => {
            isResizing = true;
            document.body.style.cursor = 'ew-resize';
        });

        document.addEventListener('mousemove', (e: MouseEvent) => {
            if (!isResizing) return;

            const newWidth = this.options.side === "left" ? 
            e.clientX - this.container.getBoundingClientRect().left : 
            this.container.getBoundingClientRect().right - e.clientX;

            console.log(`NEW WIDTH: ${newWidth}`)
            if (newWidth > 10 && newWidth < 500) {
                this.container.style.width = `${newWidth}px`;
                let parent = this.container.parentElement;
                if (parent) {
                    if (this.options.side === "left") {
                        parent.style.paddingLeft = `${newWidth}px`;
                    }else{
                        parent.style.paddingRight = `${newWidth}px`;
                    }
                    
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isResizing = false;
            document.body.style.cursor = '';
        });

        this.container.appendChild(nodeContainer);
        this.container.appendChild(grabber);
    }

    updatePosition(side: 'left' | 'right'){
        let grabber = this.container.querySelector(".grabber") as HTMLDivElement;

        this.options.side = side;

        if (grabber) {
            if (side === "left"){
                grabber.style.right = "0";
                this.container.style.left = "0";
                this.container.style.right = "auto";
            }else{
                grabber.style.left = "0";
                this.container.style.right = "0"; 
                this.container.style.left = "auto";
            }
        }
    }
}