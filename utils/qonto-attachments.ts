import axios from 'axios';
import { prisma } from '@/utils/db';
import { getValidQontoToken } from './qonto-token';
import fs from 'fs/promises';
import path from 'path';

const QONTO_API_BASE = 'https://thirdparty.qonto.com/v2';

/**
 * Uploads an invoice PDF to Qonto and links it to a transaction
 */
export async function uploadInvoiceToQonto(transactionExternalId: string, pdfPath: string, companyId: string) {
    try {
        console.log(`[Qonto Attachment] Starting upload for transaction ${transactionExternalId}...`);

        // 1. Get a valid token
        const accessToken = await getValidQontoToken(companyId);

        // 2. Read the file
        const fullPath = path.join(process.cwd(), 'public', pdfPath);
        const fileBuffer = await fs.readFile(fullPath);
        const filename = path.basename(pdfPath);

        // 3. Upload to Qonto
        const formData = new FormData();
        const blob = new Blob([fileBuffer], { type: 'application/pdf' });
        formData.append('file', blob, filename);

        const uploadRes = await axios.post(`${QONTO_API_BASE}/attachments`, formData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'multipart/form-data',
            },
        });

        const attachmentId = uploadRes.data.attachment?.id;
        if (!attachmentId) throw new Error('Failed to get attachment ID from Qonto');

        console.log(`[Qonto Attachment] Uploaded successfully. ID: ${attachmentId}`);

        // 4. Link to transaction
        // Qonto V2 uses PATCH /transactions/:id
        await axios.patch(`${QONTO_API_BASE}/transactions/${transactionExternalId}`, {
            attachment_ids: [attachmentId]
        }, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });

        console.log(`[Qonto Attachment] Linked successfully to transaction ${transactionExternalId}`);
        return { success: true, attachmentId };

    } catch (error: any) {
        const status = error.response?.status;
        const data = error.response?.data;
        console.error(`[Qonto Attachment] Error (${status}):`, JSON.stringify(data || error.message));
        
        // If 401, it might be a token issue, but getValidQontoToken should handle refresh
        return { success: false, error: error.message, details: data };
    }
}
