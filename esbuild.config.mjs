import esbuild from "esbuild";
import process from "process";
import builtins from 'builtin-modules'
import fs from 'fs';

const banner =
`/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

let renamePlugin = {
	name: 'example',
	setup(build) {
		build.onEnd(result => {
			// fs.renameSync('main.css', 'styles.css');
			const mystyleData = fs.readFileSync('mystyles.css', 'utf8');
			const mainData = fs.readFileSync('main.css', 'utf8');
			const combinedData = mystyleData + '\n' + mainData;
			fs.writeFileSync('styles.css', combinedData, 'utf8');
			console.log('styles.css create success.');
		})
	},
}


const prod = (process.argv[2] === 'production');

const context = await esbuild.context({
	banner: {
		js: banner,
	},
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...builtins],
	format: 'cjs',
	target: 'es2018',
	logLevel: "info",
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	loader: {   
		'.ttf': 'base64', 
	},
	plugins: [renamePlugin],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}