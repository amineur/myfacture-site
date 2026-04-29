import { prisma } from '@/utils/db';

export type KnowledgeType = 'ALIAS' | 'BUSINESS_RULE' | 'USER_PREFERENCE' | 'CORRECTION' | 'FACT';

export interface KnowledgeItem {
    id: string;
    key: string;
    value: string;
    type: KnowledgeType;
    confidence: number;
    context?: string;
}

export class AiKnowledgeService {
    static async lookup(term: string): Promise<KnowledgeItem[]> {
        if (!term) return [];
        try {
            const data = await prisma.ai_knowledge.findMany({
                where: {
                    OR: [
                        { key: { contains: term, mode: 'insensitive' } },
                        { value: { contains: term, mode: 'insensitive' } },
                        { context: { contains: term, mode: 'insensitive' } },
                    ],
                },
                orderBy: { confidence: 'desc' },
                take: 5,
            });
            return data as unknown as KnowledgeItem[];
        } catch (e) {
            console.error('Error looking up knowledge:', e);
            return [];
        }
    }

    static async getRule(key: string): Promise<string | null> {
        try {
            const data = await prisma.ai_knowledge.findFirst({
                where: { type: 'BUSINESS_RULE', key },
                select: { value: true },
            });
            return data?.value || null;
        } catch {
            return null;
        }
    }

    static async learn(
        key: string,
        value: string,
        type: KnowledgeType = 'FACT',
        context?: string,
        confidence: number = 1.0
    ): Promise<KnowledgeItem | null> {
        try {
            const existing = await prisma.ai_knowledge.findFirst({ where: { key, type } });
            if (existing) {
                const data = await prisma.ai_knowledge.update({
                    where: { id: existing.id },
                    data: { value, context, confidence, updated_at: new Date() },
                });
                return data as unknown as KnowledgeItem;
            } else {
                const data = await prisma.ai_knowledge.create({
                    data: { key, value, type, context, confidence },
                });
                return data as unknown as KnowledgeItem;
            }
        } catch (e) {
            console.error('Error learning knowledge:', e);
            return null;
        }
    }

    static async getAllAliases(): Promise<Record<string, string>> {
        try {
            const data = await prisma.ai_knowledge.findMany({
                where: { type: 'ALIAS' },
                select: { key: true, value: true },
            });
            const map: Record<string, string> = {};
            data.forEach((item: any) => {
                map[item.key.toLowerCase()] = item.value;
            });
            return map;
        } catch {
            return {};
        }
    }
}
