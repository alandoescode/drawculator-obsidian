import * as ort from 'onnxruntime-web'

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/'


export async function runModel(inputData: Float32Array) {
    const session = await ort.InferenceSession.create(
        'https://raw.githubusercontent.com/booogieeee/drawculator-obsidian/master/model/cnn.onnx', {
        executionProviders: ['wasm']
    });

    const tensor = new ort.Tensor('float32', inputData, [1, 1, 28, 28])

    const results = await session.run({ input: tensor })
    const output = results.output?.data

    const predicted = output?.indexOf(Math.max(...output))
    console.log('Predicted digit: ', predicted)
}