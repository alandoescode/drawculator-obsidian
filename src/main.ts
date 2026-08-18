import {
	Plugin,
	debounce,
	WorkspaceLeaf,
} from 'obsidian';
// import {
// 	DEFAULT_SETTINGS,
// 	MyPluginSettings,
// 	SampleSettingTab,
// } from './settings';
import { ComputeEngine } from '@cortex-js/compute-engine';
import { InferenceSession } from 'onnxruntime-web';

import { ExcalidrawAutomate, ExcalidrawElement } from './ExcalidrawAutomate.d';
import { Symbol } from './utils';
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




export default class MyPlugin extends Plugin {
	loadedState = false
	loadedEl: HTMLElement | undefined
	settings!: {mySetting: string};
	unsub: any[] = [];
	currentMouse = {x: 0, y: 0}
	

	async onload() {
		// await this.loadSettings();
		this.app.workspace.onLayoutReady(() => {
			const ea = (window as any).ExcalidrawAutomate as ExcalidrawAutomate;
			
			if (ea) {
				console.log("excalidraw detected!")
				const button = this.createButton()
				button.style.visibility = "hidden"

				this.loadedEl = this.addStatusBarItem()

				this.registerEvent(
					this.app.workspace.on('active-leaf-change', 
						(leaf: WorkspaceLeaf) => {
							// console.log("boggie woogie")

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

			// will keep this in just in case i wanna add settings later
			// this.addSettingTab(new SampleSettingTab(this.app, this))
		})
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

		// console.log("THE BUTTON IS HEREE")

		return this.buttonElement
	}


	private DEFS: Record<string, string> = {
		'add': '+', 'dec': '.', 'div': '/', 'eq': '=', 'mul': '*', 'sub': '-', 'open_bracket': '(', 'close_bracket': ')'
	}
	grouped: Map<Symbol["id"], Symbol> = new Map()

	private handler = (ea: ExcalidrawAutomate /**elements: ExcalidrawElement[]**/, session: InferenceSession) => {
		const elements: readonly ExcalidrawElement[] = ea.getViewElements()
		// console.log("ELEMENTS:", elements)
		const strokes = elements.filter(element => (element.type === "freedraw" || element.type === "text") && element.isDeleted === false)
		
		if (strokes.length <= 0) {/*console.log("nothing to predict");*/ return}
		const element = utils.groupBounds( //most recent grouped element
			strokes.map((e) => utils.normalizeElement(e))
		)

		if (this.grouped.get(element.id)?.done) return
		this.grouped.set(element.id, element) //push most recent grouped element to global array of grouped elements
		
		// console.log(strokes[strokes.length-1]?.points ?? null)
		// console.log("STROKES:", strokes)
		
		element.points ? model.runModel(session, utils.pointsToTensor(element)!).then(predicted => {

			if (this.DEFS[predicted]) {
				predicted = this.DEFS[predicted]!
			}

			// console.log('Predicted digit: ', predicted)
			element.prediction = predicted

			if (predicted == '=') {
				element.done = true

				const found = utils.findElementsLeft({ elements: this.grouped, e: element, ea: ea })
				// console.log('FOUND EXPRESSION: ', found)

				if (found.length > 0) {

					//fraction detection
					const fractions: { id: string, numerator: Symbol[], denominator: Symbol[] }[] = []
                    const consumed = new Set<string>()

                    for (let i = 0; i <= found.length-1; i++) {
                        const e = found[i]!
                        if (e.prediction !== "-") continue

                        const operands = utils.findFractionOperands(this.grouped, e)
                        if (!operands) continue

                        fractions.push({ id: e.id, numerator: operands.numerator, denominator: operands.denominator })
                        consumed.add(e.id)
                        for (const el of [...operands.numerator, ...operands.denominator]) consumed.add(el.id)
                    }

					const fractionMap = new Map(fractions.map(f => [f.id, f]))

					// assemble equation
					let expression: string[] = []
					for (let i = 0; i <= found.length-1; i++) {
						const e = found[i]!
						
						// changing prediction a bit here
						const e2 = found[i-1]
						console.warn(e.prediction, e2?.prediction)
						if (consumed.has(e.id) && !fractionMap.has(e.id)) continue

						if (fractionMap.has(e.id)) {
							const { numerator, denominator } = fractionMap.get(e.id)!
							const num = numerator.map((el, i) => this.transformPrediction(el, numerator[i-1])).join("")
							const den = denominator.map((el, i) => this.transformPrediction(el, denominator[i-1])).join("")
							expression.push(`((${num})/(${den}))`)
							continue
						}

						expression.push(this.transformPrediction(e, e2))

						// console.log(`BOUNDS: ${(e.bounds.maxX-e.bounds.minX)}, ${(e.bounds.maxY-e.bounds.minY)}`)
					}

					const expressionString = expression.join("")
					// console.log("expression: ", expressionString)

					const ce = new ComputeEngine()
					const parsed = ce.parse(expressionString)

					const simplified = ce.expr(parsed.evaluate())
					// console.log("SIMPLIFIED: ", simplified.latex)

					const solved = parsed.solve()
					const solution = solved ? ce.expr(solved) : null
					// console.log("SOLUTION: ", solution?.latex)

					ea.reset()

					let firstFound = found[found.length-1]
					if (found[found.length-2] && found[found.length-2]!.bounds.maxY - found[found.length-2]!.bounds.minY > found[found.length-1]!.bounds.maxY - found[found.length-1]!.bounds.minY) {
						firstFound = found[found.length-2]
					} //idk why i did this but ill keep it here

					const height = (firstFound!.bounds.maxY - firstFound!.bounds.minY)*1.4 //100
					ea.style.fontSize = Math.max(96, (ea.style.fontSize / 25) * height)/18.67 //size calculation
					ea.style.opacity = 50
					
					ea.addLaTex(
						element.bounds.maxX + (element.bounds.minX - found[found.length-1]!.bounds.maxX)/1.367,
						(element.bounds.maxY + element.bounds.minY)/2 - (firstFound!.bounds.maxY - firstFound!.bounds.minY)/2 - height/16.67,
						(solution?.latex != null ? 'x = ' + solution.latex + ", " : "") + simplified.latex, ea.style.fontSize, ea.style.fontSize
					).then(addedId => {
							// console.log(addedId)
							const el = ea.getElement(addedId);
							// console.log("Element object:", el);
							// console.log("Is rendered in view:", ea.getViewElements().some(e => e.id === addedId));
							
							ea.addElementsToView()

							window.onmousedown = (mouseEvent => {
								if ((mouseEvent.target as HTMLElement).parentElement!.classList.contains("feedback-btn")) {
									// console.log(mouseEvent.target)
									
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
					)
					
					

					this.buttonElement!.style.left = `${this.currentMouse.x}px`
					this.buttonElement!.style.top = `${this.currentMouse.y}px`
					
					this.buttonElement!.style.visibility = "visible"
					
				}
			}
		}) : null
		// console.log("GROUPED:", grouped)
	}


	transformPrediction(e: Symbol, prev: Symbol | undefined): string {
		if (e.prediction == "*") { //change x multiplication to x variable
			e.prediction = "x"
		} else if (prev && e.prediction == "." && // dot and multiplication detection
			(Math.abs((prev.bounds.maxY + prev.bounds.minY) /2 - (e.bounds.maxY + e.bounds.minY) /2)) < 70) {
				e.prediction = "*"
		} else if (prev && Number(e.prediction!) &&  // powers detection
			e.bounds.maxY < (prev.bounds.maxY + prev.bounds.minY)/2 &&
			e.bounds.minY > prev.bounds.minY - (prev.bounds.maxY - prev.bounds.minY)) {
				e.prediction = "^" + e.prediction
		}

		return e.prediction!
	}


	handleCanvasChange(ea: ExcalidrawAutomate) {
		//START LOADING
		this.loadedState = false
		this.updateLoadState()
		

		for (const unsub of this.unsub) {
			unsub()
		}
		this.unsub = []
		
		sleep(5).then(() => {
			model.initModel().then(session => {
				this.unsub.push(ea.getExcalidrawAPI().onPointerUp((activeTool: {type: string}) => {
					sleep(5).then(() => {
						this.handler(ea, session)
					})
				}))

				//END LOADING
				this.loadedState = true
				this.updateLoadState()
			})
		})
		

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

			// console.log("grouped: ", this.grouped)
		}, 100, true)))
	}
	onunload() {}


	updateLoadState() {
		if(!this.loadedState) {
			this.loadedEl!.setText("⟳ loading...")
		} else {
			this.loadedEl!.setText("drawculator loaded!")
		}
	}


	// async loadSettings() {
	// 	this.settings = Object.assign(
	// 		{},
	// 		DEFAULT_SETTINGS,
	// 		(await this.loadData()) as Partial<MyPluginSettings>,
	// 	);
	// }

	// async saveSettings() {
	// 	await this.saveData(this.settings);
	// }
}