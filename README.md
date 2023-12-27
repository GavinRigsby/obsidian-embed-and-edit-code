# obsidian-embed-and-edit-code

This project is a merge of 2 other obsidian plugins as they had functionality I liked but did not work together. 
Here are the repositories for [embed-code-file](https://github.com/almariah/embed-code-file) and [obsidian-vs-code-editor](https://github.com/sunxvming/obsidian-vscode-editor/tree/main). 
Make sure to give the original devs some love as most work came from them and I just merged and added some slight tweaks to my liking.

## About the plugins

### Obsidian VSCode Editor
Obsidian by default does not support the viewing and editing of various code files, and Obsidian VSCode Editor was created to solve this problem. 

It is based on [Monaco Editor](https://microsoft.github.io/monaco-editor/) (VSCode Editor kernel) development, support for viewing and editing of various code format files, including but not limited to: ` C `, `C++`, `C#` , ` CSS `, ` Go `, ` HTML`, `Java`, `JavaScript`, `JSON`, `Python`, `Ruby`, `Rust`, `Shell`, `XML`, `YAML`, `ini`, etc.

You no longer have to open another editor just to view or edit a certain code file, everything is done in Obsidian.

### Embed Code File
This plugin allows to embed code files from Obsidian vault or remote file (eg., GitHub). It works better with live preview feature of Obsidian.

### Additional Changes
* Additional changes were made to the embed display to add a better fitting title bar (closer resemblace to the code block). 
* Modified some buttons and styles to the embed display to allow better usability.
* Allowed for local filepaths to be used in embed display.
* Open VSCode Editor from embedded code file.
* Create code buttons creates the file in the current directory (no longer the root).
* Clicking Edit button and returning to the page with embeded code will automatically update (5 second max wait).
* Clicking Refresh button will automatically update the code (No longer have to edit block then rebuild).

## Using the embed block
First you need to activate the plugin from Community Plugins. Then you can embed the code as follow:

````yaml
```embed-<some-language>
PATH: "vault://<some-path-to-code-file>" or "http[s]://<some-path-to-remote-file>"
LINES: "<some-line-number>,<other-number>,...,<some-range>"
TITLE: "<some-title>"
```
````

Examples:

#### Vault File:

````yaml
```embed-cpp
PATH: "vault://Code/main.cpp"
LINES: "2,9,30-40,100-122,150"
TITLE: "Some title"
```
````

#### Remote File:

````yaml
```embed-cpp
PATH: "https://raw.githubusercontent.com/almariah/embed-code-file/main/main.ts"
LINES: "30-40"
TITLE: "Some title"
```
````

The `PATH`, `LINES` and `TITLE` properties are set as YAML key-value paris:

* `PATH` should be the file to embed from the vault or a remote address. If you use github make sure to use `https://raw.githubusercontent.com/...`
* `LINES` will include only the specified lines of code. The set of included lines will append dots (`...`) to show any excluded lines in the file.
* `FUNCTION` will include only the specified funcitons. The set of included lines will append dots (`...`) to show any excluded lines in the file.
* `TITLE` will set the title displayed above the embeded code. If the `TITLE` is not set then the filename of the embeded file will be displayed.


## Using Obsidian VSCode Editor

### Basic features
- It **does not depend on** any third-party network services and can be used even when not connected to the internet.
- Support for viewing and editing files in various code formats, just like editing code with VSCode.
- Supports customization of the editor's theme colors, including light and dark themes.
- Allows customization of the editor's font size, and provides a shortcut to adjust the font size using `Ctrl + mouse wheel`.
- Supports editing individual code blocks from any Markdown document.
- Supports Internal links quick preview.
- Supports automatic code wrapping, and toggles it with `alt + z`.
- Provides the option to show/hide line numbers.
- Offers the choice to display/hide indent guides.
- Allows toggling the display of the code minimap.
- Supports shortcut icon buttons or commands for creating new code files.

### Using different code files

The default extensions are `ts, js, py, css, c, cpp, go, rs, java, lua, php`. 
You can add extensions to this list or allow any file extension by toggling the `Allow all files` toggle

### Supported Shortcuts

Most of the shortcuts are consistent with VS Code. Here are some of the supported shortcuts:

| Category     | Shortcut               | Action                    |
| ------------ | ---------------------- | ------------------------- |
| Ctrl         | `ctrl + c`             | Copy                      |
|              | `ctrl + x`             | Cut                       |
|              | `ctrl + v`             | Paste                     |
|              | `ctrl + s`             | Save                      |
|              | `ctrl + a`             | Select All                |
|              | `ctrl + f`             | Find                      |
|              | `ctrl + h`             | Replace                   |
|              | `ctrl + z`             | Undo                      |
|              | `ctrl + y`             | Redo                      |
|              | `ctrl + /`             | Toggle Comment            |
|              | `ctrl + d`             | Duplicate Line            |
|              | `ctrl + [`             | Decrease Indent           |
|              | `ctrl + ]`             | Increase Indent           |
|              | `ctrl + ↑`             | Move Line Up              |
|              | `ctrl + ↓`             | Move Line Down            |
|              | `ctrl + ←`             | Move Cursor Left by Word  |
|              | `ctrl + →`             | Move Cursor Right by Word |
|              | `ctrl + Backspace`     | Delete Word Left          |
|              | `ctrl + Delete`        | Delete Word Right         |
| Ctrl + Shift | `ctrl + shift + z`     | Redo                      |
|              | `ctrl + shift + k`     | Delete Current Line       |
|              | `ctrl + shift + [`     | Fold Code Block           |
|              | `ctrl + shift + ]`     | Unfold Code Block         |
|              | `ctrl + shift + enter` | Insert Line Above         |
|              | `ctrl + enter`         | Insert Line Below         |
| Alt          | `alt + z`              | Toggle Word Wrap          |

### Additional Usage

You can create a code file by clicking the **Create code file** button in the left panel

The plugin also supports editing code blocks from any Markdown document in the editor.
You can just right click on any code block and click on "**Edit Code Block in VSCode Editor Plugin**".

Quick preview links will allow you to link to a code file and hovering the cursor over the link will allow for a **quick preview**

## Installation

**Installation from Obsidian's community plugins**: 
1. Open Settings > community plugins
2. Turn off 'Safe mode'
3. Click 'Browse' button to browse plugins
4. Search for 'VSCode Editor'
5. Click 'Install' button
6. Once installed, close the plugins browse window and go back community plugins window, and activate the newly installed plugin below installed plugins list
7. Enable the `Detect all file extensions` setting in **Settings > Files & Links** as code files will not appear otherwise




