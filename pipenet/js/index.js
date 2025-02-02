
const Unit = new UNIT();
const Net = new NET();















// function int8ToBitHex(int8) {
//     // Ensure the input is within the range of an 8-bit signed integer (-128 to 127)
//     if (int8 < -128 || int8 > 127) {
//       throw new RangeError("Input is out of range for int8.");
//     }
  
//     // Convert the signed int8 to an unsigned 8-bit integer (0-255)
//     const unsignedInt8 = int8 < 0 ? 256 + int8 : int8;
  
//     // Convert the unsigned integer to a binary string and pad it to 8 bits
//     const binaryString = unsignedInt8.toString(2).padStart(8, '0');
  
//     // Convert the binary string to a hex string
//     const hexString = parseInt(binaryString, 2).toString(16).padStart(2, '0').toUpperCase();
  
//     return `0x${hexString}`;
// }
  
// const step = Math.PI / 50; // 100 steps
// var outstring = "const uint8_t IM[] PROGMEM = {\n0x01,\n";

// // apply relative positions 0x02 (move), 0xFF (deltaX example), 0xFE (deltaY example)

// var prevx = Math.sin(0) * 127;
// var prevy = Math.cos(0) * 127;

// for(var i = 0; i < 100; i++) {
//     // var val = Math.sin(i * step) * 127;
//     // outstring += "0x" + val.toString(16) + ",\n";
//     const x = Math.sin(i * step) * 127;
//     const y = Math.cos(i * step) * 127;
//     const dx = parseInt(x - prevx);
//     const dy = parseInt(y - prevy);
//     outstring += "0x02, " + int8ToBitHex(dx) + ", " + int8ToBitHex(dy) + ",\n";
//     prevx = x;
//     prevy = y;

// }


// outstring += "0x00,\n0x03\n};";

// console.log(outstring);




// // setup view
