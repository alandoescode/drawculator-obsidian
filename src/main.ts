import {
	Plugin,
	debounce,
	WorkspaceLeaf,
	View
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	DrawculatorSettings,
	SettingTab,
} from './settings';
import { ComputeEngine, Expression } from '@cortex-js/compute-engine';
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




export default class Drawculator extends Plugin {
	loadedState = false
	loadedEl: HTMLElement | undefined
	settings!: DrawculatorSettings;
	unsub: any[] = [];
	canvasGeneration = 0 // tracker to make sure main loop is on track (real uncaught illegal access fix)
	currentMouse = {x: 0, y: 0}
	fontSize = 0
	

	async onload() {
		await this.loadSettings();
		this.app.workspace.onLayoutReady(() => {
			const ea = (window as any).ExcalidrawAutomate as ExcalidrawAutomate;

			if (ea) {
				console.log("excalidraw detected!")

				const button = this.createButton()
				button.setCssStyles({
					visibility: 'hidden'
				})

				this.loadedEl = this.addStatusBarItem()

				let lastViewId: string | null = null
				this.registerEvent(
					(this.app.workspace as any).on('active-leaf-change', 
						(leaf: WorkspaceLeaf) => {
							// console.log("boggie woogie")

							const activeView = leaf?.view

							if (activeView && activeView.getViewType() === "excalidraw") {
								const viewId = (activeView as any).id ?? activeView.containerEl.id
								if (lastViewId === viewId) return
								lastViewId = viewId

								ea.setView(activeView)
								this.fontSize = ea.style.fontSize
								
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

			this.addSettingTab(new SettingTab(this.app, this))
		})
	}

	onunload() {
		this.canvasGeneration++
		this.clearUnsub();
        this.buttonElement?.remove();
	}
	
	private clearUnsub() {
        for (const unsub of this.unsub) {
            if (typeof unsub === 'function') unsub();
        }
        this.unsub = [];
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


	
	private createExpressionLabel(expression: string, pos: {x: number, y: number}, width: number) {
		const expressionLabelElement = this.app.workspace.containerEl.createEl('p', {
			cls: "expression-label",
			text: expression,
		})

		expressionLabelElement.style.top = `${pos.y-67}px`
		expressionLabelElement.style.left = `${pos.x}px`
		
		expressionLabelElement.setCssStyles({
			visibility: 'visible',
			width: `${Math.max(Math.abs(width), expressionLabelElement.getBoundingClientRect().width)}px`,
			height: '57px',
			fontSize: '50px'
		})

		const expLabelMouseDownListener = this.registerDomEvent(window, "mousedown", (mouseEvent: MouseEvent) => {
			expressionLabelElement.remove()
		})
		return expressionLabelElement
	}

	//overengineered but it works
	private sceneToViewport(ea: ExcalidrawAutomate, x: number, y: number) {
		const api = ea.getExcalidrawAPI()
		if (!api) return {x: 0, y: 0}

		const appState = api.getAppState()
		const canvas = this.app.workspace.containerEl.querySelector<HTMLCanvasElement>(
			'.workspace-leaf-content[data-type="excalidraw"] canvas'
		)
		if (!canvas || !canvas.isConnected) return {x: 0, y: 0}

		const canvasBounds = canvas?.getBoundingClientRect()
		const zoom = appState.zoom.value

		return {
			x: (x + appState.scrollX) * zoom + (canvasBounds?.left ?? 0),
			y: (y + appState.scrollY) * zoom + (canvasBounds?.top ?? 0),
		}
	}



	private DEFS: Record<string, string> = {
		'add': '+', 'dec': '.', 'div': '/', 'eq': '=', 'mul': '*', 'sub': '-', 'open_bracket': '(', 'close_bracket': ')'
	}
	grouped: Map<Symbol["id"], Symbol> = new Map()

	private handler = (ea: ExcalidrawAutomate /**elements: ExcalidrawElement[]**/, session: InferenceSession) => {
		const activeLeaf = this.app.workspace.getActiveViewOfType(View as any)
		if (!activeLeaf || activeLeaf.getViewType() !== "excalidraw") return

		const elements: readonly ExcalidrawElement[] = ea.getViewElements()
		// console.log("ELEMENTS:", elements)
		const strokes = elements.filter(element => element.type === "freedraw" && element.isDeleted === false)
		

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

			if (this.settings.expressionPreview) {
				const labelPosition = this.sceneToViewport(
					ea,
					element.bounds.minX,
					element.bounds.minY,
				)
				this.createExpressionLabel(predicted, {
					x: labelPosition.x,
					y: labelPosition.y
				}, element.bounds.maxX - element.bounds.minX)
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
						// console.warn(e.prediction, e2?.prediction)
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
					

					//add label to show expression above real expression
					if(this.settings.expressionPreview) {
						const labelPosition = this.sceneToViewport(
							ea,
							found[0]?.bounds.minX ?? 0,
							Math.min(...found.map(e => e.bounds.minY)),
						)
						
						const expressionLabel = this.createExpressionLabel(expressionString,
							{x: labelPosition.x, y: labelPosition.y-67},
							found[found.length-1]!.bounds.maxX - found[0]!.bounds.minX)
					}



					const ce = new ComputeEngine()
					const parsed = ce.parse(expressionString)

					const simplified = ce.expr(parsed.simplify())
					// console.log("SIMPLIFIED: ", simplified.latex)

					const solved = parsed.solve()
					// console.log("solved: ", solved)
					
					const solution = Array.isArray(solved) ? (solved as unknown as Expression[]).map(s => utils.fixLaTeX(s.latex)) : null
					// console.log("SOLUTION: ", solution)

					let firstFound = found[found.length-1]
					if (found[found.length-2] && found[found.length-2]!.bounds.maxY - found[found.length-2]!.bounds.minY > found[found.length-1]!.bounds.maxY - found[found.length-1]!.bounds.minY) {
						firstFound = found[found.length-2]
					} //idk why i did this but ill keep it here

					ea.reset()

					const height = (firstFound!.bounds.maxY - firstFound!.bounds.minY)*1.2 //100
					ea.style.fontSize = Math.max(156, (this.fontSize / 25) * height)/18 //size calculation
					
					
					ea.addLaTex(
						element.bounds.maxX + (element.bounds.minX - found[found.length-1]!.bounds.maxX)/1.367,
						(element.bounds.maxY + element.bounds.minY)/2 - (firstFound!.bounds.maxY - firstFound!.bounds.minY)/2 - height/16.67,
						(solution && solution.length >= 1 ? `x = ${solution.join(', ')}` + " | " : "") + simplified.latex, ea.style.fontSize, ea.style.fontSize
					).then(addedId => {
							// console.log(addedId)
							
							// console.log("Element object:", el);
							// console.log("Is rendered in view:", ea.getViewElements().some(e => e.id === addedId));
							
							ea.addElementsToView()
							const el = ea.getElement(addedId);
							el.opacity = 50
							

							
							const removeMouseDownListener = this.registerDomEvent(window, "mousedown", (mouseEvent: MouseEvent) => {
								if ((mouseEvent.target as HTMLElement).parentElement!.classList.contains("feedback-btn")) {
									// console.log(mouseEvent.target)
									
									const clicked = mouseEvent.target as HTMLElement
									if (clicked.textContent == "yes") {
										el.opacity = 100
										ea.viewUpdateScene({ elements: ea.getViewElements() })
									} else {
										ea.deleteViewElements([ea.getElement(addedId)])
									}
									
									this.buttonElement!.setCssStyles({
										visibility: 'hidden'
									})
								} else if (!el.isDeleted && el.opacity == 50) {
									ea.deleteViewElements([el])
									this.buttonElement!.setCssStyles({
										visibility: 'hidden'
									})
								}
							})
						}
					)
					
					

					this.buttonElement!.style.left = `${this.currentMouse.x}px`
					this.buttonElement!.style.top = `${this.currentMouse.y}px`
					
					this.buttonElement!.setCssStyles({
						visibility: 'visible'
					})
					
				}
			}
		}).catch(error => {
			console.error("Drawculator model error", error)
		}) : null
		// console.log("GROUPED:", grouped)
	}


	transformPrediction(e: Symbol, prev: Symbol | undefined): string {
		// console.warn("PREVIOUS: ", prev?.prediction, " CURRENT: ", e.prediction)
		if (e.prediction == "*") { //change x multiplication to x variable
			e.prediction = "x"
		} else if (prev && e.prediction == "." && // dot and multiplication detection
			(Math.abs((prev.bounds.maxY + prev.bounds.minY) /2 - (e.bounds.maxY + e.bounds.minY) /2)) < 70) {
				e.prediction = "*"
		} else if (prev && Number(e.prediction!) &&  // powers detection
			e.bounds.maxY < ((prev.bounds.maxY + prev.bounds.minY)/2) + (prev.bounds.maxY-prev.bounds.minY)/5 &&
			e.bounds.minY > prev.bounds.minY - (prev.bounds.maxY - prev.bounds.minY)) {
				e.prediction = "^" + e.prediction
				// console.log("prev BOUNDS: ", prev.bounds, " CURENT boudbns: ", e.bounds)
		}

		

		return e.prediction!
	}


	handleCanvasChange(ea: ExcalidrawAutomate) {
		const generation = ++this.canvasGeneration
		//START LOADING
		this.loadedState = false
		this.updateLoadState()
		
		this.clearUnsub()
		
		sleep(5).then(() => {
			if (generation !== this.canvasGeneration) return
			model.initModel().then(session => {
				if (generation !== this.canvasGeneration) return
				const api = ea.getExcalidrawAPI()

				this.unsub.push(
					api.onPointerUp((_activeTool: {type: string}) => {
					sleep(5).then(() => {
						if (generation === this.canvasGeneration) {
							this.handler(ea, session)
						}
					})
				}))

				//END LOADING
				this.loadedState = true
				this.updateLoadState()
			}).catch(error => {
				if (generation === this.canvasGeneration) {
					console.error("Drawculator model initialization error", error)
				}
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


	updateLoadState() {
		if(!this.loadedState) {
			this.loadedEl!.setText("⟳ loading...")
		} else {
			this.loadedEl!.setText("drawculator loaded!")
		}
	}


	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<DrawculatorSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}