class Point {
    constructor(x=0, y=0) {
        this.x = x;
        this.y = y;
    }

    distance(other) {
        return Math.sqrt((this.x - other.x) ** 2 + (this.y - other.y) ** 2);
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
    _add(other) {
        this.x += other.x;
        this.y += other.y;
    }
    area(a, b) {
        return 0.5 * Math.abs((a.x - this.x)*(b.y - this.y) - (b.x - this.x)*(a.y - this.y));
    }

    round() {
        return new Point(Math.round(this.x), Math.round(this.y));      
    }

    clone() {
        return new Point(this.x, this.y);
    }

    transform(theta, center) {
        return new Point(((this.x - center.x) * Math.cos(theta) + (this.y - center.y) * -Math.sin(theta)) + center.x, ((this.x - center.x) * Math.sin(theta) + (this.y - center.y) * Math.cos(theta)) + center.y)
    }
}