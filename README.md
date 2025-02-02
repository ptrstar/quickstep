# QuickStep Plotter

QuickStep is an extremely lightweight (both generated paths for A6 Postcards and arduino driver code < 32kB), high-speed motion control system for Arduino-based pen plotters. It includes:

- **Image & Text to QuickStep Converter** – Transforms raster images and true type fonts into optimized QuickStep commands.
- **QuickStep Motion Driver** – A minimal, efficient stepper control firmware designed for high-speed plotting.

## Features
- Compressed G-code-like command format called Quickstep
- Optimized stepper motion for speed and precision  
- Custom toolpath generation for line-art and text  

## Getting Started
1. Flash the QuickStep driver to your Arduino.  
2. Convert images or text using the PipeNet front-end.  
3. Send the generated commands to your plotter.  

Work in progress.
