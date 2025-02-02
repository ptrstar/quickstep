class Point {
    constructor(x=0, y=0) {
        this.x = x;
        this.y = y;
    }

    scale(factor) {
        return new Point(this.x * factor, this.y * factor);
    }
    unpropscale(fx, fy) {
        return new Point(this.x * fx, this.y * fy);
    }
    
    sub(other) {
        return new Point(this.x - other.x, this.y - other.y);
    }
    add(other) {
        return new Point(this.x + other.x, this.y + other.y);
    }

    round() {
        return new Point(Math.round(this.x), Math.round(this.y));      
    }

    clone() {
        return new Point(this.x, this.y);
    }
}