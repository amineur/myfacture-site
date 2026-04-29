import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  req: NextRequest,
  context: any
) {
  const params = await context.params;
  const filename = params.filename;
  const filePath = path.join(process.cwd(), 'public', 'uploads', 'pdfs', filename);

  if (!fs.existsSync(filePath)) {
    console.error('[PDF Serve] File not found:', filePath);
    return new NextResponse('File Not Found', { status: 404 });
  }

  try {
    const fileBuffer = fs.readFileSync(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error('[PDF Serve] Error:', error.message);
    return new NextResponse('Error serving file', { status: 500 });
  }
}
