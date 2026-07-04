export interface SocialEdge {
  fromAgentId: string;
  toAgentId: string;
  familiarity: number;
  trust: number;
  affinity: number;
}

export interface SocialDelta {
  familiarity?: number;
  trust?: number;
  affinity?: number;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export class SocialGraph {
  private readonly edges = new Map<string, SocialEdge>();

  getRelationship(fromAgentId: string, toAgentId: string): SocialEdge {
    const key = this.key(fromAgentId, toAgentId);
    const existing = this.edges.get(key);
    if (existing) {
      return existing;
    }

    const edge: SocialEdge = {
      fromAgentId,
      toAgentId,
      familiarity: 10,
      trust: 50,
      affinity: 50,
    };
    this.edges.set(key, edge);
    return edge;
  }

  updateRelationship(fromAgentId: string, toAgentId: string, delta: SocialDelta): SocialEdge {
    const edge = this.getRelationship(fromAgentId, toAgentId);
    edge.familiarity = clampScore(edge.familiarity + (delta.familiarity ?? 0));
    edge.trust = clampScore(edge.trust + (delta.trust ?? 0));
    edge.affinity = clampScore(edge.affinity + (delta.affinity ?? 0));
    return edge;
  }

  recordConversation(agentAId: string, agentBId: string): void {
    this.updateRelationship(agentAId, agentBId, { familiarity: 8, affinity: 2 });
    this.updateRelationship(agentBId, agentAId, { familiarity: 8, affinity: 2 });
  }

  private key(fromAgentId: string, toAgentId: string): string {
    return `${fromAgentId}->${toAgentId}`;
  }
}
