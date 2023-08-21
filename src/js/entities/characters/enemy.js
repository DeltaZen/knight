toRatio = (...valuesAndWeights) => {
    let totalWeight = 0;
    let weight = 0;
    for (let i = 0 ; i < valuesAndWeights.length ; i++) {
        weight += !!valuesAndWeights[i++];
        totalWeight += valuesAndWeights[i];
    }
    return weight / totalWeight;
}

createEnemyType = ({
    stick, sword, axe,
    shield, armor, superArmor,
    attackCount,
}) => {
    class EnemyType extends Character {
        constructor() {
            super();
            this.categories.push('enemy');
            this.targetTeam = 'player';

            this.aggression = 1;
            if (sword) this.aggression += 1;
            if (axe) this.aggression += 2;

            let weight = 0;
            if (armor) weight += 0.2;
            if (superArmor) weight += 0.3;
            if (axe) weight += 0.1;
            if (sword) weight += 0.3;
            if (shield) weight += 0.3;

            let protection = 0;
            if (shield) protection += 0.3;
            if (armor) protection += 0.5;
            if (superArmor) protection += 0.7;

            this.health = this.maxHealth = ~~interpolate(100, 400, protection);
            this.strength = axe ? 40 : (sword ? 30 : 10);
            this.baseSpeed = interpolate(120, 50, weight);
    
            if (stick) this.gibs.push(() => ctx.renderStick());
            if (sword) this.gibs.push(() => ctx.renderSword());
            if (shield) this.gibs.push(() => ctx.renderShield());
            if (axe) this.gibs.push(() => ctx.renderAxe());
    
            this.stateMachine = characterStateMachine({
                entity: this, 
                chargeTime: 0.5,
                staggerTime: (1 - protection) * 0.3,
            });
        }

        get ai() {
            return new EnemyTypeAI(this);
        }

        remove() {
            super.remove();

            // Cancel any remaining aggression
            firstItem(this.scene.category('aggressivity-tracker'))
                .cancelAggression(this);
        }
    
        renderBody() {
            ctx.renderAttackIndicator(this);
            ctx.renderLegs(this, COLOR_LEGS);
            ctx.renderArm(this, armor || superArmor ? COLOR_LEGS : COLOR_SKIN, () => {
                if (stick) ctx.renderStick(this)
                if (sword) ctx.renderSword(this);
                if (axe) ctx.renderAxe(this);
            });
            ctx.renderChest(
                this, 
                armor 
                    ? COLOR_ARMOR 
                    : (superArmor ? '#444' : COLOR_SKIN), 
                CHEST_WIDTH_NAKED,
            );

            ctx.renderHead(
                this, 
                superArmor ? '#666' : COLOR_SKIN, 
                superArmor ? '#000' : COLOR_SKIN,
            );

            if (shield) ctx.renderArmAndShield(this, armor || superArmor ? COLOR_LEGS : COLOR_SKIN);
            ctx.renderExhaustion(this, -70);
            ctx.renderExclamation(this);
        }
    }

    class EnemyTypeAI extends EnemyAI {
        async doStart() {
            while (true) {
                // Try to be near the player
                await this.startAI(new ReachPlayer(300, 300));
                
                // Wait for our turn to attack
                try {
                    await this.race([
                        new Timeout(3),
                        new BecomeAggressive(),
                    ]);
                } catch (e) {
                    // We failed to become aggressive, start a new loop
                    continue;
                }

                await this.startAI(new BecomeAggressive());

                // Okay we're allowed to be aggro, let's do it!
                try {
                    await this.race([
                        new Timeout(3),
                        new ReachPlayer(this.entity.strikeRadiusX, this.entity.strikeRadiusY),
                    ]);

                    for (let i = attackCount ; i-- ; ) {
                        await this.startAI(new Attack(0.5));
                    }
                    await this.startAI(new Wait(0.5));
                } catch (e) {}

                // We're done attacking, let's allow someone else to be aggro
                await this.startAI(new BecomePassive());

                // Retreat a bit so we're not too close to the player
                await this.race([
                    new RetreatAI(200, 200),
                    new Wait(2),
                    shield ? new HoldShield() : new AI(),
                ]);
                await this.startAI(new Wait(1));

                // Rinse and repeat
            }
        }
    }

    return EnemyType;
};

const shield = { shield: true };
const sword = { sword: true, attackCount: 2 };
const stick = { stick: true, attackCount: 3 };
const axe = { axe: true, attackCount: 1 };
const armor = { armor: true };
const superArmor = { superArmor: true };

const StickEnemy = createEnemyType({ ...stick, });
const AxeEnemy = createEnemyType({ ...axe, });
const SwordEnemy = createEnemyType({ ...sword, });
const AxeShieldArmorEnemy = createEnemyType({ ...axe, ...shield, ...armor, });
const SwordArmorEnemy = createEnemyType({ ...sword, ...armor, });
const SwordShieldArmorEnemy = createEnemyType({ ...sword, ...shield, ...armor, });
const SwordShieldTankEnemy = createEnemyType({ ...sword,  ...shield, ...superArmor, });
const AxeShieldTankEnemy = createEnemyType({ ...axe,  ...shield, ...superArmor, });

const ENEMY_TYPES = [
    AxeShieldTankEnemy,
    AxeShieldArmorEnemy,
    StickEnemy,
    AxeEnemy,
    SwordEnemy,
    SwordArmorEnemy,
    SwordShieldArmorEnemy,
    SwordShieldTankEnemy,
];
