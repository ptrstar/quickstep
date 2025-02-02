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

    offset(point) {
        this.buffer.forEach(p => p._add(point));
    }

    isEmpty() {
        return !this.buffer.length;
    }

}