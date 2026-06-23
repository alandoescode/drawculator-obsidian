import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Modal,
	Notice,
	App,
	Plugin,
	TFile,
	View,
	debounce,
	WorkspaceLeaf,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	MyPluginSettings,
	SampleSettingTab,
} from './settings';
import { ExcalidrawAutomate, ExcalidrawElement } from './ExcalidrawAutomate.d';
import * as utils from './utils'
import * as model from './model'

declare module 'obsidian' {
    interface App {
        plugins: {
            getPlugin(id: string): any;
            plugins: { [id: string]: any };
        };
    }
}






// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
	settings!: MyPluginSettings;
	unsub: any;
	
	


	async onload() {
		await this.loadSettings();
		this.app.workspace.onLayoutReady(() => {
			const ea = (window as any).ExcalidrawAutomate as ExcalidrawAutomate | undefined;

			if (ea) {
				console.log("excalidraw detected!")

				this.registerEvent(
					this.app.workspace.on('active-leaf-change', 
						debounce((leaf: WorkspaceLeaf) => {
							console.log("boggie woogie")

							const activeView = leaf?.view
							ea.setView(activeView)

							this.handleCanvasChange(ea)
						}, 300, false)
					)
				)
			}

			// // This creates an icon in the left ribbon.
			// this.addRibbonIcon('dice', 'Sample', (_evt: MouseEvent) => {
			// 	// Called when the user clicks the icon.
			// 	new Notice('This is a notice!');
			// });

			// // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
			// const statusBarItemEl = this.addStatusBarItem();
			// statusBarItemEl.setText('boogie');

			

			// // This adds a simple command that can be triggered anywhere
			// this.addCommand({
			// 	id: 'open-modal-simple',
			// 	name: 'Open modal (simple)',
			// 	callback: () => {
			// 		new SampleModal(this.app).open();
			// 	},
			// });

			// // This adds an editor command that can perform some operation on the current editor instance
			// this.addCommand({
			// 	id: 'replace-selected',
			// 	name: 'Replace selected content',
			// 	editorCallback: (
			// 		editor: Editor,
			// 		_ctx: MarkdownView | MarkdownFileInfo,
			// 	) => {
			// 		editor.replaceSelection('Sample editor command');
			// 	},
			// });

			// // This adds a complex command that can check whether the current state of the app allows execution of the command
			// this.addCommand({
			// 	id: 'open-modal-complex',
			// 	name: 'Open modal (complex)',
			// 	checkCallback: (checking: boolean) => {
			// 		// Conditions to check
			// 		const markdownView =
			// 			this.app.workspace.getActiveViewOfType(MarkdownView);
			// 		if (markdownView) {
			// 			// If checking is true, we're simply "checking" if the command can be run.
			// 			// If checking is false, then we want to actually perform the operation.
			// 			if (!checking) {
			// 				new SampleModal(this.app).open();
			// 			}

			// 			// This command will only show up in Command Palette when the check function returns true
			// 			return true;
			// 		}
			// 		return false;
			// 	},
			// });

			// This adds a settings tab so the user can configure various aspects of the plugin
			this.addSettingTab(new SampleSettingTab(this.app, this));

			// // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
			// // Using this function will automatically remove the event listener when this plugin is disabled.
			// this.registerDomEvent(activeDocument, 'click', (_evt: MouseEvent) => {
			// 	new Notice('Click');
			// });

			// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
			this.registerInterval(
				window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000),
			);
		});
	}

	private handler = debounce((elements: ExcalidrawElement[]) => {
		const strokes = elements.filter(element => element.type === "freedraw" && element.isDeleted === false)
		
		let xPoints: number[] = []
		let yPoints: number[] = []
		strokes[strokes.length-1]?.points.forEach(([x, y]) => {
			xPoints.push(x)
			yPoints.push(y)
		});

		// const grouped = utils.groupBounds(
		// 	strokes.map((e) => utils.normalizeElement(e))
		// )
		console.log(strokes[strokes.length-1]?.points ?? null)
		console.log("ELEMENTS:", elements)
		console.log("STROKES:", strokes)
		model.runModel(utils.pointsToMnistTensor(xPoints, yPoints))
		// console.log("GROUPED:", grouped)
	}, 300, true)

	handleCanvasChange(ea: ExcalidrawAutomate) {
		if (this.unsub) {
			this.unsub()
			this.unsub = null
		}

		this.unsub = ea.getExcalidrawAPI().onChange(this.handler)
	}
	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}


