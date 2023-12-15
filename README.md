# obsidian-embed-and-edit-code

## About the project
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
Additional changes were made to the embed display to add a better fitting title bar (closer resemblace to the code block). 
Modified some buttons and styles to the embed display to allow better usability.
Allowed for local filepaths to be used in embed display

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
* `TITLE` will set the title displayed above the embeded code. If the `TITLE` is not set then the filename of the embeded file will be displayed.


