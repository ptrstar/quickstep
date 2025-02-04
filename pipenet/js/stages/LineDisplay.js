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

        // FIXME: rewrite converted to compressed format

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
                    var dx = Quickstep.BitHexToInt8(instr_array[++i].trim());
                    var dy = Quickstep.BitHexToInt8(instr_array[++i].trim());
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
        var prog_suffix = "\n};"
        var instr_stream = Quickstep.convert(this.output);

        var count_bytes = (instr_stream.match(/0x/g) || []).length;
        this.setStatus(count_bytes + " bytes");

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
