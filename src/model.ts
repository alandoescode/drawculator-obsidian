import * as ort from 'onnxruntime-web'

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'

const DEFS = {
    0: '0', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'add', 11: 'dec', 12: 'div', 13: 'eq', 14: 'mul', 15: 'sub', 16: 'x', 17: 'y', 18: 'z'
}


export async function runModel(inputData: Float32Array): Promise<string | undefined> {
    if (!inputData) return

    const session = await ort.InferenceSession.create(
        'https://huggingface.co/booogiee/math_cnn/resolve/main/cnn_single.onnx', {
        executionProviders: ['wasm']
    });

    const tensor = new ort.Tensor('float32', inputData, [1, 1, 32, 32])

    const results = await session.run({ input: tensor })
    console.log("RESUTLS: ", results)
    const output = results.output?.data

    const predicted = output?.indexOf(Math.max(...output))
    return DEFS[predicted]
}