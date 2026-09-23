import * as ort from 'onnxruntime-web'

//this file might look weird bc im trynna fix & prevent uncaught illegal access error

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'
ort.env.wasm.numThreads = 1

const DEFS: Record<number, string> = {
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 
    10: 'add', 11: 'close_bracket', 12: 'dec', 13: 'div', 14: 'eq', 15: 'mul', 16: 'open_bracket', 17: 'sub', 
    18: 'x', 19: 'y', 20: 'z'
}

let cachedSession: ort.InferenceSession | null = null;

export async function initModel(): Promise<ort.InferenceSession> {
    if (cachedSession) {
        return cachedSession;
    }
    
    const response = await fetch("https://huggingface.co/booogiee/math_cnn/resolve/main/cnn_single.onnx")

    const modelBuffer = await response.arrayBuffer()

    cachedSession = await ort.InferenceSession.create(
        modelBuffer, {
        executionProviders: ['wasm']
    });

    return cachedSession
}


export async function runModel(session: ort.InferenceSession, inputData: Float32Array): Promise<string> {
    if (!inputData) {
        console.warn('input data missing??')
        return ''
    }
    
    const tensor = new ort.Tensor('float32', new Float32Array(inputData), [1, 1, 32, 32])

    const results = await session.run({ input: tensor })
    // console.log("RESUTLS: ", results)
    const output = results.output?.data as Float32Array

    const predicted = output.indexOf(Math.max(...output))
    return DEFS[predicted]!
}