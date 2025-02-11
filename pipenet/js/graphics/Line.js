class Line {
    constructor(penWidth = 0.7) {
        this.buffer = [];
        this.first;
        this.penWidth = penWidth;

    }

    push(point) {
        this.buffer.push(point);
        if (this.buffer.length == 1) {
            this.first = point;
        }
    }

    reverse() {
        var buffer = [];
        for (var i = this.buffer.length-1; i >= 0; i--) {
            buffer[this.buffer.length-1-i] = this.buffer[i];
        }
        this.buffer = buffer;
        this.first = this.buffer[0];
    }

    _offset(point) {
        this.buffer.forEach(p => p._add(point));
        return this;
    }

    isEmpty() {
        return !this.buffer.length;
    }

    transform(theta, center) {
        var line = new Line(this.penWidth);
        this.buffer.forEach(point => line.push(point.transform(theta, center)));
        return line;
    }

    getIntSize() {
        var count = 0;
        var sigma = 0;
        var prev = this.first.unpropscale(Unit.mm2xstep, Unit.mm2ystep);
        this.buffer.forEach(point => {
            if (point == prev) return;
            
            var stepped_target = point.unpropscale(Unit.mm2xstep, Unit.mm2ystep);
            var stepped_delta = prev.sub(stepped_target);
            sigma += Math.max(Math.abs(stepped_delta.x), Math.abs(stepped_delta.y));
            count++;

            prev = stepped_target;
        })
        var avg = sigma / count;
        
        // TODO: Find theoretical optimum for the following
        if (avg <= 8) {
            return 4;
        }
        if (avg <= 256) {
            return 8;
        }
        return 16;
    }
}