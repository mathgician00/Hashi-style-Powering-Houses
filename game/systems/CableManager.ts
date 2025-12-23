import Phaser from 'phaser';
import { EdgeData, NodeData } from '../../types';
import { House } from '../objects/House';

export class CableManager {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private edges: Map<string, EdgeData>; // Key: "idA-idB" (sorted)

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.edges = new Map();
  }

  public reset() {
    this.edges.clear();
    this.graphics.clear();
  }

  public getEdgeKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
  }

  public hasConnection(idA: string, idB: string): number {
    const key = this.getEdgeKey(idA, idB);
    return this.edges.get(key)?.count || 0;
  }

  public toggleConnection(nodeA: House, nodeB: House): number {
    const key = this.getEdgeKey(nodeA.dataModel.id, nodeB.dataModel.id);
    const current = this.edges.get(key);
    
    let newCount = 0;
    if (!current) {
      newCount = 1;
    } else if (current.count === 1) {
      newCount = 2;
    } else {
      newCount = 0;
    }

    if (newCount === 0) {
      this.edges.delete(key);
    } else {
      this.edges.set(key, { 
        nodeA: nodeA.dataModel.id, 
        nodeB: nodeB.dataModel.id, 
        count: newCount 
      });
    }

    this.draw();
    return newCount;
  }

  public setConnection(nodeA: House, nodeB: House, count: number) {
    const key = this.getEdgeKey(nodeA.dataModel.id, nodeB.dataModel.id);
    
    if (count === 0) {
      this.edges.delete(key);
    } else {
      this.edges.set(key, { 
        nodeA: nodeA.dataModel.id, 
        nodeB: nodeB.dataModel.id, 
        count: count 
      });
    }

    this.draw();
  }

  public canConnect(nodeA: House, nodeB: House, allNodes: House[]): boolean {
    const dA = nodeA.dataModel;
    const dB = nodeB.dataModel;

    // 1. Orthogonal check
    if (dA.x !== dB.x && dA.y !== dB.y) return false;

    // 2. Node between check
    const isVertical = dA.x === dB.x;
    for (const other of allNodes) {
      if (other === nodeA || other === nodeB) continue;
      const dO = other.dataModel;
      
      if (isVertical) {
        if (dO.x === dA.x && 
           ((dO.y > dA.y && dO.y < dB.y) || (dO.y > dB.y && dO.y < dA.y))) return false;
      } else {
        if (dO.y === dA.y && 
           ((dO.x > dA.x && dO.x < dB.x) || (dO.x > dB.x && dO.x < dA.x))) return false;
      }
    }

    // 3. Cable crossing check
    // Logic: If we are drawing vertical, check against all horizontal edges in range
    const newMinX = Math.min(dA.x, dB.x);
    const newMaxX = Math.max(dA.x, dB.x);
    const newMinY = Math.min(dA.y, dB.y);
    const newMaxY = Math.max(dA.y, dB.y);

    for (const edge of this.edges.values()) {
      const n1 = allNodes.find(n => n.dataModel.id === edge.nodeA)!;
      const n2 = allNodes.find(n => n.dataModel.id === edge.nodeB)!;
      
      // Skip if connected to same nodes (updating existing edge is fine)
      if (edge.nodeA === dA.id || edge.nodeA === dB.id || 
          edge.nodeB === dA.id || edge.nodeB === dB.id) continue;

      const eIsVert = n1.dataModel.x === n2.dataModel.x;

      if (isVertical && !eIsVert) {
        // New is Vert, Existing is Horiz -> Possible cross
        const eY = n1.dataModel.y;
        const eMinX = Math.min(n1.dataModel.x, n2.dataModel.x);
        const eMaxX = Math.max(n1.dataModel.x, n2.dataModel.x);

        if (dA.x > eMinX && dA.x < eMaxX && eY > newMinY && eY < newMaxY) return false;
      } else if (!isVertical && eIsVert) {
        // New is Horiz, Existing is Vert -> Possible cross
        const eX = n1.dataModel.x;
        const eMinY = Math.min(n1.dataModel.y, n2.dataModel.y);
        const eMaxY = Math.max(n1.dataModel.y, n2.dataModel.y);

        if (dA.y > eMinY && dA.y < eMaxY && eX > newMinX && eX < newMaxX) return false;
      }
    }

    return true;
  }

  public getAllEdges() {
    return Array.from(this.edges.values());
  }

  public setSolvedState(isSolved: boolean) {
    this.draw(isSolved);
  }

  private draw(isSolved: boolean = false) {
    this.graphics.clear();
    const color = isSolved ? 0xffcc00 : 0x666666;

    this.edges.forEach(edge => {
      const nodeA = this.scene.children.getByName(edge.nodeA) as House;
      const nodeB = this.scene.children.getByName(edge.nodeB) as House;

      if (nodeA && nodeB) {
        if (edge.count === 1) {
          // Changed from 3 to 4
          this.graphics.lineStyle(4, color, 1);
          this.graphics.beginPath();
          this.graphics.moveTo(nodeA.x, nodeA.y);
          this.graphics.lineTo(nodeB.x, nodeB.y);
          this.graphics.strokePath();
        } else {
          // Double line
          const isVert = nodeA.x === nodeB.x;
          const offset = 5;
          
          // Changed from 2 to 3
          this.graphics.lineStyle(3, color, 1);
          
          if (isVert) {
            this.graphics.beginPath();
            this.graphics.moveTo(nodeA.x - offset, nodeA.y);
            this.graphics.lineTo(nodeB.x - offset, nodeB.y);
            this.graphics.moveTo(nodeA.x + offset, nodeA.y);
            this.graphics.lineTo(nodeB.x + offset, nodeB.y);
            this.graphics.strokePath();
          } else {
            this.graphics.beginPath();
            this.graphics.moveTo(nodeA.x, nodeA.y - offset);
            this.graphics.lineTo(nodeB.x, nodeB.y - offset);
            this.graphics.moveTo(nodeA.x, nodeA.y + offset);
            this.graphics.lineTo(nodeB.x, nodeB.y + offset);
            this.graphics.strokePath();
          }
        }
      }
    });
  }
}