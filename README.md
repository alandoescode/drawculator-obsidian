# Drawculator for Obsidian

Draw mathematical expressions in Obsidian and watch them solve themselves! Drawculator is an Obsidian plugin that uses AI to recognize hand-drawn equations and automatically computes their solutions.

## Features

- **Hand-written Math Recognition**: Draw mathematical expressions using Obsidian's Excalidraw integration
- **Automatic Digit & Symbol Recognition**: Uses a trained CNN model to recognize:
  - Digits (0-9)
  - Basic operators (+, −, ×, ÷)
  - Parentheses and decimals
  - Variables (x, y, z)
- **Real-time Expression Parsing**: Automatically detects and parses mathematical expressions as you draw
- **Equation Solving**: Solves equations and displays results in real-time
- **Fraction Support**: Recognizes and handles fractions in expressions
- **LaTeX Output**: Results are displayed in professional LaTeX formatting

## How It Works

1. Open or create an Excalidraw canvas in Obsidian
2. Draw mathematical digits and operators by hand
3. The plugin recognizes your strokes using machine learning
4. When you draw an equals sign (=), the plugin:
   - Groups all drawn symbols into an expression
   - Parses the mathematical equation
   - Evaluates and simplifies the result
   - Displays the solution on your canvas

## Requirements

- **Obsidian**
- **Excalidraw Plugin** for Obsidian

## Installation

### Automatic
if it's approved to be on obsidian community plugins:
1. Find the **Community plugins** tab under obsidian settings
2. Search for 'drawculator for Excalidraw'
3. Install & reload Obsidian

### Manual
1. Download the latest release from GitHub
2. Extract files into your vault's `.obsidian/plugins/drawculator-obsidian/` folder
3. Reload Obsidian
4. Enable the plugin in **Settings → Community plugins**



### Supported Symbols

- **Digits**: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
- **Operators**: +, −, ×, ÷
- **Grouping**: (, )
- **Other**: ., =
- **Variables**: x, y, z


## Project Structure

```
src/
  main.ts           # Plugin entry point and lifecycle management
  model.ts          # ML model loading and inference with ONNX Runtime
  utils.ts          # Symbol recognition and expression parsing utilities
  settings.ts       # Plugin settings and configuration
  ExcalidrawAutomate.d.ts  # Type definitions for Excalidraw API
```

## Technology Stack

- **Obsidian Plugin API** - Obsidian
- **Excalidraw** - Obsidian plugin for a drawing canvas
- **ONNX Runtime Web** - Machine learning model inference
- **Cortex.js Compute Engine** - Mathematical expression evaluation and solving

## Model Details

The plugin uses a CNN model trained on handwritten mathematical symbols. The model files are loaded from Hugging Face for better performance and reduced bundle size.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests (although it might be quite difficult ifykwim 😛).

## Credits

Built with ❤️ for Obsidian users who love math and handwriting.