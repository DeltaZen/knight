class Character extends Entity {
    constructor() {
        super();
        this.categories.push('character');

        this.renderPadding = 90;

        this.facing = 1;

        this.health = this.maxHealth = 100;

        this.combo = 0;

        this.stamina = 1;

        this.lastDamage = this.lastStaminaLoss = this.lastComboChange = -9;

        this.baseSpeed = 200;

        this.strikeRadiusX = 80;
        this.strikeRadiusY = 40;

        this.magnetRadiusX = this.magnetRadiusY = 0;

        this.collisionRadius = 30;

        this.strength = 100;
        this.damageCount = this.parryCount = 0;

        this.setController(this.ai);

        this.gibs = [];

        this.controls = {
            'force': 0,
            'angle': 0,
            // 'shield': false,
            // 'attack': false,
            'aim': {'x': 0, 'y': 0},
            // 'dash': false,
        };

        this.stateMachine = characterStateMachine({
            entity: this, 
        });
    }

    setController(controller) {
        (this.controller = controller).start(this);
    }

    get ai() {
        return new AI();
    }

    getColor(color) {
        return this.age - this.lastDamage < 0.1 ? '#fff' : color;
    }

    cycle(elapsed) {
        super.cycle(elapsed);

        this.renderAge = this.age * (this.inWater ? 0.5 : 1)

        this.stateMachine.cycle(elapsed);

        this.controller.cycle(elapsed);

        if (this.inWater && this.controls.force) {
            this.loseStamina(elapsed * 0.2);
        }

        const speed = this.stateMachine.state.speedRatio * this.baseSpeed;
        
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
        if (this.age - this.lastStaminaLoss > 5 || this.stateMachine.state.exhausted) {
            this.stamina = min(1, this.stamina + elapsed * 0.3);
        }

        // Combo reset
        if (this.age - this.lastComboChange > 5) {
            this.updateCombo(-99999, '');
        }
    }

    updateCombo(value) {
        this.combo = max(0, this.combo + value);
        this.lastComboChange = this.age;
    }

    isStrikable(character, radiusX, radiusY) {
        if (character === this) return false;

        const angle = angleBetween(this, character);
        const aimAngle = angleBetween(this, this.controls.aim);
        if (abs(normalize(aimAngle - angle)) > PI / 2) {
            return false;
        }

        return this.isWithinRadii(character, radiusX, radiusY);
    }

    isWithinRadii(character, radiusX, radiusY) {
        return abs(character.x - this.x) < radiusX && 
            abs(character.y - this.y) < radiusY;
    }

    strikability(victim, radiusX, radiusY, fov) {
        if (victim === this || !radiusX || !radiusY) return 0;

        const angleToVictim = angleBetween(this, victim);
        const aimAngle = angleBetween(this, this.controls.aim);
        const angleScore = 1 - abs(normalize(angleToVictim - aimAngle)) / (fov / 2);

        const dX = abs(this.x - victim.x);
        const adjustedDY = abs(this.y - victim.y) / (radiusY / radiusX);

        const adjustedDistance = hypot(dX, adjustedDY);
        const distanceScore = 1 - adjustedDistance / radiusX;

        return distanceScore < 0 || angleScore < 0 
            ? 0
            : (distanceScore + angleScore) / 2;
    }

    pickVictim(radiusX, radiusY, fov) {
        return Array
            .from(this.scene.category(this.targetTeam))
            .reduce((acc, other) => {
                const strikabilityOther = this.strikability(other, radiusX, radiusX, fov);
                if (strikabilityOther <= 0) return acc;
                if (!acc) return other;

                return strikabilityOther > this.strikability(acc, radiusX, radiusY, fov) 
                    ? other 
                    : acc;
            }, null);
    }

    lunge() {
        const victim = this.pickVictim(this.magnetRadiusX, this.magnetRadiusY, PI / 2);
        return victim
            ? this.dash(
                angleBetween(this, victim), 
                max(0, dist(this, victim) - this.strikeRadiusX / 2), 
                0.1,
            )
            : this.dash(
                angleBetween(this, this.controls.aim), 
                40, 
                0.1,
            );
    }

    strike(relativeStrength) {
        sound(...[.1,,400,.1,.01,,3,.92,17,,,,,2,,,,1.04]);

        const victim = this.pickVictim(this.strikeRadiusX, this.strikeRadiusY, PI);
        if (victim) {
            const angle = angleBetween(this, victim);
            if (victim.stateMachine.state.shielded) {
                victim.facing = sign(this.x - victim.x) || 1;
                victim.parryCount++;

                // Push back
                this.dash(angle + PI, 20, 0.1);

                if (victim.stateMachine.state.perfectParry) {
                    // Perfect parry, victim gets stamina back, we lose ours
                    victim.stamina = 1;
                    victim.updateCombo(1);
                    victim.displayLabel(nomangle('Perfect Block!'));

                    const animation = this.scene.add(new PerfectParry());
                    animation.x = victim.x;
                    animation.y = victim.y - 30;

                    for (const parryVictim of this.scene.category(victim.targetTeam)) {
                        if (victim.isWithinRadii(parryVictim, victim.strikeRadiusX, victim.strikeRadiusY)) {
                            parryVictim.dash(angleBetween(victim, parryVictim), 100, 0.2);
                        }
                    }

                    (async () => {
                        this.scene.speedRatio = 0.1;

                        const camera = firstItem(this.scene.category('camera'));
                        await camera.zoomTo(2);
                        await this.scene.delay(3 * this.scene.speedRatio);
                        await camera.zoomTo(1);
                        this.scene.speedRatio = 1;
                    })();

                    sound(...[2.14,,1e3,.01,.2,.31,3,3.99,,.9,,,.08,1.9,,,.22,.34,.12]);
                } else {
                    // Regular parry, victim loses stamina
                    victim.loseStamina(relativeStrength * 0.2);
                    victim.displayLabel(nomangle('Blocked!'));
                
                    const animation = this.scene.add(new ShieldBlock());
                    animation.x = victim.x;
                    animation.y = victim.y - 30;

                    sound(...[2.03,,200,,.04,.12,1,1.98,,,,,,-2.4,,,.1,.59,.05,.17]);
                }
            } else {
                victim.damage(this.strength * relativeStrength);
                victim.dash(angle, this.strength * relativeStrength, 0.1);

                this.updateCombo(1);

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

    displayLabel(text, color) {
        if (this.lastLabel) this.lastLabel.remove();

        this.lastLabel = new Label(text, color);
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
        this.damageCount++;

        if (!this.stateMachine.state.exhausted) this.loseStamina(amount / this.maxHealth * 0.3);
        this.updateCombo(-99999, nomangle('Ouch!'));
        this.displayLabel('-' + amount, this.damageLabelColor);

        // Death
        if (this.health <= 0) this.die();
    }

    doRender() {
        const { inWater, renderAge } = this;

        ctx.translate(this.x, this.y);

        if (DEBUG && DEBUG_CHARACTER_RADII) {
            ctx.wrap(() => {
                ctx.lineWidth = 10;
                ctx.strokeStyle = '#f00';
                ctx.globalAlpha = 0.1;
                ctx.beginPath();
                ctx.ellipse(0, 0, this.strikeRadiusX, this.strikeRadiusY, 0, 0, TWO_PI);
                ctx.stroke();

                ctx.beginPath();
                ctx.ellipse(0, 0, this.magnetRadiusX, this.magnetRadiusY, 0, 0, TWO_PI);
                ctx.stroke();
            });
        }

        const orig = ctx.resolveColor || (x => x);
        ctx.resolveColor = x => this.getColor(orig(x));

        ctx.withShadow(() => {
            if (inWater) {
                ctx.beginPath();
                ctx.rect(-100, -100, 200, 100);
                ctx.clip();

                ctx.translate(0, 10);
            }

            let { facing } = this;
            const { dashAngle } = this.stateMachine.state;
            if (dashAngle !== undefined) {
                facing = sign(cos(dashAngle));
    
                ctx.translate(0, -30);
                ctx.rotate(this.stateMachine.state.age / PLAYER_DASH_DURATION * facing * TWO_PI);
                ctx.translate(0, 30);
            }

            ctx.scale(facing, 1);

            ctx.wrap(() => this.renderBody(renderAge));
        });

        if (DEBUG) {
            ctx.fillStyle = '#fff';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.textAlign = nomangle('center');
            ctx.textBaseline = nomangle('middle');
            ctx.font = nomangle('12pt Courier');

            const bits = [];
            if (DEBUG_CHARACTER_STATE) {
                bits.push(...[
                    nomangle('State: ') + this.stateMachine.state.constructor.name,
                    nomangle('HP: ') + ~~this.health + '/' + this.maxHealth,
                ]);
            }
            
            if (DEBUG_CHARACTER_AI) {
                bits.push(...[
                    nomangle('AI: ') + this.controller.description,
                ]);
            }
            
            if (DEBUG_CHARACTER_STATS) {
                bits.push(...[
                    nomangle('Speed: ') + this.baseSpeed,
                    nomangle('Strength: ') + this.strength,
                    nomangle('Aggro: ') + this.aggression,
                ]);
            }
        
            let y = -90;
            for (const text of bits.reverse()) {
                ctx.strokeText(text, 0, y);
                ctx.fillText(text, 0, y);

                y -= 20;
            }
        }
    }

    dash(angle, distance, duration) {
        const target = {
            x: this.x + cos(angle) * distance, 
            y: this.y + sin(angle) * distance, 
        };
        this.scene.add(new Interpolator(this, 'x', this.x, target.x, duration));
        this.scene.add(new Interpolator(this, 'y', this.y, target.y, duration));
        return target;
    }

    die() {
        const duration = 1;

        const gibs = this.gibs.concat(
            () => {
                ctx.slice(30, true, 0.5);
                ctx.translate(0, 30);
                this.renderBody();
            },
            () => {
                ctx.slice(30, false, 0.5);
                ctx.translate(0, 30);
                this.renderBody();
            },
        );

        for (const step of gibs) {
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

        this.poof();

        this.displayLabel(nomangle('Slain!'), this.damageLabelColor);

        this.remove();

        sound(...[2.1,,400,.03,.1,.4,4,4.9,.6,.3,,,.13,1.9,,.1,.08,.32]);
    }

    poof() {
        for (let i = 0 ; i < 80 ; i++) {
            const angle = random() * TWO_PI;
            const dist = random() * 40;

            const x = this.x + cos(angle) * dist;
            const y = this.y - 30 + sin(angle) * dist;

            this.scene.add(new Particle(
                '#fff',
                [10, 20],
                [x, x + rnd(-20, 20)],
                [y, y + rnd(-20, 20)],
                rnd(0.5, 1),
            ));
        }
    }
}
