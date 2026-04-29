import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Accepts PDF as base64 from n8n (x-automation-key)
// or multipart/form-data from the app frontend (session)
export async function POST(req: NextRequest) {
    const apiKey = req.headers.get('x-automation-key')
    const isAutomation = apiKey && apiKey === process.env.AUTOMATION_API_KEY

    if (!isAutomation) {
        const { getServerSession } = await import('next-auth')
        const { authOptions } = await import('@/utils/auth')
        const session = await getServerSession(authOptions)
        if (!session?.user?.id)
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const contentType = req.headers.get('content-type') || ''
        let pdfBuffer: Buffer
        let filename: string

        if (contentType.includes('application/json')) {
            // n8n envoie le PDF en base64
            const body = await req.json()
            if (!body.pdf_base64 || !body.filename)
                return NextResponse.json({ error: 'pdf_base64 and filename required' }, { status: 400 })
            pdfBuffer = Buffer.from(body.pdf_base64, 'base64')
            filename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        } else {
            // Upload navigateur (multipart)
            const formData = await req.formData()
            const file = formData.get('file') as File | null
            if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
            pdfBuffer = Buffer.from(await file.arrayBuffer())
            filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        }

        if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf'

        const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'pdfs')
        await mkdir(uploadsDir, { recursive: true })
        await writeFile(path.join(uploadsDir, filename), pdfBuffer)

        const publicUrl = `/uploads/pdfs/${filename}`
        return NextResponse.json({ success: true, url: publicUrl })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
