import Phaser from 'phaser';
import { House } from '../objects/House';
import { CableManager } from '../systems/CableManager';
import { PuzzleGenerator } from '../systems/PuzzleGenerator';
import { Difficulty, DIFFICULTY_SETTINGS, Theme } from '../../types';

interface MoveAction {
  nodeAId: string;
  nodeBId: string;
  previousCount: number;
}

export class GameScene extends Phaser.Scene {
  // Explicitly declare inherited properties to resolve TypeScript errors
  declare events: Phaser.Events.EventEmitter;
  declare add: Phaser.GameObjects.GameObjectFactory;
  declare scale: Phaser.Scale.ScaleManager;
  declare game: Phaser.Game;
  declare children: Phaser.GameObjects.DisplayList;
  declare time: Phaser.Time.Clock;
  declare tweens: Phaser.Tweens.TweenManager;

  private houses: House[] = [];
  private cableManager!: CableManager;
  private selectedHouse: House | null = null;
  private isSolved: boolean = false;
  private currentDifficulty: Difficulty = Difficulty.EASY;
  private currentTheme: Theme = Theme.POWER_GRID;
  
  // Undo History
  private history: MoveAction[] = [];
  
  // Grid config
  private gridOffsetX = 0;
  private gridOffsetY = 0;
  private cellSize = 80;

  // React Bridge
  public onEvent?: (event: any) => void;

  constructor() {
    super('GameScene');
  }

  create() {
    // Initial dummy background, will be redrawn on START_GAME
    this.createBackground();
    this.cableManager = new CableManager(this);
    
    // Listen for events from React
    this.events.on('START_GAME', (data: { difficulty: Difficulty, theme: Theme }) => {
      this.startGame(data.difficulty, data.theme);
    });

    this.events.on('RESET_PUZZLE', () => {
      this.resetCurrentPuzzle();
    });
    
    this.events.on('REPORT_UNSOLVABLE', () => {
       console.log("Player reported unsolvable.");
    });

    this.events.on('UNDO', () => {
      this.undo();
    });
  }

  private createBackground() {
    const bg = this.add.graphics();
    bg.clear();
    const w = this.scale.width;
    const h = this.scale.height;

    if (this.currentTheme === Theme.PENGUINS) {
        // OCEAN THEME
        // Deep Blue Gradient approximation using rects or solid color
        bg.fillStyle(0x0d47a1); // Deep Ocean Blue
        bg.fillRect(0, 0, w, h);
        
        // Add subtle wave lines or texture
        bg.lineStyle(2, 0x1976d2, 0.3);
        for (let i = 0; i < 50; i++) {
            const y = Math.random() * h;
            const x = Math.random() * w;
            const len = 20 + Math.random() * 50;
            
            // Fix: Use Phaser Curve for Bezier as Graphics doesn't have quadraticBezierTo directly
            const curve = new Phaser.Curves.QuadraticBezier(
                new Phaser.Math.Vector2(x, y),
                new Phaser.Math.Vector2(x + len/2, y + 5),
                new Phaser.Math.Vector2(x + len, y)
            );
            curve.draw(bg);
        }

    } else if (this.currentTheme === Theme.CITY) {
        // CITY THEME
        bg.fillStyle(0xcbd5e1); // Light slate concrete
        bg.fillRect(0, 0, w, h);
        
        // Add subtle grid/pavement lines
        bg.lineStyle(1, 0x94a3b8, 0.5);
        for (let x = 0; x < w; x += 40) {
            bg.beginPath();
            bg.moveTo(x, 0);
            bg.lineTo(x, h);
            bg.strokePath();
        }
        for (let y = 0; y < h; y += 40) {
            bg.beginPath();
            bg.moveTo(0, y);
            bg.lineTo(w, y);
            bg.strokePath();
        }
    } else {
        // POWER GRID THEME
        // Base Color (Bright Grass Green)
        bg.fillStyle(0x8bc34a); 
        bg.fillRect(0, 0, w, h);
        
        // Grass Tufts Pattern
        bg.fillStyle(0x689f38); 
        const density = 2500; 
        for (let i = 0; i < density; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            bg.beginPath();
            bg.moveTo(x, y);
            bg.lineTo(x + 2, y - 8);
            bg.lineTo(x + 4, y);
            bg.moveTo(x, y);
            bg.lineTo(x - 3, y - 6);
            bg.lineTo(x - 1, y);
            bg.moveTo(x + 4, y);
            bg.lineTo(x + 7, y - 6);
            bg.lineTo(x + 5, y);
            bg.fillPath();
        }
    }

    // Apply blur to background
    if (this.game.renderer.type === Phaser.WEBGL) {
       // Clear old effects if any (not strictly necessary as we clear graphics, but good practice if logic changes)
       bg.postFX.clear(); 
       bg.postFX.addBlur(1, 4, 4, 1);
    }
  }

  public startGame(difficulty: Difficulty, theme: Theme) {
    this.currentDifficulty = difficulty;
    this.currentTheme = theme;
    this.isSolved = false;
    this.selectedHouse = null;
    this.history = [];
    this.notifyHistoryChange();
    
    // Redraw background based on new theme
    this.children.removeAll(); // Clear everything
    this.createBackground();
    
    // Re-init manager with theme
    this.cableManager = new CableManager(this);
    this.cableManager.setTheme(theme);

    // Generate
    const puzzle = PuzzleGenerator.generate(difficulty);
    
    // Calculate Layout
    const settings = DIFFICULTY_SETTINGS[difficulty];
    const gridSize = settings.gridSize;
    // Fit grid to screen
    const availWidth = this.scale.width * 0.9;
    const availHeight = this.scale.height * 0.8; // leave room for HUD
    this.cellSize = Math.min(availWidth / gridSize, availHeight / gridSize);
    
    this.gridOffsetX = (this.scale.width - (gridSize - 1) * this.cellSize) / 2;
    this.gridOffsetY = (this.scale.height - (gridSize - 1) * this.cellSize) / 2 + 30; // Push down slightly

    // Create Houses/Floes
    this.houses = [];
    puzzle.nodes.forEach(nodeData => {
      const x = this.gridOffsetX + nodeData.x * this.cellSize;
      const y = this.gridOffsetY + nodeData.y * this.cellSize;
      
      const house = new House(this, x, y, nodeData, settings.scale, this.currentTheme);
      house.name = nodeData.id; 
      
      house.on('pointerdown', () => this.handleHouseClick(house));
      
      this.add.existing(house);
      this.houses.push(house);
    });
  }

  private resetCurrentPuzzle() {
    if (this.isSolved) return; 

    // 1. Reset Cables
    this.cableManager.reset();

    // 2. Reset Houses visual state
    this.houses.forEach(h => {
      h.updateConnectionCount(0);
      h.setPowered(false);
      h.setSelection(false);
    });

    // 3. Reset State
    this.selectedHouse = null;
    this.history = [];
    this.notifyHistoryChange();
    this.isSolved = false;
  }

  private handleHouseClick(house: House) {
    if (this.isSolved) return;

    if (!this.selectedHouse) {
      // Select
      this.selectedHouse = house;
      house.setSelection(true);
    } else if (this.selectedHouse === house) {
      // Deselect
      this.selectedHouse.setSelection(false);
      this.selectedHouse = null;
    } else {
      // Attempt Connection
      if (this.cableManager.canConnect(this.selectedHouse, house, this.houses)) {
        // Record History before change
        const prevCount = this.cableManager.hasConnection(this.selectedHouse.dataModel.id, house.dataModel.id);
        this.history.push({
          nodeAId: this.selectedHouse.dataModel.id,
          nodeBId: house.dataModel.id,
          previousCount: prevCount
        });
        this.notifyHistoryChange();

        this.cableManager.toggleConnection(this.selectedHouse, house);
        this.checkWinCondition();
      }
      
      // Always Deselect after action
      this.selectedHouse.setSelection(false);
      this.selectedHouse = null;
    }
  }

  private undo() {
    if (this.history.length === 0 || this.isSolved) return;

    const lastMove = this.history.pop();
    this.notifyHistoryChange();

    if (lastMove) {
      const houseA = this.houses.find(h => h.dataModel.id === lastMove.nodeAId);
      const houseB = this.houses.find(h => h.dataModel.id === lastMove.nodeBId);

      if (houseA && houseB) {
        this.cableManager.setConnection(houseA, houseB, lastMove.previousCount);
        this.checkWinCondition();
      }
    }
  }

  private notifyHistoryChange() {
    if (this.onEvent) {
      this.onEvent({ type: 'HISTORY_UPDATE', payload: { canUndo: this.history.length > 0 } });
    }
  }

  private checkWinCondition() {
    // 1. Update Connection Counts for all nodes
    const edges = this.cableManager.getAllEdges();
    
    // Reset counts
    this.houses.forEach(h => h.updateConnectionCount(0));

    // Sum up
    edges.forEach(e => {
      const hA = this.houses.find(h => h.dataModel.id === e.nodeA);
      const hB = this.houses.find(h => h.dataModel.id === e.nodeB);
      if (hA) hA.updateConnectionCount(hA.dataModel.currentConnections + e.count);
      if (hB) hB.updateConnectionCount(hB.dataModel.currentConnections + e.count);
    });

    // 2. Validate Counts
    const allCountsCorrect = this.houses.every(h => h.dataModel.currentConnections === h.dataModel.requiredConnections);
    
    if (!allCountsCorrect) return;

    // 3. Validate Connectivity (BFS)
    if (this.houses.length === 0) return;
    
    const startId = this.houses[0].dataModel.id;
    const visited = new Set<string>();
    const queue = [startId];
    visited.add(startId);

    // Build Adjacency List for BFS
    const adj = new Map<string, string[]>();
    edges.forEach(e => {
      if (!adj.has(e.nodeA)) adj.set(e.nodeA, []);
      if (!adj.has(e.nodeB)) adj.set(e.nodeB, []);
      adj.get(e.nodeA)?.push(e.nodeB);
      adj.get(e.nodeB)?.push(e.nodeA);
    });

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push(n);
        }
      }
    }

    const allConnected = visited.size === this.houses.length;

    if (allConnected) {
      this.victory();
    }
  }

  private victory() {
    this.isSolved = true;
    this.houses.forEach(h => h.setPowered(true));
    this.cableManager.setSolvedState(true);
    
    // Play sound effect
    this.playVictorySound();

    // Trigger Penguin Parade if theme matches
    if (this.currentTheme === Theme.PENGUINS) {
        this.startPenguinParade();
    } else if (this.currentTheme === Theme.CITY) {
        this.startCityParade();
    }

    if (this.onEvent) {
      this.onEvent({ type: 'PUZZLE_SOLVED' });
    }
  }

  private startPenguinParade() {
      // Get all connected paths
      const edges = this.cableManager.getAllEdges();
      
      edges.forEach((edge, index) => {
          // Delay start for chaos
          this.time.delayedCall(index * 100, () => {
              this.spawnTravelerPenguin(edge.nodeA, edge.nodeB, edge.count);
          });
      });

      // Keep spawning random travelers
      const spawnEvent = this.time.addEvent({
          delay: 800,
          loop: true,
          callback: () => {
              if (!this.isSolved) {
                  spawnEvent.remove();
                  return;
              }
              const randomEdge = edges[Math.floor(Math.random() * edges.length)];
              if (randomEdge) {
                 // Random direction
                 if (Math.random() > 0.5) {
                     this.spawnTravelerPenguin(randomEdge.nodeA, randomEdge.nodeB, randomEdge.count);
                 } else {
                     this.spawnTravelerPenguin(randomEdge.nodeB, randomEdge.nodeA, randomEdge.count);
                 }
              }
          }
      });
  }

  private spawnTravelerPenguin(startId: string, endId: string, bridgeCount: number) {
      const nodeA = this.houses.find(h => h.name === startId);
      const nodeB = this.houses.find(h => h.name === endId);
      if (!nodeA || !nodeB) return;

      const traveler = this.add.container(nodeA.x, nodeA.y);
      traveler.setScale(0.8);
      
      // Draw simple penguin
      const body = this.add.graphics();
      body.fillStyle(0x212121); 
      body.fillEllipse(0, 0, 14, 20);
      
      const belly = this.add.graphics();
      belly.fillStyle(0xffffff);
      belly.fillEllipse(0, 2, 9, 15);
      
      // Beak facing direction? Simplified for now
      const beak = this.add.graphics();
      beak.fillStyle(0xff9800);
      beak.fillTriangle(-2, -4, 2, -4, 0, -1);

      // Flipper waddle
      const flipperL = this.add.graphics();
      flipperL.fillStyle(0x212121);
      flipperL.fillEllipse(-7, 2, 4, 8);
      const flipperR = this.add.graphics();
      flipperR.fillStyle(0x212121);
      flipperR.fillEllipse(7, 2, 4, 8);

      traveler.add([flipperL, flipperR, body, belly, beak]);

      // If double bridge, offset slightly
      if (bridgeCount === 2) {
          const isVert = nodeA.x === nodeB.x;
          if (isVert) traveler.x += (Math.random() > 0.5 ? 6 : -6);
          else traveler.y += (Math.random() > 0.5 ? 6 : -6);
      }

      // Tween Movement
      this.tweens.add({
          targets: traveler,
          x: nodeB.x,
          y: nodeB.y,
          duration: 1500 + Math.random() * 500,
          ease: 'Sine.easeInOut',
          onComplete: () => {
              traveler.destroy();
          }
      });

      // Waddle Animation
      this.tweens.add({
          targets: traveler,
          angle: { from: -10, to: 10 },
          duration: 200,
          yoyo: true,
          repeat: -1
      });
  }

  private startCityParade() {
      // Get all connected paths
      const edges = this.cableManager.getAllEdges();
      
      edges.forEach((edge, index) => {
          // Delay start for chaos
          this.time.delayedCall(index * 100, () => {
              this.spawnTravelerPerson(edge.nodeA, edge.nodeB, edge.count);
          });
      });

      // Keep spawning random travelers
      const spawnEvent = this.time.addEvent({
          delay: 800,
          loop: true,
          callback: () => {
              if (!this.isSolved) {
                  spawnEvent.remove();
                  return;
              }
              const randomEdge = edges[Math.floor(Math.random() * edges.length)];
              if (randomEdge) {
                 // Random direction
                 if (Math.random() > 0.5) {
                     this.spawnTravelerPerson(randomEdge.nodeA, randomEdge.nodeB, randomEdge.count);
                 } else {
                     this.spawnTravelerPerson(randomEdge.nodeB, randomEdge.nodeA, randomEdge.count);
                 }
              }
          }
      });
  }

  private spawnTravelerPerson(startId: string, endId: string, bridgeCount: number) {
      const nodeA = this.houses.find(h => h.name === startId);
      const nodeB = this.houses.find(h => h.name === endId);
      if (!nodeA || !nodeB) return;

      const traveler = this.add.container(nodeA.x, nodeA.y);
      traveler.setScale(0.8);
      
      // Draw simple person
      const bodyColors = [0xef4444, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6];
      const randomColor = bodyColors[Math.floor(Math.random() * bodyColors.length)];
      
      const body = this.add.graphics();
      body.fillStyle(randomColor); 
      body.fillRect(-4, -5, 8, 10);
      
      const head = this.add.graphics();
      head.fillStyle(0xfcd34d); // Skin tone
      head.fillCircle(0, -9, 4);

      traveler.add([body, head]);

      // If double bridge, offset slightly
      if (bridgeCount === 2) {
          const isVert = nodeA.x === nodeB.x;
          if (isVert) traveler.x += (Math.random() > 0.5 ? 6 : -6);
          else traveler.y += (Math.random() > 0.5 ? 6 : -6);
      }

      // Tween Movement
      this.tweens.add({
          targets: traveler,
          x: nodeB.x,
          y: nodeB.y,
          duration: 1500 + Math.random() * 500,
          ease: 'Linear',
          onComplete: () => {
              traveler.destroy();
          }
      });

      // Bobbing Animation
      this.tweens.add({
          targets: traveler,
          y: '+=2',
          duration: 150,
          yoyo: true,
          repeat: -1
      });
  }

  private playVictorySound() {
    // Simple Web Audio API synthesis
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      if (this.currentTheme === Theme.PENGUINS) {
        // Penguin sound: Higher pitch chirps or sparkle
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.2);
        osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.4);
      } else if (this.currentTheme === Theme.CITY) {
        // City sound: Upbeat chime
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.3);
      } else {
        // Power Grid: Electric buzz/ramp
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      }
      
      // Volume envelope
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 1.2);

    } catch (e) {
      console.warn("Audio Context not supported or failed", e);
    }
  }
}