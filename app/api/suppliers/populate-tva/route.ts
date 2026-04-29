import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/utils/auth'
import { prisma } from '@/utils/db'

// One-time endpoint to populate TVA numbers and domains in supplier metadata
export async function POST(req: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Known TVA numbers and domains for existing suppliers
    const SUPPLIER_DATA: Record<string, { tva_number?: string; domains?: string[] }> = {
        'TowerCast': {
            tva_number: 'FR83434822441',
            domains: ['towercast.fr', 'towercast.com'],
        },
        'VT Consult': {
            tva_number: 'FR52495355604',
            domains: ['vtconsult.fr'],
        },
        'TDF E3M': {
            domains: ['e3m.fr'],
        },
        'TDF UG': {
            domains: ['tdf.fr'],
        },
    }

    const results: { name: string; updated: boolean; metadata: any }[] = []

    for (const [name, data] of Object.entries(SUPPLIER_DATA)) {
        const supplier = await prisma.suppliers.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
        })

        if (supplier) {
            const existingMeta = (supplier.metadata as Record<string, any>) || {}
            const newMeta = {
                ...existingMeta,
                ...(data.tva_number ? { tva_number: data.tva_number } : {}),
                ...(data.domains ? { domains: [...new Set([...(existingMeta.domains || []), ...data.domains])] } : {}),
            }

            await prisma.suppliers.update({
                where: { id: supplier.id },
                data: { metadata: newMeta },
            })

            results.push({ name, updated: true, metadata: newMeta })
        } else {
            results.push({ name, updated: false, metadata: null })
        }
    }

    return NextResponse.json({ success: true, results })
}
