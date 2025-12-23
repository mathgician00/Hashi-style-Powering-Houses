import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#7cb342',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1024,
    height: 768,
  },
  scene: [GameScene],
  // disable banner for clean console
  banner: false, 
};

// Global reference for debug if needed
export let gameInstance: Phaser.Game | null = null;

export const createGame = (parent: string) => {
  if (gameInstance) {
      gameInstance.destroy(true);
  }
  const fullConfig = { ...config, parent };
  gameInstance = new Phaser.Game(fullConfig);
  return gameInstance;
};