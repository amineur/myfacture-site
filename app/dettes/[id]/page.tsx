"use client";

import { use } from "react";
import { DebtDetailView } from "@/components/debt-detail-view";

export default function DebtDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    return (
        <main>
            <DebtDetailView debtId={id} />
        </main>
    );
}
