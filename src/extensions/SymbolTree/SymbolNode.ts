export type SymbolType = 
  | 'interface'
  | 'class'
  | 'function'
  | 'method'
  | 'property'
  | 'variable'
  | 'constant'
  | 'namespace'
  | 'enum'
  | 'constructor';

export interface SymbolNode {
    name: string;
    children?: SymbolNode[];
    type: string;
    range: number[];
}

export interface TreeNodeEvent {
    node: SymbolNode;
    event: MouseEvent;
    expanded?: boolean;
    selected?: boolean;
  }
  
export interface TreeNodeEventHandlers {
onClick?: (event: TreeNodeEvent) => void;
onDoubleClick?: (event: TreeNodeEvent) => void;
onContextMenu?: (event: TreeNodeEvent) => void;
onExpand?: (event: TreeNodeEvent) => void;
onCollapse?: (event: TreeNodeEvent) => void;
onSelect?: (event: TreeNodeEvent) => void;
onHover?: (event: TreeNodeEvent) => void;
onBlur?: (event: TreeNodeEvent) => void;
onKeyDown?: (event: KeyboardEvent & { node: SymbolNode }) => void;
}
  
export type TreeNodeEventHandler = (node: SymbolNode, event: MouseEvent) => void;

export type SymbolTreeOptions = {
    visible: boolean,
    side: 'left' | 'right',
    onNodeClick?: TreeNodeEventHandler;
    onNodeContextMenu?: TreeNodeEventHandler;
    
}

export type SymbolTreeOptionInputs = {
    visible?: boolean,
    side?: 'left' | 'right',
    onNodeClick?: TreeNodeEventHandler;
    onNodeContextMenu?: TreeNodeEventHandler;
}

export const defaultSymbolTreeOptions : SymbolTreeOptions = {
    visible: true,
    side: 'left'
};