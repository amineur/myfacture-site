'use client';

import { useCompanies } from '@/components/providers/companies-provider';
import AIAssistant from './ai-assistant';

export default function AIAssistantWrapper() {
    const { companies } = useCompanies();

    // Use first company (or implement active company selection logic)
    const activeCompany = companies[0];

    if (!activeCompany) return null;

    return <AIAssistant companyHandle={activeCompany.handle} />;
}
