class GameplayLevel extends Level {
    constructor(waveIndex = 0) {
        super();

        const { scene } = this;

        const player = firstItem(scene.category('player'));
        const camera = firstItem(scene.category('camera'));

        const playerHUD = scene.add(new PlayerHUD(player));
        scene.add(new Path());

        for (let i = 0 ; i < 15 ; i++) {
            const tree = new Tree();
            tree.x = rnd(-1, 1) * CANVAS_WIDTH / 2;
            tree.y = rnd(-1, 1) * CANVAS_HEIGHT / 2;
            scene.add(tree);
        }

        for (let i = 0 ; i < 20 ; i++) {
            const water = new Water();
            water.width = rnd(100, 200);
            water.height = rnd(200, 400);
            water.rotation = random() * TWO_PI;
            water.x = random() * CANVAS_WIDTH * 5;
            water.y = random() * CANVAS_HEIGHT * 5;
            scene.add(water);
        }

        // Respawn when far from the path
        (async () => {
            while (true) {
                await scene.waitFor(() => abs(player.y - scene.pathCurve(player.x)) > 800);

                const fade = scene.add(new Fade());
                await scene.add(new Interpolator(fade, 'alpha', 0, 1, 2)).await();
                player.y = scene.pathCurve(player.x);
                camera.cycle(999);
                await scene.add(new Interpolator(fade, 'alpha', 1, 0, 2)).await();
                fade.remove();
            }
        })();

        async function slowMo() {
            player.affectedBySpeedRatio = true;
            scene.speedRatio = 0.1;
            scene.add(new Interpolator(camera, 'zoom', camera.zoom, 3, 3));
            await scene.delay(3 * scene.speedRatio);
            await scene.add(new Interpolator(camera, 'zoom', camera.zoom, 1, 0.2)).await();
            scene.speedRatio = 1;
            player.affectedBySpeedRatio = false;
        }

        function spawnWave(enemyCount, enemyTypes) {
            return Array.apply(null, Array(enemyCount)).map(() => {
                const enemy = scene.add(new (pick(enemyTypes))());
                enemy.x = player.x + rnd(-CANVAS_WIDTH / 2, CANVAS_WIDTH / 2);
                enemy.y = player.y + pick([-1, 1]) * (evaluate(CANVAS_HEIGHT / 2) + rnd(50, 100));
                scene.add(new CharacterHUD(enemy));
                return enemy
            });
        }

        // Scenario
        (async () => {
            const fade = scene.add(new Fade());
            await scene.add(new Interpolator(fade, 'alpha', 1, 0, 2)).await();

            scene.add(new Announcement(nomangle('The Path')));
            await scene.delay(2);

            let nextWaveX = player.x + CANVAS_WIDTH;
            for ( ; waveIndex < 13 ; waveIndex++) {
                // Show progress
                (async () => {
                    await scene.delay(1);
                    await scene.add(new Interpolator(playerHUD, 'progressAlpha', 0, 1, 1)).await();
                    await scene.add(new Interpolator(playerHUD, 'progress', playerHUD.progress, waveIndex / 13, 1)).await();
                    await scene.delay(3);
                    await scene.add(new Interpolator(playerHUD, 'progressAlpha', 1, 0, 1)).await();
                })();

                await scene.waitFor(() => player.x >= nextWaveX);

                this.scene.add(new Announcement(nomangle('Wave ') + (waveIndex + 1)));

                const waveEnemies = spawnWave(
                    ~~(3 + waveIndex * 0.5),
                    WAVE_SETTINGS[min(WAVE_SETTINGS.length - 1, waveIndex)],
                );

                // Wait until all enemies are defeated
                await Promise.all(waveEnemies.map(enemy => scene.waitFor(() => enemy.health <= 0)));
                slowMo();

                this.scene.add(new Announcement(nomangle('Wave Cleared')));
                
                // Regen a bit of health
                scene.add(new Interpolator(
                    player, 
                    'health', 
                    player.health, 
                    min(player.maxHealth, player.health + 0.5), 
                    1,
                ));

                nextWaveX = player.x + CANVAS_WIDTH;
            }

            // Last wave, reach the king
            await scene.waitFor(() => player.x >= nextWaveX);
            const king = scene.add(new KingEnemy());
            king.x = camera.x + CANVAS_WIDTH + 50;
            king.y = scene.pathCurve(king.x);
            scene.add(new CharacterHUD(king));

            await scene.waitFor(() => king.x - player.x < 400);
            await scene.add(new Interpolator(fade, 'alpha', 0, 1, 2 * scene.speedRatio)).await();

            // Make sure the player is near the king
            player.x = king.x - 400;
            player.y = scene.pathCurve(player.x);

            const expo = scene.add(new Exposition([
                nomangle('At last, he faced the emperor.'),
            ]));

            await scene.delay(3);
            await scene.add(new Interpolator(expo, 'alpha', 1, 0, 2)).await();
            await scene.add(new Interpolator(fade, 'alpha', 1, 0, 2)).await();

            // Give the king an AI so they can start fighting
            const aiType = createEnemyAI({
                shield: true, 
                attackCount: 3,
            });
            king.setController(new aiType());

            // Spawn some mobs
            spawnWave(5, WAVE_SETTINGS[WAVE_SETTINGS.length - 1]);

            await scene.waitFor(() => king.health <= 0);

            // Final slomo
            await slowMo();
            await scene.add(new Interpolator(fade, 'alpha', 0, 1, 2 * scene.speedRatio)).await();

            // Congrats screen
            const finalExpo = scene.add(new Exposition([
                nomangle('After an epic fight, the emperor was defeated.'),
                nomangle('Our hero\'s quest was complete.'),
            ]));
            await scene.add(new Interpolator(finalExpo, 'alpha', 0, 1, 2 * scene.speedRatio)).await();
            await scene.delay(6 * scene.speedRatio);
            await scene.add(new Interpolator(finalExpo, 'alpha', 1, 0, 2 * scene.speedRatio)).await();

            // Back to intro
            level = new IntroLevel();
        })();

        // Game over
        (async () => {
            await scene.waitFor(() => player.health <= 0);

            slowMo();

            const fade = scene.add(new Fade());
            await scene.add(new Interpolator(fade, 'alpha', 0, 1, 2 * scene.speedRatio)).await();

            scene.speedRatio = 1;

            const expo = scene.add(new Exposition([pick([
                nomangle('The path to glory is a challenging one.'),
                nomangle('Giving up was never an option.'),
                nomangle('His first attempts weren\'t successful.'),
                nomangle('He did not reach the King until after several attempts.'),
                nomangle('Many followed his footsteps.'),
            ])]));

            await scene.delay(3);
            await scene.add(new Interpolator(expo, 'alpha', 1, 0, 2)).await();

            // Start a level where we left off
            level = new GameplayLevel(waveIndex);
        })();
    }
}
