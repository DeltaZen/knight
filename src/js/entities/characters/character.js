class Character extends Entity {
    constructor() {
        super();
        this.categories.push('character');

        this.facing = 1;

        this.health = 1;

        this.combo = 0;
        this.lastComboChange = 0;
        this.lastComboChangeReason = '';

        this.stamina = 1;
        this.lastStaminaLoss = 0;

        this.baseSpeed = 200;

        this.strikeRadiusX = 80;
        this.strikeRadiusY = 40;

        this.collisionRadius = 30;

        this.lastDamage = 0;

        this.dashStart = 0;
        this.dashEnd = 0;

        this.controller = null; // TODO remove

        this.controls = {
            'force': 0,
            'angle': 0,
            'shield': false,
            'attack': false,
            'aim': {'x': 0, 'y': 0},
            'dash': false,
        };

        this.stateMachine = characterStateMachine({
            entity: this, 
        });
    }

    getColor(color) {
        return this.age - this.lastDamage < 0.1 ? '#fff' : color;
    }

    cycle(elapsed) {
        super.cycle(elapsed);

        this.stateMachine.cycle(elapsed);

        this.controller.cycle(elapsed);

        if (this.inWater) {
            this.loseStamina(elapsed * 0.2);
        }

        const speed = this.stateMachine.state.speedRatio * this.baseSpeed;
        const dashing = this.dashEnd > this.age;
        
        this.x += cos(this.controls.angle) * this.controls.force * speed * elapsed;
        this.y += sin(this.controls.angle) * this.controls.force * speed * elapsed;

        this.facing = sign(this.controls.aim.x - this.x) || 1;

        // Collisions with other characters
        for (const character of this.scene.category('character')) {
            if (character === this) continue;
            if (dist(this, character) > this.collisionRadius) continue;
            const angle = angleBetween(this, character);
            this.x = character.x - cos(angle) * this.collisionRadius;
            this.y = character.y - sin(angle) * this.collisionRadius;
        }

        // Stamina regen
        if (this.age - this.lastStaminaLoss > 2) {
            this.stamina = min(1, this.stamina + elapsed * 0.3);
        }

        // Combo reset
        if (this.age - this.lastComboChange > 5) {
            this.updateCombo(-99999, '');
        }

        // Dash
        if (this.controls.dash) {
            if (!this.waitingForDashRelease && !dashing) {
                this.dash();
            }
        } else {
            this.waitingForDashRelease = false;
        }

        if (dashing) {
            for (let i = 0 ; i < 3 ; i++) {
                const x = this.x + rnd(-5, 5);
                const y = this.y + rnd(-5, 5);
    
                this.scene.add(new Particle(
                    '#eee',
                    [5, 10],
                    [x, x + rnd(-20, 20)],
                    [y, y + rnd(-20, 20)],
                    rnd(0.5, 1),
                ));
            }
        }
    }

    updateCombo(value, reason) {
        this.combo = max(0, this.combo + value);
        this.lastComboChange = this.age;
        this.lastComboChangeReason = reason.toUpperCase();
    }

    isStrikable(character) {
        if (character === this) return false;

        const angle = angleBetween(this, character);
        const aimAngle = angleBetween(this, this.controls.aim);
        if (abs(normalize(aimAngle - angle)) > PI / 2) {
            return false;
        }

        return this.isWithinRadii(character, this.strikeRadiusX, this.strikeRadiusY);
    }

    isWithinRadii(character, radiusX, radiusY) {
        return abs(character.x - this.x) < radiusX && 
            abs(character.y - this.y) < radiusY;
    }

    strike(damage) {
        const angle = angleBetween(this, this.controls.aim);
        const distance = 5;

        this.x += cos(angle) * distance;
        this.y += sin(angle) * distance;

        this.loseStamina(0.1);

        const victim = Array
            .from(this.scene.category(this.targetTeam))
            .filter(character => character !== this && this.isStrikable(character))
            .reduce((acc, other) => !acc || dist(this, other) < dist(this, acc) ? other : acc, null);

        if (victim) {
            const angle = atan2(victim.y - this.y, victim.x - this.x);
            if (victim.stateMachine.state.shielded) {
                victim.facing = sign(this.x - victim.x) || 1;

                this.x -= cos(angle) * damage * 10;
                this.y -= sin(angle) * damage * 10;

                if (victim.stateMachine.state.perfectParry) {
                    // Perfect parry, victim gets stamina back, we lose ours
                    victim.stamina = 1;
                    victim.updateCombo(1, nomangle('Perfect Parry!'));
                    victim.displayLabel(nomangle('Perfect Parry!'));
                    this.loseStamina(1);

                    const animation = new PerfectParry();
                    animation.x = victim.x;
                    animation.y = victim.y - 30;
                    this.scene.add(animation);

                    for (const parryVictim of this.scene.category(victim.targetTeam)) {
                        if (victim.isWithinRadii(parryVictim, victim.strikeRadiusX, victim.strikeRadiusY)) {
                            const angle = atan2(parryVictim.y - victim.y, parryVictim.x - victim.x);

                            this.scene.add(new Interpolator(parryVictim, 'x', parryVictim.x, parryVictim.x + cos(angle) * 100, 0.2));
                            this.scene.add(new Interpolator(parryVictim, 'y', parryVictim.y, parryVictim.y + sin(angle) * 100, 0.2));

                            parryVictim.loseStamina(1);
                        }
                    }
                } else {
                    // Regular parry, victim loses stamina
                    victim.loseStamina(0.3);

                    // victim.updateCombo(1, nomangle('Parry'));
                    victim.displayLabel(nomangle('Parry'));
                
                    const animation = new ShieldBlock();
                    animation.x = victim.x;
                    animation.y = victim.y - 30;
                    this.scene.add(animation);
                }
            } else {
                victim.damage(damage);

                victim.x += cos(angle) * damage * 25;
                victim.y += sin(angle) * damage * 25;

                this.updateCombo(1, nomangle('Hit'));

                victim.displayLabel('-' + ~~(damage * 100));

                const impactX = victim.x + rnd(-20, 20);
                const impactY = victim.y - 30 + rnd(-20, 20);
                const size = rnd(1, 2);

                for (let i = 0 ; i < 20 ; i++) {
                    this.scene.add(new Particle(
                        '#900',
                        [size, size + rnd(3, 6)],
                        [impactX, impactX + rnd(-30, 30)],
                        [impactY, impactY + rnd(-30, 30)],
                        rnd(0.2, 0.4),
                    ));
                }
            }
        }
    }

    displayLabel(text) {
        if (this.lastLabel) this.lastLabel.remove();

        this.lastLabel = new Label(text);
        this.lastLabel.x = this.x;
        this.lastLabel.y = this.y - 90;
        this.scene.add(this.lastLabel);
    }

    loseStamina(amount) {
        this.stamina = max(0, this.stamina - amount);
        this.lastStaminaLoss = this.age;
    }

    damage(amount) {
        this.health = max(0, this.health - amount);
        this.lastDamage = this.age;

        this.loseStamina(amount * 0.3);
        this.updateCombo(-99999, nomangle('Ouch!'));

        // Death
        if (this.health <= 0) this.die();
    }

    get renderAge() {
        return this.age * (this.inWater ? 0.5 : 1);
    }

    render() {
        super.render();

        const { inWater, renderAge } = this;

        ctx.translate(this.x, this.y);

        ctx.resolveColor = x => this.getColor(x);

        ctx.withShadow(() => {
            if (inWater) {
                ctx.beginPath();
                ctx.rect(-100, -100, 200, 100);
                ctx.clip();

                ctx.translate(0, 10);
            }

            ctx.scale(this.facing, 1);

            for (const step of this.renderSteps) {
                ctx.wrap(() => step(renderAge));
            }
        });

        if (DEBUG) {
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '12pt Courier';
            // ctx.fillText(this.stateMachine.state.constructor.name, 0, 20);
        }

        // if (DEBUG) {
        //     ctx.lineWidth = 1;
        //     ctx.strokeStyle = '#f00';
        //     ctx.beginPath();
        //     ctx.ellipse(0, 0, this.strikeRadiusX, this.strikeRadiusY, 0, 0, TWO_PI);
        //     ctx.stroke();
        // }
    }

    dash() {
        if (this.stateMachine.state.exhausted) return;
        
        const duration = 0.2;
        const { angle } = this.controls;
        this.scene.add(new Interpolator(this, 'x', this.x, this.x + cos(angle) * 150, duration));
        this.scene.add(new Interpolator(this, 'y', this.y, this.y + sin(angle) * 150, duration));

        this.waitingForDashRelease = true;
        this.dashStart = this.age;
        this.dashEnd = this.age + duration;

        this.loseStamina(0.2);
    }

    die() {
        function easeOutQuint(x) {
            return 1 - Math.pow(1 - x, 5);
        }

        const duration = 1;

        for (const step of this.gibs) {
            const bit = new Corpse(step);
            bit.x = this.x;
            bit.y = this.y;
            this.scene.add(bit);
    
            const angle = angleBetween(this, this.controls.aim) + PI + rnd(-1, 1) * PI / 4;
            const distance = rnd(30, 60);
            this.scene.add(new Interpolator(bit, 'x', bit.x, bit.x + cos(angle) * distance, duration, easeOutQuint));
            this.scene.add(new Interpolator(bit, 'y', bit.y, bit.y + sin(angle) * distance, duration, easeOutQuint));
            this.scene.add(new Interpolator(bit, 'rotation', 0, pick([-1, 1]) * rnd(PI / 4, PI), duration, easeOutQuint));
        }

        for (let i = 0 ; i < 50 ; i++) {
            const angle = random() * TWO_PI;
            const dist = random() * 40;

            const x = this.x + cos(angle) * dist;
            const y = this.y - 30 + sin(angle) * dist;

            this.scene.add(new Particle(
                '#fff',
                [5, 10],
                [x, x + rnd(-20, 20)],
                [y, y + rnd(-20, 20)],
                rnd(0.5, 1),
            ));
        }

        this.remove();
    }
}
