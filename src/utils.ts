import { ExcalidrawElement } from "./ExcalidrawAutomate"


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

interface Symbol {
    points: Point[]
    bounds: BoundingBox
    merged?: boolean
}


/**
 * normalizes and converts ExcalidrawElement to Symbol for use in ai recognition
 * @param element 
 * @returns normalized Symbol element
 */
export function normalizeElement(element: ExcalidrawElement) : Symbol {
    const newPoints = element.points.map(([px, py] : [number, number]) => ({
            x: element.x + px,
            y: element.y + py
        }))
    
    const normalized: Symbol = {
        points: newPoints,
        bounds: getBounds(newPoints)
    }

	return normalized
}


/**
 * groups elements' points based on distance from each others bounding boxes
 * @param elements ungrouped, raw array of Symbols
 * @param threshold maximum distance for Symbols to be grouped
 * @returns new array of Symbols, grouped
 */
export function groupBounds(elements: Symbol[], threshold: number = 100) {
    let newElements: Symbol[] = []

    for (let i = 0; i < elements.length; i++) {
        const e = elements[i]!
        if (i == elements.length-1) {newElements.push(e); continue}
        const e2 = elements[i+1]!

        const dx = Math.max(0, 
            Math.max(e.bounds.minX - e2.bounds.maxX, e2.bounds.minX - e.bounds.maxX) //math.min(math.abs(e.bounds.... - e2.bounds....))
        )

        const dy = Math.max(0, 
            Math.max(e.bounds.minY - e2.bounds.maxY, e2.bounds.minY - e.bounds.maxY)
        )

        const distance = Math.sqrt(dx*dx + dy*dy)

        if (distance <= threshold) {
            e.points.push(...e2!.points)
            e.bounds = getBounds(e.points)

            if (newElements[newElements.length-1]?.merged == true) {
                
            }

            if (i+1 == elements.length-1) {i += 1}
        }
        console.log(dx, dy, distance)
        newElements.push(e)
    }

    return newElements
}


/**
 * calculate bounding box of an array of points
 * @param points array of [x, y] coordinate points
 * @returns min/max X, min/max Y (corners)
 */
function getBounds(points: Point[]) {
	const xs = points.map(p => p.x)
	const ys = points.map(p => p.y)

	const minX = Math.min(...xs)
	const minY = Math.min(...ys)
	const maxX = Math.max(...xs)
	const maxY = Math.max(...ys)

	return { minX, minY, maxX, maxY }
}


import * as ort from 'onnxruntime-web';

/**
 * Converts line coordinates into an MNIST-compatible 4D ONNX Tensor.
 * Preserves the original aspect ratio, applies padding, and normalizes values to [0.0, 1.0].
 * * @returns An ONNX Tensor with shape [1, 1, 28, 28] ready for model evaluation.
 */
export function pointsToMnistTensor(xData: number[], yData: number[]): Float32Array {
    const GRID_SIZE = 28;
    const PADDING = 2; // Keep a 2-pixel safety margin from the grid edges
    const USABLE_SIZE = GRID_SIZE - (PADDING * 2); // 24 pixels max size
    
    const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
    
    // Fallback if no lines are drawn: return an all-zero 4D tensor
    if (xData.length === 0 || yData.length === 0) {
        return new ort.Tensor('float32', new Float32Array(GRID_SIZE * GRID_SIZE), [1, 1, GRID_SIZE, GRID_SIZE]);
    }

    // 1. Find bounding box dimensions
    let xMin = xData[0], xMax = xData[0];
    let yMin = yData[0], yMax = yData[0];

    for (let i = 1; i < xData.length; i++) {
        if (xData[i] < xMin) xMin = xData[i];
        if (xData[i] > xMax) xMax = xData[i];
    }
    for (let i = 1; i < yData.length; i++) {
        if (yData[i] < yMin) yMin = yData[i];
        if (yData[i] > yMax) yMax = yData[i];
    }

    const dataWidth = (xMax - xMin) || 1;
    const dataHeight = (yMax - yMin) || 1;

    // 2. Uniform scaling: Use the largest dimension to preserve aspect ratio
    const maxDimension = Math.max(dataWidth, dataHeight);
    const scale = USABLE_SIZE / maxDimension;

    // 3. Center the drawing in the 28x28 space
    const scaledWidth = dataWidth * scale;
    const scaledHeight = dataHeight * scale;
    const xOffset = PADDING + (USABLE_SIZE - scaledWidth) / 2;
    const yOffset = PADDING + (USABLE_SIZE - scaledHeight) / 2;

    // 4. Map raw data to the centered, uniform pixel space
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < xData.length; i++) {
        const xPixel = Math.round(((xData[i] - xMin) * scale) + xOffset);
        // Correcting Y inversion logic to map correctly inside the grid index space
        const yPixel = Math.round(((yData[i] - yMin) * scale) + yOffset);

        // Clamping to completely ensure no indexes spill over grid edges (0-27)
        points.push({
            x: Math.max(0, Math.min(GRID_SIZE - 1, xPixel)),
            y: Math.max(0, Math.min(GRID_SIZE - 1, yPixel))
        });
    }

    // 5. Bresenham's Line Algorithm
    const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            const flatIndex = (y0 * GRID_SIZE) + x0;
            grid[flatIndex] = 255;

            if (x0 === x1 && y0 === y1) break;

            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    };

    // 6. Connect the points sequentially using the line drawer
    for (let i = 0; i < points.length - 1; i++) {
        drawLine(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    }

    // 7. ASCII Visualizer (Fixed indexing bug where y loop bounds matched out-of-index ranges)
    let asciiGrid = "";
    for (let y = 0; y < GRID_SIZE; y++) {
        let row = "";
        for (let x = 0; x < GRID_SIZE; x++) {
            const flatIndex = (y * GRID_SIZE) + x;
            row += grid[flatIndex] > 128 ? "██" : "  ";
        }
        asciiGrid += row + "\n";
    }
    console.log("%cMNIST Matrix Visualisation:", "font-weight: bold; color: #4af626;");
    console.log(asciiGrid);

    // 8. CONVERT & NORMALIZE FOR CNN
    // ONNX expects float32 array elements bounded between [0.0, 1.0]
    const floatBuffer = new Float32Array(GRID_SIZE * GRID_SIZE);
    for (let i = 0; i < grid.length; i++) {
        floatBuffer[i] = grid[i] / 255.0;
    }

    // 9. RETURN AS 4D TENSOR: [Batch Size, Channels, Height, Width]
    return floatBuffer;
}