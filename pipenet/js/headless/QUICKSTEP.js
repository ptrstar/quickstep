class QUICKSTEP {
    constructor() {}

    convert(buffer) {

        // FIXME: rewrite converted to compressed format

        var prev_step = new Point();

        buffer.forEach(line => {
            if (line.isEmpty()) return;

            var step = line.first.unpropscale(Unit.mm2xstep, Unit.mm2ystep).round();
            var target = step.sub(prev_step);
            instr_stream += this.moveTo(target);
            prev_step = step;
            instr_stream += "0x01,";

            line.buffer.forEach(point => {

                var step = point.unpropscale(Unit.mm2xstep, Unit.mm2ystep).round();
                var target = step.sub(prev_step);
                instr_stream += this.moveTo(target);
                prev_step = step;
                
            });

            instr_stream += "0x00,\n";
        });

        instr_stream += this.moveTo(prev_step.scale(-1));
        instr_stream += "0x03";
    }


    moveTo(pt) {

        if (pt.round().x != pt.x || pt.round().y != pt.y) {
            throw new TypeError("point was unrounded", pt);
        }

        var point = pt.clone();

        var str = "";

        while (point.x != 0 || point.y != 0) {

            const required_instr = Math.max(Math.abs(point.x), Math.abs(point.y)) / (127);
            const instr_count = Math.ceil(required_instr);

            const dx = Math.floor(point.x / instr_count);
            const dy = Math.floor(point.y / instr_count);

            str += "0x02," + this.int8ToBitHex(dx) + "," + this.int8ToBitHex(dy) + ",";

            point.x -= dx;
            point.y -= dy;
        }

        return str;
    }

    int8ToBitHex(int8) {
        if (int8 < -128 || int8 > 127) {
          throw new RangeError("Input is out of range for int8.");
        }
      
        const unsignedInt8 = int8 < 0 ? 256 + int8 : int8;
        const binaryString = unsignedInt8.toString(2).padStart(8, '0');
        const hexString = parseInt(binaryString, 2).toString(16).padStart(2, '0').toUpperCase();
      
        return `0x${hexString}`;
    }

    BitHexToInt8(bitHex) {
        const hexString = bitHex.slice(2);
        const binaryString = parseInt(hexString, 16).toString(2).padStart(8, '0');
        const unsignedInt8 = parseInt(binaryString, 2);
      
        return unsignedInt8 > 127 ? unsignedInt8 - 256 : unsignedInt8;
    }
}