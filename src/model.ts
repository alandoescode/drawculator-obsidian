import { warn } from 'console';
import * as ort from 'onnxruntime-web'

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'

const DEFS: Record<number, string> = {
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'add', 11: 'close_bracket', 12: 'dec', 13: 'div', 14: 'eq', 15: 'mul', 16: 'open_bracket', 17: 'sub', 18: 'x', 19: 'y', 20: 'z'
}


export async function initModel() {
    const session = await ort.InferenceSession.create(
        'https://huggingface.co/booogiee/math_cnn/resolve/main/cnn_single.onnx', {
        executionProviders: ['wasm']
    });

    return session
}


export async function runModel(session: ort.InferenceSession, inputData: Float32Array): Promise<string> {
    if (!inputData) {
        warn('input data missing??')
        return ''
    }

    const tensor = new ort.Tensor('float32', inputData, [1, 1, 32, 32])

    const results = await session.run({ input: tensor })
    console.log("RESUTLS: ", results)
    const output = results.output?.data as Float32Array

    const predicted = output!.indexOf(Math.max(...output))
    return DEFS[predicted]!
}