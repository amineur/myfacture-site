import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/utils/auth';
import { prisma } from '@/utils/db';
import { AiKnowledgeService } from '@/lib/ai-knowledge-service';
import { DbSchemaService } from '@/lib/db-schema-service';

const openaiKey = process.env.OPENAI_API_KEY!;

async function chatCompletion(messages: any[], temperature = 0.3) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages,
            temperature,
            max_tokens: 1500,
        }),
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${response.statusText}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

// Execute raw SQL via Prisma (read-only SELECT queries only)
async function executeSql(sql: string): Promise<any[]> {
    const cleaned = sql.replace(/;+\s*$/, '').trim();
    // Safety: only allow SELECT
    if (!/^\s*SELECT/i.test(cleaned)) {
        throw new Error('Only SELECT queries are allowed');
    }
    const result = await prisma.$queryRawUnsafe(cleaned);
    return result as any[];
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { question, companyHandle, messages, conversationId } = await request.json();

        if (!question || !companyHandle) {
            return NextResponse.json({ error: 'Missing question or company handle' }, { status: 400 });
        }

        console.log('🧠 AI V2 Request:', question);

        // 1. Context Assembly (RAG Lite)
        const keywords = question.split(/\s+/).filter((w: string) => w.length > 3);
        let knowledgeContext = '';

        try {
            const knowledgePromises = keywords.map((k: string) => AiKnowledgeService.lookup(k));
            const results = await Promise.all(knowledgePromises);
            const flatResults = results.flat();
            const uniqueKnowledge = Array.from(new Map(flatResults.map((item: any) => [item.key, item])).values());

            if (uniqueKnowledge.length > 0) {
                knowledgeContext = '\n\n📚 CONNAISSANCES MÉTIER ACQUISES (PRIORITAIRE) :\n';
                uniqueKnowledge.forEach((k: any) => {
                    knowledgeContext += `- [${k.type}] ${k.key}: ${k.value} (Confiance: ${k.confidence})\n`;
                });
            }
        } catch (e) {
            console.warn('Knowledge Lookup Failed (Non-blocking):', e);
        }

        // 2. Schema Loading
        const allTables = await DbSchemaService.getTables();
        const schemaContext = await DbSchemaService.getTableSchemas(allTables);

        // 3. System Prompt
        const systemPrompt = `
CONTEXTE: Tu es l'assistant financier du Dashboard Media.

DATE ACTUELLE DU SERVEUR : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

Tu es l'assistant produit INTELLIGENT de l'application Dashboard.
Tu n'es PAS un simple convertisseur SQL. Tu es un Analyste de Données Senior.

--------------------------------
🧠 TA MÉTHODOLOGIE (Step-by-Step)
--------------------------------
1. ANALYSE SÉMANTIQUE : Comprends les termes utilisateur (ex: "Winmedia" -> Table suppliers ? Ou alias connu ?).
2. CONSULTATION MÉMOIRE : Vérifie la section "CONNAISSANCES MÉTIER". Si une règle contredit ton intuition, la RÈGLE GAGNE.
3. PLANIFICATION : Décide quelles tables croiser.
4. GÉNÉRATION SQL : Écris une requête PostgreSQL valide et optimisée (SELECT uniquement).
   - ⚠️ RÈGLE CRITIQUE : Pour 'bank_transactions', séléctionne TOUJOURS 'raw_data', 'label' ET 'raw_data'->>\'Reference\'.

--------------------------------
📚 CONNAISSANCES & SCHÉMA
--------------------------------
Base de données contextuelle : company_handle = '${companyHandle}'

${knowledgeContext}

SCHEMA ACTUEL :
${schemaContext}

--------------------------------
🧠 RÈGLES MÉTIER & VALIDATION (IMPORTANT)
--------------------------------
1. SOLDE BANCAIRE (CRITIQUE) :
   - LE SEUL MOYEN d'avoir le vrai solde est de lire la dernière transaction.
   - 🎯 CIBLE : 'raw_data'->>'Settled balance' dans la table 'bank_transactions'.
   - ❌ NE JAMAIS calculer une somme de 'amount'.

2. FACTURES & STATUTS :
   - 'PENDING' : En cours de traitement/OCR.
   - 'OPEN' : Validée, à payer.
   - 'PAID' : Payée.
   - 'LATE' : En retard.

3. LIENS DE DONNÉES :
   - Une transaction Qonto est liée à une facture si 'invoice_id' n'est pas NULL.

4. IMPORTATION :
   - Les logs d'import ('import_logs') disent "Quand" et "Quoi" a été reçu par mail.

5. FOURNISSEURS :
   - Un fournisseur peut avoir plusieurs noms (Alias). Toujours vérifier 'ai_knowledge' si un nom ne match pas.

--------------------------------
OUTPUT FORMAT (JSON ONLY)
--------------------------------
Tu dois répondre uniquement en JSON.
{
  "thought_process": "1. J'analyse... 2. La règle #1 s'applique...",
  "sql": "SELECT ...",
  "explanation": "Voici le solde..."
}
`;

        const previousMessages = Array.isArray(messages)
            ? messages.slice(0, -1).slice(-10).map((msg: any) => ({
                role: msg.role === 'user' ? 'user' : 'assistant',
                content: msg.content,
            }))
            : [];

        // 4. Call GPT (Planner + SQL)
        const gptResponse = await chatCompletion([
            { role: 'system', content: systemPrompt },
            ...previousMessages,
            { role: 'user', content: question },
        ]);

        console.log('🤖 Planner Response:', gptResponse);

        // 5. Parse & Execute
        let sqlData: any;
        try {
            const jsonMatch = gptResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                sqlData = JSON.parse(jsonMatch[0]);
            } else {
                return NextResponse.json({
                    answer: gptResponse,
                    type: 'text',
                    validation: { type: 'fallback', message: 'No SQL generated' },
                });
            }
        } catch {
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }

        const sqlFromAi = sqlData.sql;
        let queryResults: any[] = [];
        let executionError: string | null = null;

        if (sqlFromAi) {
            try {
                console.log('🔮 Executing SQL:', sqlFromAi);
                queryResults = await executeSql(sqlFromAi);
            } catch (e: any) {
                console.error('SQL Error:', e);
                executionError = e.message;
            }
        }

        // 6. Synthesis (Natural Language)
        const finalSystemPrompt = `
Tu es l'assistant financier Dashboard.
Ton rôle : Expliquer les résultats de la base de données à l'utilisateur.

CONTEXTE :
Question : "${question}"
Raisonnement précédent : "${sqlData.thought_process}"
SQL Exécuté : "${sqlFromAi}"
Erreur SQL (si applicable) : "${executionError || 'Aucune'}"

DONNÉES RÉCUPÉRÉES :
${JSON.stringify(queryResults, null, 2).substring(0, 5000)}

CONSIGNE :
- Réponds naturellement.
- Si des données sont trouvées, donne les détails (Montants, Dates, Références).
- Si erreur SQL, explique poliment qu'une recherche technique a échoué.
- Sois précis sur les numéros de facture s'ils sont dans les données brutes.
`;

        const finalAnswer = await chatCompletion([
            { role: 'system', content: finalSystemPrompt },
        ], 0.7);

        // Save conversation messages if we have a conversationId
        if (conversationId) {
            try {
                await prisma.ai_messages.create({
                    data: { conversation_id: conversationId, role: 'user', content: question },
                });
                const answerContent = finalAnswer || sqlData.explanation || 'No response';
                await prisma.ai_messages.create({
                    data: { conversation_id: conversationId, role: 'assistant', content: answerContent },
                });
                await prisma.ai_conversations.update({
                    where: { id: conversationId },
                    data: { updated_at: new Date() },
                });
            } catch (err) {
                console.error('Failed to save messages', err);
            }
        }

        return NextResponse.json({
            answer: finalAnswer,
            sql: sqlFromAi,
            data: queryResults,
            reasoning: sqlData.thought_process,
            conversationId,
            meta: {
                knowledge_used: knowledgeContext.length > 0,
                schema_version: 'v2',
            },
        });
    } catch (error: any) {
        console.error('AI V2 Logic Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
