// Hershey Astrology Font Parser
async function loadHersheyFont(fontUrl) {
  try {
    const response = await fetch(fontUrl);
    if (!response.ok) {
      throw new Error(`Failed to load font: ${response.status} ${response.statusText}`);
    }
    const fontData = await response.text();
    return parseHersheyFont(fontData);
  } catch (error) {
    console.error('Error loading Hershey font:', error);
    throw error;
  }
}

// Parse the Hershey Astrology font format (different from standard Hershey)
function parseHersheyFont(fontData) {
  const glyphs = {};
  const lines = fontData.split('\n');
  
  // For astrology.jhf, we need to assign characters sequentially
  // since all glyphs use the same code "12345"
  let charIndex = 32; // Start with space character
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length < 10) continue; // Skip short lines
    
    // For astrology.jhf, ignore the "12345" prefix
    const vertexCount = parseInt(line.substring(5, 8).trim());
    const leftPos = line.charCodeAt(8) - 'R'.charCodeAt(0);
    const rightPos = line.charCodeAt(9) - 'R'.charCodeAt(0);
    
    // Parse the coordinates
    const polylines = [];
    let currentPolyline = [];
    
    for (let j = 10; j < line.length; j += 2) {
      if (j + 1 >= line.length) break;
      
      const x = line.charCodeAt(j) - 'R'.charCodeAt(0);
      const y = line.charCodeAt(j + 1) - 'R'.charCodeAt(0);
      
      // In Hershey format, the pen-up command is represented by the coordinate R R (ASCII 82,82)
      if (x === -50 && y === -50) {
        if (currentPolyline.length > 0) {
          polylines.push(currentPolyline);
          currentPolyline = [];
        }
        continue;
      }
      
      currentPolyline.push([x, -y]); // Invert y (Hershey has y pointing down)
    }
    
    // Add the last polyline if it has points
    if (currentPolyline.length > 0) {
      polylines.push(currentPolyline);
    }
    
    // Store the glyph with an assigned ASCII character
    // In astrology.jhf, each glyph represents a symbol in sequence
    const char = String.fromCharCode(charIndex);
    charIndex++;
    
    glyphs[char] = {
      width: rightPos - leftPos,
      leftPos,
      rightPos,
      polylines
    };
    
    console.log(`Assigned glyph #${i} to '${char}', with ${polylines.length} polylines`);
  }
  
  return {
    glyphs,
    getGlyph(char) {
      return this.glyphs[char] || this.glyphs[' '] || {
        width: 10,
        leftPos: 0,
        rightPos: 10,
        polylines: [[[0, 0], [10, 0]]]
      };
    }
  };
}

// Convert a string to polylines using a Hershey font
function stringToPolylines(text, font, options = {}) {
  const { scale = 1, spacing = 1, x = 0, y = 0 } = options;
  
  let currentX = x;
  const allPolylines = [];
  
  console.log(`Converting text: "${text}" with ${Object.keys(font.glyphs).length} available glyphs`);
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const glyph = font.getGlyph(char);
    
    // Adjust position for this glyph
    const adjustedX = currentX - (glyph.leftPos * scale);
    
    // Add each polyline for this glyph to the result
    for (const polyline of glyph.polylines) {
      if (polyline.length <= 1) continue; // Skip single-point polylines
      
      const scaledPolyline = polyline.map(point => [
        adjustedX + (point[0] * scale),
        y + (point[1] * scale)
      ]);
      
      allPolylines.push(scaledPolyline);
    }
    
    // Move to next character position
    currentX += glyph.width * scale * spacing;
  }
  
  return allPolylines;
}

// Example usage
async function renderTextToPolylines(text, options = {}) {
  const fontUrl = 'https://raw.githubusercontent.com/kamalmostafa/hershey-fonts/master/hershey-fonts/astrology.jhf';
  const font = await loadHersheyFont(fontUrl);
  return stringToPolylines(text, font, options);
}

// Demo
async function demo() {
  // For astrology.jhf, try using characters from the ASCII range where the font has glyphs
  // (Typically starting from ASCII 32 - space)
  const text = " !\"#$%&"; // First few characters in the font
  const polylines = await renderTextToPolylines(text, { scale: 2, x: 10, y: 10 });
  
  console.log(`Generated ${polylines.length} polylines for text: "${text}"`);
  console.log(JSON.stringify(polylines.slice(0, 2), null, 2)); // Show first two polylines
  
  return polylines;
}

demo().catch(console.error);