"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";

export function useInstantNavigation() {
    const router = useRouter();
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null);

    const navigate = useCallback((href: string) => {
        // Set navigating state immediately for instant UI feedback
        setNavigatingTo(href);

        // Use setTimeout to ensure state update renders before navigation
        setTimeout(() => {
            router.push(href);
        }, 0);
    }, [router]);

    const isNavigating = (href?: string) => {
        if (!href) return navigatingTo !== null;
        return navigatingTo === href;
    };

    return { navigate, isNavigating, navigatingTo };
}
