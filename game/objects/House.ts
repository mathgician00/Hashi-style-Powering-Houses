import Phaser from 'phaser';
import { NodeData } from '../../types';

export class House extends Phaser.GameObjects.Container {
  public dataModel: NodeData;
  private base: Phaser.GameObjects.Graphics;
  private roof: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private highlight: Phaser.GameObjects.Graphics;
  private isPowered: boolean = false;
  private isSelected: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, data: NodeData, scale: number) {
    super(scene, x, y);
    this.dataModel = data;
    this.setScale(scale);

    // Create visual components
    this.base = scene.make.graphics({ x: 0, y: 0 }, false);
    this.roof = scene.make.graphics({ x: 0, y: 0 }, false);
    this.highlight = scene.make.graphics({ x: 0, y: 0 }, false);
    
    // Number text
    this.text = scene.add.text(0, 0, data.requiredConnections.toString(), {
      fontSize: '24px',
      color: '#ffffff',
      fontFamily: 'Rubik, sans-serif',
      fontStyle: 'bold'
    });
    this.text.setOrigin(0.5, 0.5);

    this.add([this.highlight, this.base, this.roof, this.text]);
    
    // Bounds for interaction
    this.setSize(60, 60);
    this.setInteractive({ cursor: 'pointer' });

    this.redraw();
  }

  public setSelection(selected: boolean) {
    this.isSelected = selected;
    this.redraw();
  }

  public setPowered(powered: boolean) {
    if (this.isPowered !== powered) {
      this.isPowered = powered;
      this.redraw();
      
      // Animation pulse when powered
      if (powered) {
        this.scene.tweens.add({
          targets: this,
          scale: this.scaleX * 1.1,
          duration: 100,
          yoyo: true,
          ease: 'Sine.easeInOut'
        });
      }
    }
  }

  public updateConnectionCount(count: number) {
    this.dataModel.currentConnections = count;
    // Check if full (but not necessarily powered network-wise)
    // We visually indicate "satisfied valence" vs "part of complete network" differently?
    // Spec says: "Powered: Yellow/gold when puzzle solved". 
    // But usually in Hashi, node dims if satisfied.
    // We will stick to the spec: "Powered" happens when WHOLE puzzle solved.
    // However, user needs feedback on count.
    
    const satisfied = this.dataModel.currentConnections === this.dataModel.requiredConnections;
    const overflow = this.dataModel.currentConnections > this.dataModel.requiredConnections;
    
    if (overflow) {
      this.text.setColor('#ff4444'); // Red if too many
    } else if (satisfied) {
      this.text.setColor('#aaffaa'); // Light green if satisfied
    } else {
      this.text.setColor('#ffffff');
    }
  }

  private redraw() {
    this.base.clear();
    this.roof.clear();
    this.highlight.clear();

    const w = 50;
    const h = 40;
    const roofH = 20;

    // Selection Highlight
    if (this.isSelected) {
      this.highlight.lineStyle(4, 0xffff00, 0.8);
      this.highlight.strokeCircle(0, 5, 45);
    }

    // Base Color
    const baseColor = this.isPowered ? 0xffcc00 : 0x8d6e63; // Gold or Brown
    const roofColor = this.isPowered ? 0xffeb3b : 0x5d4037; // Lighter Gold or Dark Brown

    // Draw House Base
    this.base.fillStyle(baseColor);
    this.base.fillRect(-w/2, -h/2 + 10, w, h);
    
    // Draw Roof
    this.roof.fillStyle(roofColor);
    this.roof.beginPath();
    this.roof.moveTo(-w/2 - 5, -h/2 + 10);
    this.roof.lineTo(0, -h/2 - roofH + 10);
    this.roof.lineTo(w/2 + 5, -h/2 + 10);
    this.roof.closePath();
    this.roof.fill();
    
    // Windows/Door detail (simple lines)
    this.base.fillStyle(0x3e2723);
    this.base.fillRect(-10, 10, 20, 20); // Door
  }
}