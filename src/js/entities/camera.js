class Camera extends Entity {
    constructor() {
        super();
        this.categories.push('camera');
        this.zoom = 1;
    }

    cycle(elapsed) {
        super.cycle(elapsed);

        for (const player of this.scene.category('player')) {
            const distance = dist(this, player);
            const angle = angleBetween(this, player);
            const appliedDist = min(distance, distance * elapsed * 3);
            this.x += appliedDist * cos(angle);
            this.y += appliedDist * sin(angle);
        }
    }
}
