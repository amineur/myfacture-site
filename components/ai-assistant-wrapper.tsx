'use client';

import dynamic from 'next/dynamic';
import { useCompanies } from '@/components/providers/companies-provider';

const AIAssistant = dynamic(() => import('./ai-assistant'), {
    ssr: false,
    loading: () => null,
});

export default function AIAssistantWrapper() {
    const { companies } = useCompanies();

    // Use first company (or implement active company selection logic)
    const activeCompany = companies[0];

    if (!activeCompany) return null;

    return <AIAssistant companyHandle={activeCompany.handle} />;
}
