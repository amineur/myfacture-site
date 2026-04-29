
import { NextRequest, NextResponse } from 'next/server';
import { AiKnowledgeService } from '@/lib/ai-knowledge-service';

export async function POST(request: NextRequest) {
    try {
        const { key, value, type, context } = await request.json();

        if (!key || !value) {
            return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });
        }

        console.log('📝 AI Learning Request:', { key, value, type });

        const learnedItem = await AiKnowledgeService.learn(
            key,
            value,
            type || 'FACT',
            context || 'User correction from Chat UI',
            1.0 // High confidence since it comes directly from user
        );

        return NextResponse.json({
            success: true,
            item: learnedItem,
            message: "C'est noté ! Je m'en souviendrai pour la prochaine fois."
        });

    } catch (error: any) {
        console.error('AI Feedback Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
