class LineDisplay extends StageNode {
    constructor() {
        super();

        this.inputType = "Line[]";
        this.outputType = "void*";

        this.finalscale = 1;
        this.auto_run_sim = true;

        //DEBUG ONLY
        var line = new Line();
        this.input = [line];
        for (var theta = 0; theta <= 2*Math.PI; theta += 2*Math.PI / 100) {
            line.push(new Point(Math.sin(theta) * 20 + 25, Math.cos(theta) * 20 + 25));
        }
    }

    compute() {

        this.output = this.input;

        this.preview();
        if (this.auto_run_sim) {
            this.gen_instr();
            this.sim(this.instr_stream);
        }
        this.setBusy(false);
    }
    preview() {

        var scalar = (Unit.mm2pix(Unit.mmSize.x) * this.finalscale) / Unit.bufferSize.x;

        this.canvas.width = Unit.mm2pix(Unit.mmSize.x) * this.finalscale;
        this.canvas.height = Unit.mm2pix(Unit.mmSize.y) * this.finalscale;
        this.canvas.style.width = `${this.canvas.width}px`;
        this.canvas.style.height = `${this.canvas.height}px`;

        this.ctx.fillStyle = "white";
        this.ctx.fillRect(0,0, this.canvas.width, this.canvas.height);

        this.output.forEach(line => {
            this.ctx.lineWidth = Unit.mm2pix(line.penWidth) * this.finalscale;
            this.ctx.beginPath();
            line.buffer.forEach(point => {
                this.ctx.lineTo(point.x * scalar * Unit.bufferScale, point.y * scalar * Unit.bufferScale);
            });
            this.ctx.stroke();
        });

        


    }

    sim(instr_str) {
        var instr_array = instr_str.trim().split(",");
        this.ctx.strokeStyle = "red";
        this.ctx.lineWidth = Unit.mm2pix(0.35) * this.finalscale;
        
        var pos = new Point(0,0);

        for (var i = 0; i < instr_array.length; i++) {

            const instr = instr_array[i].trim();

            switch(instr) {
                case "0x00":
                    this.ctx.stroke();
                    break;
                case "0x01":
                    this.ctx.beginPath();
                    this.ctx.moveTo(Unit.mm2pix(1/Unit.mm2xstep*(pos.x)), Unit.mm2pix(1/Unit.mm2ystep*(pos.y)));
                    break;
                case "0x02":
                    var dx = this.BitHexToInt8(instr_array[++i].trim());
                    var dy = this.BitHexToInt8(instr_array[++i].trim());
                    var x = Unit.mm2pix(1/Unit.mm2xstep*(pos.x + dx));
                    var y = Unit.mm2pix(1/Unit.mm2ystep*(pos.y + dy));
                    this.ctx.lineTo(x, y);
                    pos.x += dx;
                    pos.y += dy;
                    break;
                case "0x03":
                    break;
            }
        }
    }

    gen_instr() {
        var prog_prefix = "const uint8_t IM[] PROGMEM = {\n";
        var instr_stream = "";
        var prog_suffix = "\n};"

        var prev_step = new Point();

        this.output.forEach(line => {
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

            // var step = line.first.scale(mm2step).round();
            // var target = step.sub(prev_step);
            // instr_stream += this.moveTo(target);
            // prev_step = step;

            instr_stream += "0x00,\n";
        });

        instr_stream += this.moveTo(prev_step.scale(-1));
        instr_stream += "0x03";

        var count_bytes = (instr_stream.match(/0x/g) || []).length;
        this.setStatus(count_bytes + " bytes");

        this.instr_stream = instr_stream;
        this.prog = prog_prefix + instr_stream + prog_suffix;
    }

    export() {
        navigator.clipboard.writeText(this.prog);
        console.log("QUICKSTEP copied to clipboard");
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


    setBusy(state) {
        if (this.busy == false || (this.busy == true && state == false)) {
            this.busy = state;
            if (!this.busy) {this.flush()};
            return true;
        }
        return false;
    }
    getControlTemplate() {
        return `
            <button onclick="Net.handleEvent('${this.id}', 'export', event)">Export QUICKSTEP</button>
            <button onclick="Net.handleEvent('${this.id}', 'sim', event)">Toggle Sim Output</button>
        `;
    }
    handleEvent(type, event) {
        switch(type) {
            case "export":
                this.export();
                break;
            case "sim":
                this.auto_run_sim = !this.auto_run_sim;
                break;
        }
        this.run();
    }
}
