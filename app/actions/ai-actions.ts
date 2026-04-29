'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/utils/auth';
import { prisma } from '@/utils/db';
import { revalidatePath } from 'next/cache';

export async function getConversations() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return [];

    const conversations = await prisma.ai_conversations.findMany({
        where: { user_id: session.user.id },
        orderBy: { updated_at: 'desc' },
    });

    return conversations.map(c => ({
        ...c,
        updated_at: c.updated_at.toISOString(),
        created_at: c.created_at.toISOString(),
    }));
}

export async function getConversationMessages(conversationId: string) {
    const messages = await prisma.ai_messages.findMany({
        where: { conversation_id: conversationId },
        orderBy: { created_at: 'asc' },
    });

    return messages.map(m => ({
        ...m,
        created_at: m.created_at.toISOString(),
    }));
}

export async function createConversation(title: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new Error('Unauthorized');

    const membership = await prisma.company_members.findFirst({
        where: { user_id: session.user.id },
        include: { company: { select: { id: true } } },
    });

    if (!membership) throw new Error('No company found');

    const conversation = await prisma.ai_conversations.create({
        data: {
            user_id: session.user.id,
            company_id: membership.company.id,
            title: title || 'Nouvelle conversation',
        },
    });

    revalidatePath('/');
    return {
        ...conversation,
        updated_at: conversation.updated_at.toISOString(),
        created_at: conversation.created_at.toISOString(),
    };
}

export async function deleteConversation(conversationId: string) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new Error('Unauthorized');

    await prisma.ai_conversations.delete({ where: { id: conversationId } });

    revalidatePath('/');
    return { success: true };
}
