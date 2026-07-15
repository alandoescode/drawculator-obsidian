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
	unsub: any[] = [];
	currentMouse = {x: 0, y: 0}
	


	async onload() {
		await this.loadSettings();
		this.app.workspace.onLayoutReady(() => {
			const ea = (window as any).ExcalidrawAutomate as ExcalidrawAutomate | undefined;
			
			if (ea) {
				console.log("excalidraw detected!")
				const button = this.createButton()
				button.style.visibility = "hidden"

				this.registerEvent(
					this.app.workspace.on('active-leaf-change', 
						(leaf: WorkspaceLeaf) => {
							console.log("boggie woogie")

							const activeView = leaf?.view

							if (activeView && activeView.getViewType() === "excalidraw") {
								ea.setView(activeView)
								
								this.handleCanvasChange(ea)
							}
						}
					)
				)

				this.registerDomEvent(window, "mousemove", (e) => {
					this.currentMouse.x = e.x
					this.currentMouse.y = e.y
				})
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
	

	buttonElement: HTMLDivElement | null = null
	private createButton() {
		this.buttonElement = this.app.workspace.containerEl.createEl('div', {
			cls: "feedback-btn"
		})
		
		this.buttonElement.createEl('button', {
			text: "yes",
		})

		this.buttonElement.createEl('button', {
			text: "no",
		})

		console.log("THE BUTTON IS HEREE")

		return this.buttonElement
	}


	private DEFS: Record<string, string> = {
		'add': '+', 'dec': '.', 'div': '/', 'eq': '=', 'mul': '*', 'sub': '-'
	}
	grouped: Map<utils.Symbol["id"], utils.Symbol> = new Map()

	private handler = (ea: ExcalidrawAutomate /**elements: ExcalidrawElement[]**/) => {
		const elements: ExcalidrawElement[] = ea.getViewElements()
		console.log("ELEMENTS:", elements)
		const strokes = elements.filter(element => (element.type === "freedraw" || element.type === "text") && element.isDeleted === false)
		
		if (strokes.length <= 0) {console.log("nothing to predict"); return}
		const element = utils.groupBounds( //most recent grouped element
			strokes.map((e) => utils.normalizeElement(e))
		)

		if (this.grouped.get(element.id)?.done) return
		this.grouped.set(element.id, element) //push most recent grouped element to global array of grouped elements
		
		console.log(strokes[strokes.length-1]?.points ?? null)
		console.log("STROKES:", strokes)
		
		element.points ? model.runModel(utils.pointsToTensor(element)!).then(predicted => {

			if (this.DEFS[predicted]) {
				predicted = this.DEFS[predicted]!
			}

			console.log('Predicted digit: ', predicted)
			element.prediction = predicted

			if (predicted == '=') {
				element.done = true

				const found = Array.from(utils.assembleEquation(this.grouped, element, ea)).sort((a, b) => {
					return a.bounds.minX < b.bounds.minX ? -1 : 1
				})
				console.log('FOUND EXPRESSION: ', found)

				if (found.length > 0) {
					let expression: string[] = []
					found.forEach(e => {
						ea.reset()
						ea.addRect(e.bounds.minX, e.bounds.minY, (e.bounds.maxX-e.bounds.minX), (e.bounds.maxY-e.bounds.minY))
						ea.addElementsToView()

						expression.push(e.prediction!)

						console.log(`BOUNDS: ${(e.bounds.maxX-e.bounds.minX)}, ${(e.bounds.maxY-e.bounds.minY)}`)
					});

					const expressionString = expression.join("")
					console.log("expression: ", expressionString)
					const solution: number = eval(expressionString)
					console.log("SOLUTION: ", solution)

					ea.reset()

					const firstFound = found[found.length-1]!
					const height = (firstFound.bounds.maxY - firstFound.bounds.minY)*1.4
					ea.style.fontSize = (ea.style.fontSize / 25) * height //size calculation
					ea.style.opacity = 50
					
					const addedId = ea.addText(element.bounds.maxX + (element.bounds.minX - firstFound.bounds.maxX)/1.367, (firstFound.bounds.maxY + firstFound.bounds.minY)/2 - height/2.5, solution.toString())
					ea.addElementsToView()

					this.buttonElement!.style.left = `${this.currentMouse.x}px`
					this.buttonElement!.style.top = `${this.currentMouse.y}px`
					
					this.buttonElement!.style.visibility = "visible"
					window.onmousedown = (mouseEvent => {
						if ((mouseEvent.target as HTMLElement).parentElement!.classList.contains("feedback-btn")) {
							console.log(mouseEvent.target)
							
							const clicked = mouseEvent.target as HTMLElement
							if (clicked.textContent == "yes") {
								ea.getElement(addedId).opacity = 100
								ea.viewUpdateScene({ elements: ea.getViewElements() })
							} else {
								ea.deleteViewElements([ea.getElement(addedId)])
							}
							
							this.buttonElement!.style.visibility = "hidden"
						} else if (!ea.getElement(addedId).isDeleted && ea.getElement(addedId).opacity == 50) {
							ea.deleteViewElements([ea.getElement(addedId)])
							this.buttonElement!.style.visibility = "hidden"
						}
					})
				}
			}
		}) : null
		// console.log("GROUPED:", grouped)
	}

	handleCanvasChange(ea: ExcalidrawAutomate) {
		for (const unsub of this.unsub) {
			unsub()
		}
		this.unsub = []
		
		this.unsub.push(ea.getExcalidrawAPI().onPointerUp((activeTool: {type: string}) => {
			sleep(10).then(() => {
				this.handler(ea)
			})
		}))

		this.unsub.push(ea.getExcalidrawAPI().onChange(debounce((all: ExcalidrawElement[]) => {
			// const all: ExcalidrawElement[] = ea.getExcalidrawAPI().getSceneElementsIncludingDeleted()
			const ids = new Set(all.map(item => item.id))

			for (const id of this.grouped.keys()) {
				if (!ids.has(id)) {
					this.grouped.delete(id) //deletes element if mismatch in all & this.grouped
				}
			}

			all.forEach(e => {
				if (e.isDeleted) {
					this.grouped.delete(e.id) //deletes element in this.group if it was erased
				}
			})

			console.log("grouped: ", this.grouped)
		}, 100, true)))
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


