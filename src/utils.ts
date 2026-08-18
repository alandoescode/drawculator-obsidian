import { ExcalidrawAutomate, ExcalidrawElement } from "./ExcalidrawAutomate"


interface Point {
    x: number
    y: number
}

interface BoundingBox {
    minX: number
    minY: number
    maxX: number
    maxY: number
}

export interface Symbol {
    id: string
    bounds: BoundingBox
    points?: Point[]
    children?: Symbol[]
    prediction?: string //eventually will be available
    done?: boolean //prevents element from being predicted again
}


/**
 * normalizes and converts ExcalidrawElement to Symbol for use in ai recognition
 * @param element 
 * @returns normalized Symbol element
 */
export function normalizeElement(element: ExcalidrawElement) : Symbol {
    const newPoints: Point[] | undefined = element.points?.map(([px, py] : [number, number]) => ({
            x: element.x + px,
            y: element.y + py
        }))
    
    const normalized: Symbol = {
        id: element.id,
        points: newPoints,
        bounds: getBounds(element)
    }

	return normalized
}


/**
 * groups elements' points based on distance from each others bounding boxes
 * @param elements ungrouped, raw array of Symbols
 * @param threshold maximum distance for Symbols to be grouped
 * @returns new grouped Symbol (latest drawn)
 */
export function groupBounds(elements: Symbol[], threshold: number = 10) {
    let i = elements.length-1
    const thresholdY = threshold**1.67

    const e = elements[i]!

    let groupedElement: Symbol = {
        id: e.id,
        points: e.points ? [...e.points] : undefined,
        bounds: e.bounds,
        children: [e]
    }
    
    while (i > 0) {
        const e = elements[i]!
        const e2 = elements[i-1]!

        const dx = Math.max(0, 
            Math.max(e.bounds.minX - e2.bounds.maxX, e2.bounds.minX - e.bounds.maxX) //math.min(math.abs(e.bounds.... - e2.bounds....))
        )

        const dy = Math.max(0, 
            Math.max(e.bounds.minY - e2.bounds.maxY, e2.bounds.minY - e.bounds.maxY)
        )

        //distance for general threshold, changed to seperate dx & dy to detect easier
        // const distance = Math.sqrt(dx*dx + dy*dy)

        if (dx <= threshold && dy <= thresholdY) {
            groupedElement.id = e2.id
            e2.points ? groupedElement.points?.push(...e2.points) : undefined
            groupedElement.bounds = {
                minX: Math.min(e.bounds.minX, e2.bounds.minX),
                maxX: Math.max(e.bounds.maxX, e2.bounds.maxX),
                minY: Math.min(e.bounds.minY, e2.bounds.minY),
                maxY: Math.max(e.bounds.maxY, e2.bounds.maxY)
            }
            groupedElement.children!.push(e2)

            // if (i-1 == 1) {i = 1} //forgor why this here
        } else {
            break
        }
        // console.log(dx, dy)
        i--
    }

    return groupedElement
}


/**
 * calculate bounding box of an array of points
 * @param points array of [x, y] coordinate points
 * @returns min/max X, min/max Y
 */
function getBounds(element: ExcalidrawElement | Symbol) {
    // console.warn(element)
    if (!element.points || element.points.length == 0) {
        return {
            minX: element.x,
            minY: element.y,
            maxX: element.x + element.width,
            maxY: element.y + element.height
        }
    } else {
        const xs = element.points.map((p: number[]) => element.x ? p[0] + element.x : p[0])
	    const ys = element.points.map((p: number[]) => element.y ? p[1] + element.y : p[1])

        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys)
        }
    }
}


export function findFractionOperands(grouped: Map<Symbol["id"], Symbol>, bar: Symbol) {
    const barWidth = Math.max(1, bar.bounds.maxX - bar.bounds.minX)
    const horizontalPadding = Math.max(30, barWidth * 0.75)
    const verticalPadding = Math.max(80, barWidth * 1.25)

    const xMin = bar.bounds.minX - horizontalPadding
    const xMax = bar.bounds.maxX + horizontalPadding

    const numerator = Array.from(grouped.values())
        .filter((el) =>
            el.id !== bar.id &&
            el.bounds.maxY <= bar.bounds.minY &&
            bar.bounds.minY - el.bounds.maxY <= verticalPadding &&
            isWithinHorizontalRange(el, xMin, xMax),
        )
        .sort((a, b) => a.bounds.minX - b.bounds.minX)

    const denominator = Array.from(grouped.values())
        .filter((el) =>
            el.id !== bar.id &&
            el.bounds.minY >= bar.bounds.maxY &&
            el.bounds.minY - bar.bounds.maxY <= verticalPadding &&
            isWithinHorizontalRange(el, xMin, xMax),
        )
        .sort((a, b) => a.bounds.minX - b.bounds.minX)

    if (numerator.length === 0 || denominator.length === 0) {
        return null
    }

    return { numerator, denominator }
}

function isWithinHorizontalRange(el: Symbol, xMin: number, xMax: number) {
    return el.bounds.maxX >= xMin && el.bounds.minX <= xMax
}


/**
 * Converts line coordinates into a 4D ONNX Tensor.
 * Preserves the original aspect ratio, applies padding, and normalizes values to [0.0, 1.0].
 * @returns An ONNX Tensor with shape [1, 1, 32, 32]
 */
export function pointsToTensor(element: Symbol): Float32Array | null {
    const GRID_SIZE = 32;
    const PADDING = 6;
    const USABLE_SIZE = GRID_SIZE - (PADDING * 2);
    
    const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    
    if (!element.points) return null

    const rawPoints: [number, number][] = element.points.map(points => [points.x, points.y])

    const xData = rawPoints.map(([x]) => x);
    const yData = rawPoints.map(([, y]) => y);

    // 1. Find bounding box dimensions
    let xMin = xData[0], xMax = xData[0];
    let yMin = yData[0], yMax = yData[0];

    for (let i = 1; i < xData.length; i++) {
        if (xData[i]! < xMin!) xMin = xData[i];
        if (xData[i]! > xMax!) xMax = xData[i];
    }
    for (let i = 1; i < yData.length; i++) {
        if (yData[i]! < yMin!) yMin = yData[i];
        if (yData[i]! > yMax!) yMax = yData[i];
    }

    const dataWidth = (xMax! - xMin!) || 1;
    const dataHeight = (yMax! - yMin!) || 1;

    // 2. Uniform scaling
    // const maxDimension = Math.max(dataWidth, dataHeight);
    // const scale = USABLE_SIZE / maxDimension;
    const SOFTENING = 70
    const maxDimension = Math.max(dataWidth, dataHeight);
    const scale = USABLE_SIZE / (maxDimension + SOFTENING);

    // 3. Center the drawing
    const scaledWidth = dataWidth * scale;
    const scaledHeight = dataHeight * scale;
    const xOffset = PADDING + (USABLE_SIZE - scaledWidth) / 2;
    const yOffset = PADDING + (USABLE_SIZE - scaledHeight) / 2;

    // 4. Map to pixel space
    const pixelPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < xData.length; i++) {
        const xPixel = Math.round(((xData[i]! - xMin!) * scale) + xOffset);
        const yPixel = Math.round(((yData[i]! - yMin!) * scale) + yOffset);
        pixelPoints.push({
            x: Math.max(0, Math.min(GRID_SIZE - 1, xPixel)),
            y: Math.max(0, Math.min(GRID_SIZE - 1, yPixel))
        });
    }

    const drawPixel = (x: number, y: number) => {
        grid[y * GRID_SIZE + x] = 255;
        const offsets = [[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx, dy] of offsets) {
            const nx = x + dx!;
            const ny = y + dy!;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                grid[ny * GRID_SIZE + nx] = Math.max(grid[ny * GRID_SIZE + nx]!, 128);
            }
        }
    };

    // 5. Bresenham's Line Algorithm
    const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            drawPixel(x0, y0);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    };

    // 6. Connect points
    let offset = 0
    const threshold = 30

    element.children?.forEach((e, i) => {
        if (e.points) {
            for (let i = 0; i < e.points.length - 1; i++) {
                drawLine(pixelPoints[i + offset]!.x, pixelPoints[i + offset]!.y, pixelPoints[i + offset + 1]!.x, pixelPoints[i + offset + 1]!.y);
            }
            offset += e.points.length
        }
    })

    if (Math.max(element.bounds.maxX - element.bounds.minX, element.bounds.maxY - element.bounds.minY) < threshold) {
        for (let y = 0; y < GRID_SIZE; y++) {
            let minX = -1, maxX = -1
            for (let x = 0; x < GRID_SIZE; x++) {
                if (grid[y * GRID_SIZE + x]! > 0) {0
                    if (minX === -1) minX = x
                    maxX = x
                }
            }
            if (minX !== -1) {
                for (let x = minX; x <= maxX; x++) {
                    grid[y * GRID_SIZE + x] = 255
                }
            }
        }
    }
    
    

    // 7. ASCII Visualizer
    let asciiGrid = "";
    for (let y = 0; y < GRID_SIZE; y++) {
        let row = "";
        for (let x = 0; x < GRID_SIZE; x++) {
            row += grid[y * GRID_SIZE + x]! > 128 ? "██" : "  ";
        }
        asciiGrid += row + "\n";
    }
    // console.log("%cModel Matrix Visualisation:", "font-weight: bold; color: #4af626;");
    // console.log(asciiGrid);

    // 8. MODIFIED: Adjusted to 32x32 size and updated to use custom (0.5, 0.5) normalization
    const floatBuffer = new Float32Array(GRID_SIZE * GRID_SIZE);
    for (let i = 0; i < grid.length; i++) {
        // Normalization Formula: (PixelValue / 255.0 - Mean) / Std
        // (PixelValue / 255.0 - 0.5) / 0.5
        floatBuffer[i] = (grid[i]! / 255.0 - 0.5) / 0.5;
    }

    return floatBuffer;
}


function findElementInBounds(elements: Map<Symbol["id"], Symbol>, bounds: BoundingBox) {
    let inBounds: Symbol[] = []

    elements.forEach(e => {
        if (
            (e.bounds.minX < bounds.maxX && e.bounds.maxX > bounds.minX) && 
            (e.bounds.minY < bounds.maxY && e.bounds.maxY > bounds.minY)
        ) {
            inBounds.push(e)
        }
    });

    return inBounds
}

/**
 * find elements to the left of given element (for assembling equations)
 * stops when no elements found in range or limit hit
 * 
 * @param elements list of all elements
 * @param e given element
 * @param limit how many boxes to go left by, default = 10
 * @param range box width, default  =250
 * @param ea show bounding boxes (debug)
 * @returns set of found elements (SORTED BY MAX X)
 */
export function findElementsLeft(
    { elements, e, limit = 10, range = 250, rangeY, ea } : { 
    elements: Map<Symbol["id"], Symbol>, e: Symbol, limit?: number, range?: number, rangeY?: number, ea?: ExcalidrawAutomate 
}): Array<Symbol> {
    //expand bound box to left until nothing in it
    let i = 1

    let found = []
    let inBounds: Set<Symbol> = new Set()

    rangeY = rangeY ?? range*1.5

    ea?.setView()
    do {
        const box: BoundingBox = {
            maxX: e.bounds.minX - range*(i-1) - 5,
            minX: e.bounds.minX - range*i,
            minY: e.bounds.minY - rangeY,
            maxY: e.bounds.maxY + rangeY,
        }
        found = findElementInBounds(elements, box)
        found.forEach(e => {
            inBounds.add(e)
            // ea?.addRect(e.bounds.minX, e.bounds.minY, (e.bounds.maxX-e.bounds.minX), (e.bounds.maxY-e.bounds.minY))
        })

        // ea?.addRect(box.minX, box.minY, (box.maxX-box.minX), (box.maxY-box.minY))
		
        // ea?.addElementsToView()
        // console.log("added elements: ", [box.minX, box.minY, (box.maxX-box.minX), (box.maxY-box.minY)])

        i++
    } while (found.length > 0 && i < limit); //limit on iterations
    
    const inBoundsSorted = Array.from(inBounds).sort((a, b) => a.bounds.maxX - b.bounds.maxX)
    
    return inBoundsSorted
}