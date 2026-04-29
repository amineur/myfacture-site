import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: 'ssl0.ovh.net',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
        user: process.env.SMTP_USER || 'noreply@urbanhit.fr',
        pass: process.env.SMTP_PASSWORD || ''
    }
});

export async function sendPaymentNotificationEmail(
    supplierEmail: string,
    supplierName: string,
    invoiceReference: string,
    amount: number,
    paymentDate: string, // Expected format: YYYY-MM-DD
    transferId?: string
) {
    // Convert date from YYYY-MM-DD to DD-MM-YYYY
    const [year, month, day] = paymentDate.split('-');
    const formattedDate = `${day}-${month}-${year}`;

    const html = `
<!-- Carte principale -->
<table style="background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); font-family: Arial, sans-serif; color: #333;" border="0" width="600" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="background: linear-gradient(135deg,#111,#ff4b2b); padding: 20px 25px;" align="center">
<div style="color: #ffffff; font-size: 18px; font-weight: bold; letter-spacing: 0.5px;">
<img src="https://bocir-medias-prod.s3.fr-par.scw.cloud/radios/urbanhit/images/logo.png" alt="Urban Hit" width="109" height="46" />
</div>
<div style="color: #f5f5f5; font-size: 12px; margin-top: 4px;">Avis de paiement automatique</div>
</td>
</tr>
<tr>
<td style="padding: 25px 30px 10px 30px;">
<p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6;">Bonjour,</p>
<p style="margin: 0 0 10px 0; font-size: 15px; line-height: 1.6;">Nous vous informons que le paiement relatif à la facture <strong>${invoiceReference}</strong> a été enregistré avec succès.</p>
</td>
</tr>
<tr>
<td style="padding: 10px 30px 5px 30px;">
<table style="background-color: #fafafa; border-radius: 8px; padding: 15px 18px; margin-left: auto; margin-right: auto;" border="0" width="100%" cellspacing="0" cellpadding="0">
<tbody>
<tr>
<td style="font-size: 14px; line-height: 1.6;">
<strong>Montant réglé :</strong> ${amount.toFixed(2)}€<br />
<strong>Date du paiement :</strong> ${formattedDate}<br />
<strong>Méthode de paiement :</strong> Virement<br />
${transferId ? `<strong>Référence transaction :</strong> ${transferId}<br />` : ''}
</td>
</tr>
</tbody>
</table>
</td>
</tr>
<tr>
<td style="padding: 10px 30px 20px 30px;">
<p style="margin: 10px 0 0 0; font-size: 14px; line-height: 1.6; color: #555;">Le règlement devrait apparaître sur votre compte dans un délai maximum de <strong>48 heures</strong>, selon les délais bancaires de votre établissement.</p>
</td>
</tr>
<tr>
<td style="padding: 0 30px 25px 30px;">
<p style="margin: 0 0 3px 0; font-size: 14px; line-height: 1.6;">Cordialement,</p>
</td>
</tr>
<tr>
<td style="padding: 15px 30px 18px 30px; background-color: #f8f8f8; border-top: 1px solid #eee; text-align: center;">
<p style="margin: 0; font-size: 11px; color: #999; line-height: 1.6;">Cet e-mail vous a été envoyé automatiquement suite à l'enregistrement de votre paiement.<br />Merci de ne pas répondre directement à ce message.</p>
</td>
</tr>
</tbody>
</table>
    `;

    try {
        const info = await transporter.sendMail({
            from: `"Urban Hit" <${process.env.SMTP_USER || 'noreply@urbanhit.fr'}>`,
            to: supplierEmail,
            bcc: 'facture@urbanhit.fr',
            subject: `Avis de paiement - ${invoiceReference}`,
            html: html
        });

        console.log(`✅ Email sent to ${supplierEmail}:`, info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error(`❌ Failed to send email to ${supplierEmail}:`, error);
        return { success: false, error };
    }
}
