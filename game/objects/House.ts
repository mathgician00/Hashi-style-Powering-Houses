import Phaser from 'phaser';
import { NodeData, Theme } from '../../types';

export class House extends Phaser.GameObjects.Container {
  public dataModel: NodeData;
  private theme: Theme;
  
  // Explicitly declare inherited properties to resolve TypeScript errors
  declare x: number;
  declare y: number;
  declare scaleX: number;
  declare scene: Phaser.Scene;
  declare name: string;
  
  declare setScale: (x: number, y?: number) => this;
  declare setSize: (width: number, height: number) => this;
  declare setInteractive: (config?: any) => this;
  declare add: (child: any) => this;
  declare on: (event: string | symbol, fn: Function, context?: any) => this;
  declare remove: (child: any, destroy?: boolean) => this;

  // Components
  private base: Phaser.GameObjects.Graphics;
  private content: Phaser.GameObjects.Graphics; // Roof (PowerGrid only)
  private penguinContainer: Phaser.GameObjects.Container; // Holds individual penguin objects
  private text: Phaser.GameObjects.Text | null = null;
  private highlight: Phaser.GameObjects.Graphics;
  
  private isPowered: boolean = false;
  private isSelected: boolean = false;
  private isSatisfied: boolean = false;

  // Store references to penguins for animation
  private activePenguins: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, data: NodeData, scale: number, theme: Theme) {
    super(scene, x, y);
    this.dataModel = data;
    this.theme = theme;
    this.setScale(scale);

    // Create visual components
    this.base = scene.make.graphics({ x: 0, y: 0 }, false);
    this.content = scene.make.graphics({ x: 0, y: 0 }, false);
    this.highlight = scene.make.graphics({ x: 0, y: 0 }, false);
    this.penguinContainer = scene.add.container(0, 0);
    
    this.add([this.highlight, this.base, this.content, this.penguinContainer]);

    // Only add text if Power Grid or City
    if (this.theme === Theme.POWER_GRID || this.theme === Theme.CITY) {
      this.text = scene.add.text(0, 0, data.requiredConnections.toString(), {
        fontSize: '24px',
        color: '#ffffff',
        fontFamily: 'Rubik, sans-serif',
        fontStyle: 'bold'
      });
      this.text.setOrigin(0.5, 0.5);
      this.add(this.text);
    }
    
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
      
      // Animation pulse when powered/victory
      if (powered && this.theme === Theme.POWER_GRID) {
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
    const satisfied = this.dataModel.currentConnections === this.dataModel.requiredConnections;
    
    // Logic for Cheering Animation
    if (this.theme === Theme.PENGUINS) {
        if (satisfied && !this.isSatisfied) {
            this.startCheering();
        } else if (!satisfied && this.isSatisfied) {
            this.stopCheering();
        }
    }
    this.isSatisfied = satisfied;
    this.redraw(); 
  }

  private startCheering() {
      // Random start delays to make it look natural
      this.activePenguins.forEach((p, index) => {
          // Jump Animation
          this.scene.tweens.add({
              targets: p,
              y: p.y - 6,
              duration: 200 + Math.random() * 100,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeOut',
              delay: index * 50
          });

          // Hands Up Animation (Flippers)
          const leftFlipper = p.getByName('flipperL');
          const rightFlipper = p.getByName('flipperR');
          if (leftFlipper && rightFlipper) {
              this.scene.tweens.add({
                  targets: [leftFlipper, rightFlipper],
                  angle: -45, // Rotate up
                  duration: 200,
                  yoyo: true,
                  repeat: -1
              });
          }
      });
  }

  private stopCheering() {
      this.activePenguins.forEach(p => {
          this.scene.tweens.killTweensOf(p);
          p.y = (p.getData('originY') as number); // Reset position
          
          const leftFlipper = p.getByName('flipperL');
          const rightFlipper = p.getByName('flipperR');
          if (leftFlipper) leftFlipper.angle = 0;
          if (rightFlipper) rightFlipper.angle = 0;
      });
  }

  private redraw() {
    this.base.clear();
    this.content.clear();
    this.highlight.clear();

    const w = 50;
    const h = 40;

    // --- SELECTION HIGHLIGHT ---
    if (this.isSelected) {
      const color = this.theme === Theme.POWER_GRID ? 0xffff00 : this.theme === Theme.CITY ? 0x34d399 : 0x00e5ff;
      this.highlight.lineStyle(4, color, 0.8);
      this.highlight.strokeCircle(0, 0, 45); // Centered since we setOrigin 0.5 on text/floe
    }

    // --- STATUS CHECK ---
    const satisfied = this.dataModel.currentConnections === this.dataModel.requiredConnections;
    const overflow = this.dataModel.currentConnections > this.dataModel.requiredConnections;

    if (this.theme === Theme.POWER_GRID) {
      this.drawPowerGridHouse(w, h, satisfied, overflow);
    } else if (this.theme === Theme.CITY) {
      this.drawCityBuilding(w, h, satisfied, overflow);
    } else {
      this.drawPenguinFloe(satisfied, overflow);
    }
  }

  private drawCityBuilding(w: number, h: number, satisfied: boolean, overflow: boolean) {
     // Differentiate color for each number building
     const colors: Record<number, { b: number, r: number }> = {
         1: { b: 0xfef08a, r: 0xca8a04 }, // Yellow
         2: { b: 0xa7f3d0, r: 0x059669 }, // Emerald
         3: { b: 0xbfdbfe, r: 0x2563eb }, // Blue
         4: { b: 0xe9d5ff, r: 0x9333ea }, // Purple
         5: { b: 0xfecaca, r: 0xdc2626 }, // Red
         6: { b: 0xfed7aa, r: 0xea580c }, // Orange
         7: { b: 0xfbcfe8, r: 0xdb2777 }, // Pink
         8: { b: 0x99f6e4, r: 0x0d9488 }, // Teal
     };
     
     const defaultColor = { b: 0x9ca3af, r: 0x4b5563 };
     const buildingColors = colors[this.dataModel.requiredConnections] || defaultColor;
     
     let baseColor = buildingColors.b;
     let roofColor = buildingColors.r;

     if (this.isPowered) {
         // Brighten when powered
         baseColor = 0xffffff;
     }

     // Draw Building Base
     this.base.fillStyle(baseColor);
     this.base.fillRect(-w/2, -h/2, w, h + 10);
     
     // Draw Flat Roof
     this.content.fillStyle(roofColor);
     this.content.fillRect(-w/2 - 2, -h/2 - 5, w + 4, 10);
     
     // Windows
     this.base.fillStyle(this.isPowered ? 0xfef08a : 0x1f2937);
     this.base.fillRect(-15, -10, 10, 10);
     this.base.fillRect(5, -10, 10, 10);
     this.base.fillRect(-15, 5, 10, 10);
     this.base.fillRect(5, 5, 10, 10);

     // Label background to cover windows and remove dashed lines effect
     this.base.fillStyle(0xffffff);
     this.base.fillRoundedRect(-14, -14, 28, 28, 4);

     // Text Color
     if (this.text) {
        if (overflow) this.text.setColor('#ef4444');
        else if (satisfied) this.text.setColor('#10b981');
        else this.text.setColor('#1f2937');
        
        // Remove the transparent background that caused the dashed lines effect
        this.text.setBackgroundColor('');
        this.text.setPadding(0, 0, 0, 0);
     }
  }

  private drawPowerGridHouse(w: number, h: number, satisfied: boolean, overflow: boolean) {
     const roofH = 20;

     // Base Color
     const baseColor = this.isPowered ? 0xffcc00 : 0x8d6e63; // Gold or Brown
     const roofColor = this.isPowered ? 0xffeb3b : 0x5d4037; // Lighter Gold or Dark Brown

     // Draw House Base
     this.base.fillStyle(baseColor);
     this.base.fillRect(-w/2, -h/2 + 10, w, h);
     
     // Draw Roof
     this.content.fillStyle(roofColor);
     this.content.beginPath();
     this.content.moveTo(-w/2 - 5, -h/2 + 10);
     this.content.lineTo(0, -h/2 - roofH + 10);
     this.content.lineTo(w/2 + 5, -h/2 + 10);
     this.content.closePath();
     this.content.fill();
     
     // Windows/Door detail (simple lines)
     this.base.fillStyle(0x3e2723);
     this.base.fillRect(-10, 10, 20, 20); // Door

     // Text Color
     if (this.text) {
        if (overflow) this.text.setColor('#ff4444');
        else if (satisfied) this.text.setColor('#aaffaa');
        else this.text.setColor('#ffffff');
     }
  }

  private drawPenguinFloe(satisfied: boolean, overflow: boolean) {
    // Floe Visual
    let floeColor = 0xe1f5fe; // Ice White
    let borderColor = 0x81d4fa; // Ice Blue

    if (overflow) {
        borderColor = 0xff5252; // Red warning
        floeColor = 0xffebee;
    } else if (satisfied) {
        borderColor = 0x00e676; // Green success
        // if whole puzzle powered, maybe gold?
        if (this.isPowered) {
             borderColor = 0x00bcd4; // Bright Cyan
             floeColor = 0xe0f7fa; 
        }
    }

    this.base.fillStyle(floeColor);
    this.base.lineStyle(2, borderColor);
    // Draw rounded irregular shape (ellipse for simplicity)
    this.base.fillEllipse(0, 0, 48, 38);
    this.base.strokeEllipse(0, 0, 48, 38);

    // If penguins already exist (because we just want to update the border color),
    // we don't need to rebuild them unless the required count changed (which it shouldn't mid-game)
    // However, on first draw or theme switch, we build them.
    if (this.activePenguins.length === 0) {
        const count = this.dataModel.requiredConnections;
        this.buildPenguins(count);
        this.penguinContainer.setScale(0.6);
    }
  }

  private buildPenguins(count: number) {
    // Clear existing
    this.penguinContainer.removeAll(true);
    this.activePenguins = [];

    const positions = this.getPenguinPositions(count);

    positions.forEach(pos => {
        const p = this.scene.add.container(pos.x, pos.y);
        p.setData('originY', pos.y); // Remember original Y for jumping

        // Flippers (Wings) - Add before body
        const flipperL = this.scene.add.graphics();
        flipperL.fillStyle(0x212121);
        flipperL.fillEllipse(-7, 2, 4, 8);
        flipperL.name = 'flipperL';
        
        const flipperR = this.scene.add.graphics();
        flipperR.fillStyle(0x212121);
        flipperR.fillEllipse(7, 2, 4, 8);
        flipperR.name = 'flipperR';

        // Body
        const body = this.scene.add.graphics();
        body.fillStyle(0x212121); // Black
        body.fillEllipse(0, 0, 14, 20);

        // Belly
        const belly = this.scene.add.graphics();
        belly.fillStyle(0xffffff);
        belly.fillEllipse(0, 2, 9, 15);

        // Beak
        const beak = this.scene.add.graphics();
        beak.fillStyle(0xff9800);
        beak.fillTriangle(-2, -4, 2, -4, 0, -1);
        
        // Eyes (optional, small dots)
        const eyeL = this.scene.add.rectangle(-3, -6, 2, 2, 0xffffff);
        const eyeR = this.scene.add.rectangle(3, -6, 2, 2, 0xffffff);
        const pupilL = this.scene.add.rectangle(-3, -6, 1, 1, 0x000000);
        const pupilR = this.scene.add.rectangle(3, -6, 1, 1, 0x000000);

        p.add([flipperL, flipperR, body, belly, beak, eyeL, eyeR, pupilL, pupilR]);
        
        this.penguinContainer.add(p);
        this.activePenguins.push(p);
    });
  }

  private getPenguinPositions(count: number): {x: number, y: number}[] {
      // Hardcoded pleasant arrangements for 1-8 penguins
      const offsets: {x: number, y: number}[] = [];
      
      switch (count) {
          case 1:
              offsets.push({x: 0, y: 0});
              break;
          case 2:
              offsets.push({x: -10, y: 0}, {x: 10, y: 0});
              break;
          case 3:
              offsets.push({x: 0, y: -8}, {x: -10, y: 8}, {x: 10, y: 8});
              break;
          case 4:
              offsets.push({x: -10, y: -8}, {x: 10, y: -8}, {x: -10, y: 8}, {x: 10, y: 8});
              break;
          case 5: // Circle of 4 + 1 center
              offsets.push({x: 0, y: 0}, {x: -15, y: -10}, {x: 15, y: -10}, {x: -15, y: 10}, {x: 15, y: 10});
              break;
          case 6: // 2 rows of 3
              offsets.push({x: -18, y: -8}, {x: 0, y: -8}, {x: 18, y: -8}, 
                           {x: -18, y: 8}, {x: 0, y: 8}, {x: 18, y: 8});
              break;
          case 7: 
               offsets.push({x: 0, y: 0}); // center
               for(let i=0; i<6; i++) {
                   const angle = (i / 6) * Math.PI * 2;
                   offsets.push({x: Math.cos(angle) * 20, y: Math.sin(angle) * 15});
               }
               break;
          case 8:
              // 1 center + 7 around? or just crowded
               for(let i=0; i<8; i++) {
                   const angle = (i / 8) * Math.PI * 2;
                   offsets.push({x: Math.cos(angle) * 22, y: Math.sin(angle) * 16});
               }
               break;
      }
      return offsets;
  }
}