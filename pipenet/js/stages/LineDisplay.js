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
        for (var theta = 0; theta <= 2*Math.PI; theta += 2*Math.PI / 30) {
            line.push(new Point(Math.sin(theta) * 30 + 40, Math.cos(theta) * 30 + 40));
        }
        // line.push(new Point(10, 10));
        // line.push(new Point(10, 11));

        // line = new Line();
        // line.push(new Point(10, 10));
        // line.push(new Point(18, 10));
        // this.input.push(line);

        // line = new Line();
        // line.push(new Point(10, 10));
        // line.push(new Point(200, 200));
        // this.input.push(line);

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

        var IM = instr_str.replace(/0x|,|\s/g, "");

        var IM_bits = Quickstep.hexToBits(IM);

        var printhead_down = false;
        var instr_buffer = "";
        var instr_buffer_index = 0;
        var data_size = 8;
        var IP = 0;

        this.ctx.strokeStyle = "red";
        this.ctx.lineWidth = Unit.mm2pix(0.35) * this.finalscale;
        
        var pos = new Point(0,0);

        while(true) {
            if (instr_buffer_index == 0) {
                instr_buffer_index = 4;
                instr_buffer = IM_bits.slice(IP, IP + 8);
                IP += 8;
            }
            var instr = instr_buffer.slice(instr_buffer_index * 2 - 2, instr_buffer_index * 2);
            instr_buffer_index--;

            switch(instr) {
                case "00":
                    if (printhead_down) {
                        this.ctx.stroke();
                    } else {
                        this.ctx.beginPath();
                        this.ctx.moveTo(Unit.mm2pix(1/Unit.mm2xstep*(pos.x)), Unit.mm2pix(1/Unit.mm2ystep*(pos.y)));
                    }
                    printhead_down = !printhead_down;
                    break;
                case "01":
                    if (instr_buffer_index == 0) {
                        instr_buffer_index = 4;
                        instr_buffer = IM_bits.slice(IP, IP + 8);
                        IP += 8;
                    }
                    var amt = instr_buffer.slice(instr_buffer_index * 2 - 2, instr_buffer_index * 2);
                    instr_buffer_index -= 2;
                    switch (amt) {
                        case "00":
                            data_size = 4;
                        case "01":
                            data_size = 8;
                        case "10":
                            data_size = 16;
                            break;
                    }
                    break;
                case "10":
                    var dx, dy;
                    switch (data_size) {
                        case 4:
                            [dx, dy] = Quickstep.BitHexToInt4("0x"+Quickstep.bitsToHex(IM_bits.slice(IP, IP+8)));
                            IP += 8;
                            break;
                        case 8:
                            dx = Quickstep.BitHexToInt8("0x"+Quickstep.bitsToHex(IM_bits.slice(IP, IP+8)));
                            dy = Quickstep.BitHexToInt8("0x"+Quickstep.bitsToHex(IM_bits.slice(IP+8, IP+16)));
                            IP += 16;
                            break;
                        case 16:
                            dx = Quickstep.BitHexToInt8("0x"+Quickstep.bitsToHex(IM_bits.slice(IP, IP+16)));
                            dy = Quickstep.BitHexToInt8("0x"+Quickstep.bitsToHex(IM_bits.slice(IP+16, IP+32)));
                            IP += 32;
                            break;
                    }
                    var x = Unit.mm2pix(1/Unit.mm2xstep*(pos.x + dx));
                    var y = Unit.mm2pix(1/Unit.mm2ystep*(pos.y + dy));
                    this.ctx.lineTo(x, y);
                    pos.x += dx;
                    pos.y += dy;
                    break;
                case "11":
                    return;
            }
        }
    }

    gen_instr() {
        var prog_prefix = "const uint8_t IM[] PROGMEM = {\n";
        var prog_suffix = "\n};"
        var instr_stream = Quickstep.convert(this.output);

        const countBytes = (str) => str.replace(/0x|,|\s/g, "").length / 2;

        var bytes = countBytes(instr_stream);
        this.setStatus(bytes + " bytes");

        this.instr_stream = instr_stream;
        this.prog = prog_prefix + instr_stream + prog_suffix;
    }

    export() {
        navigator.clipboard.writeText(this.prog);
        console.log("QUICKSTEP copied to clipboard");
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
