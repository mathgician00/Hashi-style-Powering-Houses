import Phaser from 'phaser';
import { House } from '../objects/House';
import { CableManager } from '../systems/CableManager';
import { PuzzleGenerator } from '../systems/PuzzleGenerator';
import { Difficulty, DIFFICULTY_SETTINGS, NodeData } from '../../types';

interface MoveAction {
  nodeAId: string;
  nodeBId: string;
  previousCount: number;
}

export class GameScene extends Phaser.Scene {
  private houses: House[] = [];
  private cableManager!: CableManager;
  private selectedHouse: House | null = null;
  private isSolved: boolean = false;
  private currentDifficulty: Difficulty = Difficulty.EASY;
  
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
    this.createBackground();
    this.cableManager = new CableManager(this);
    
    // Listen for events from React
    this.events.on('START_GAME', (difficulty: Difficulty) => {
      this.startGame(difficulty);
    });

    this.events.on('RESET_PUZZLE', () => {
      this.resetCurrentPuzzle();
    });
    
    this.events.on('REPORT_UNSOLVABLE', () => {
       // Logic to log and skip
       console.log("Player reported unsolvable.");
       // Usually followed by a start game from React, but we ensures cleanup here if needed
    });

    this.events.on('UNDO', () => {
      this.undo();
    });
  }

  private createBackground() {
    const bg = this.add.graphics();
    const w = this.scale.width;
    const h = this.scale.height;

    // Base Color (Bright Grass Green) - Matches the background of the image provided
    bg.fillStyle(0x8bc34a); 
    bg.fillRect(0, 0, w, h);
    
    // Grass Tufts Pattern
    // Use a slightly darker green for the tufts to create the texture effect
    bg.fillStyle(0x689f38); 

    // Procedurally scatter grass tufts across the screen
    // This mimics the texture without needing an external asset
    const density = 2500; // Number of tufts
    
    for (let i = 0; i < density; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        
        // Draw a simple 3-blade tuft
        bg.beginPath();
        
        // Center blade
        bg.moveTo(x, y);
        bg.lineTo(x + 2, y - 8);
        bg.lineTo(x + 4, y);
        
        // Left blade
        bg.moveTo(x, y);
        bg.lineTo(x - 3, y - 6);
        bg.lineTo(x - 1, y);
        
        // Right blade
        bg.moveTo(x + 4, y);
        bg.lineTo(x + 7, y - 6);
        bg.lineTo(x + 5, y);
        
        bg.fillPath();
    }

    // Apply blur to background to reduce visual noise and make gameplay elements pop
    // Using PostFX (Requires WebGL)
    if (this.game.renderer.type === Phaser.WEBGL) {
       // Strength of 4 provides a significant blur (~45% feeling of softness)
       bg.postFX.addBlur(1, 4, 4, 1);
    }
  }

  public startGame(difficulty: Difficulty) {
    this.currentDifficulty = difficulty;
    this.isSolved = false;
    this.selectedHouse = null;
    this.history = [];
    this.notifyHistoryChange();
    
    // Cleanup
    this.houses.forEach(h => h.destroy());
    this.houses = [];
    this.cableManager.reset();

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

    // Create Houses
    puzzle.nodes.forEach(nodeData => {
      const x = this.gridOffsetX + nodeData.x * this.cellSize;
      const y = this.gridOffsetY + nodeData.y * this.cellSize;
      
      const house = new House(this, x, y, nodeData, settings.scale);
      house.name = nodeData.id; // For lookup
      
      house.on('pointerdown', () => this.handleHouseClick(house));
      
      this.add.existing(house);
      this.houses.push(house);
    });
  }

  private resetCurrentPuzzle() {
    if (this.isSolved) return; // Optional: Allow reset even if solved? Spec says button disabled if solved.

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

    if (this.onEvent) {
      this.onEvent({ type: 'PUZZLE_SOLVED' });
    }
  }

  private playVictorySound() {
    // Simple Web Audio API synthesis for "Power Up" whirring sound
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Sawtooth wave for a buzzy "electric" feel
      osc.type = 'sawtooth';
      
      // Pitch ramp up (Powering up)
      osc.frequency.setValueAtTime(110, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      
      // Volume envelope
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 1.2);

      // Add a second layer (Higher pitch spark)
      const spark = ctx.createOscillator();
      const sparkGain = ctx.createGain();
      spark.type = 'square';
      spark.frequency.setValueAtTime(880, ctx.currentTime);
      spark.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.1);
      
      sparkGain.gain.setValueAtTime(0.03, ctx.currentTime);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      spark.connect(sparkGain);
      sparkGain.connect(ctx.destination);
      spark.start();
      spark.stop(ctx.currentTime + 0.3);

    } catch (e) {
      console.warn("Audio Context not supported or failed", e);
    }
  }
}