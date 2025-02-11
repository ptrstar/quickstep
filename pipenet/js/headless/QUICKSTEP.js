class QUICKSTEP {
    constructor() {
        this.instr_stream;
        this.instr_buffer_4;
        this.data_buffer_4;
        this.int_size = 8;
    }

    reset() {
        this.int_size = 8;
        this.instr_stream = "";
        this.instr_buffer_4 = [];
        this.data_buffer_4 = [];
    }

    convert(buffer) {

        // Assumption, assume that lines are long and consistent in their step length such that it is a good
        // enough approximation of the optimal intsize to check line by line

        this.reset();

        var prev_step = new Point();
        buffer.forEach(line => {
            if (line.isEmpty()) return;
            this.checkIntSize(line);

            var step = line.first.unpropscale(Unit.mm2xstep, Unit.mm2ystep).round();
            var target = step.sub(prev_step);
            this.append_instrbuf_move(this.moveTo(target));
            prev_step = step;
            this.issue_instr("00");

            line.buffer.forEach(point => {

                var step = point.unpropscale(Unit.mm2xstep, Unit.mm2ystep).round();
                var target = step.sub(prev_step);
                this.append_instrbuf_move(this.moveTo(target));
                // instr_stream += this.moveTo(target, intSize);
                prev_step = step;
                
            });
            this.issue_instr("00");
        })

        this.append_instrbuf_move(this.moveTo(prev_step.scale(-1)));
        this.issue_instr("11");

        // flush the instr_buffer
        this.issue_instr(undefined);

        return this.instr_stream;
    }
    checkIntSize(line) {
        var intSize = line.getIntSize();
        console.log(intSize);
        if (intSize != this.int_size) {
            this.issue_instr("01");
            switch(intSize) {
                case 4:
                    this.issue_instr("00");
                    break;
                case 8:
                    this.issue_instr("01");
                    break;
                case 16:
                    this.issue_instr("10");
                    break;
                default:
                    throw new RangeError("unknown intSize: ", intSize);
            }
        }
        this.int_size = intSize;
    }

    issue_instr(bits) {
        if (this.instr_buffer_4.length == 4 || bits == undefined) {
            var temp = "";
            for (var i = this.instr_buffer_4.length -1; i >= 0; i--) {
                temp += this.instr_buffer_4[i];
            }
            this.instr_stream += "0x" + parseInt(temp.padStart(8, '0'), 2).toString(16).toUpperCase() + ",";
            this.data_buffer_4.forEach(data => {
                this.instr_stream += data;
            });
            this.instr_stream += "\n";

            this.instr_buffer_4 = [];
            this.data_buffer_4 = [];
        }
        this.instr_buffer_4.push(bits);
    }
    append_instrbuf_move(buffer) {
        buffer.forEach(segment => {
            this.issue_instr("10");
            this.data_buffer_4.push(segment);
        });
    }


    moveTo(pt) {

        if (pt.round().x != pt.x || pt.round().y != pt.y) {
            throw new TypeError("point was unrounded", pt);
        }

        var point = pt.clone();

        var str = [];

        while (point.x != 0 || point.y != 0) {

            const required_instr = Math.max(Math.abs(point.x), Math.abs(point.y)) / ((1 << (this.int_size-1)) - 1);
            const instr_count = Math.ceil(required_instr);

            const dx = Math.floor(point.x / instr_count);
            const dy = Math.floor(point.y / instr_count);

            switch (this.int_size) {
                case 4:
                    str.push(this.int4ToBitHex(dx, dy) + ",");
                    break;
                case 8:
                    str.push(this.int8ToBitHex(dx) + "," + this.int8ToBitHex(dy) + ",");
                    break;
                case 16:
                    str.push(this.int16ToBitHex(dx) + "," + this.int16ToBitHex(dy) + ",");
                    break;
                default:
                    throw new RangeError("unknown intSize ", intSize);
            }
            point.x -= dx;
            point.y -= dy;
        }

        return str;
    }

    hexToBits = (hex) => [...hex].map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
    bitsToHex = (bits) => bits.match(/.{4}/g).map(b => parseInt(b, 2).toString(16)).join('');

    int8ToBitHex(int8) {
        if (int8 < -128 || int8 > 127) {
          throw new RangeError("Input is out of range for int8.");
        }
      
        const unsignedInt8 = int8 < 0 ? 256 + int8 : int8;
        const binaryString = unsignedInt8.toString(2).padStart(8, '0');
        const hexString = parseInt(binaryString, 2).toString(16).padStart(2, '0').toLowerCase();
      
        return `0x${hexString}`;
    }
    BitHexToInt8(bitHex) {
        const hexString = bitHex.slice(2);
        const binaryString = parseInt(hexString, 16).toString(2).padStart(8, '0');
        const unsignedInt8 = parseInt(binaryString, 2);
      
        return unsignedInt8 > 127 ? unsignedInt8 - 256 : unsignedInt8;
    }

    int4ToBitHex(x, y) {
        if (x < -8 || x > 7 || y < -8 || y > 7) {
          throw new RangeError("Input is out of range for int4.");
        }
      
        const unsigned_x = x < 0 ? 16 + x : x;
        const bin_x = unsigned_x.toString(2).padStart(4, '0');
        const unsigned_y = y < 0 ? 16 + y : y;
        const bin_y = unsigned_y.toString(2).padStart(4, '0');

        // NOTE: putting y first is an attempt to maintain consistency across int sizes
        const hexString = parseInt(bin_y, 2).toString(16).padStart(1, '0').toLowerCase() + parseInt(bin_x, 2).toString(16).padStart(1, '0').toLowerCase();
      
        return `0x${hexString}`;
    }
    bitHexToInt4(hex) {
    
        const hexString = hex.slice(2); // Remove '0x'
        const intVal = parseInt(hexString, 16);
    
        const bin_y = (intVal >> 4) & 0xF; // Extract high 4 bits
        const bin_x = intVal & 0xF; // Extract low 4 bits
    
        // Convert back to signed int4
        const y = bin_y >= 8 ? bin_y - 16 : bin_y;
        const x = bin_x >= 8 ? bin_x - 16 : bin_x;
        
        return [x, y];
    }
    
    int16ToBitHex(int16) {
        if (int16 < -32768 || int16 > 32767) {
          throw new RangeError("Input is out of range for int8.");
        }
      
        const unsigned = int16 < 0 ? 65536 + int16 : int16;
        const bin = unsigned.toString(2).padStart(16, '0');
        const hex = parseInt(bin, 2).toString(16).padStart(4, '0').toLowerCase();
      
        return `0x${hex}`;
    }
    BitHexToInt16(bitHex) {
        const hex = bitHex.slice(2);
        const bin = parseInt(hex, 16).toString(2).padStart(8, '0');
        const unsigned = parseInt(bin, 2);
      
        return unsigned > 32767 ? unsigned - 65536 : unsigned;
    }
}