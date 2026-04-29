import { useSuppliersContext } from "@/components/providers/suppliers-provider";
import { useEffect } from "react";

export function useSuppliers(companyId?: string) {
    const context = useSuppliersContext();

    const { fetchSuppliers } = context;

    useEffect(() => {
        if (companyId) {
            fetchSuppliers(companyId);
        }
    }, [companyId, fetchSuppliers]);

    return context;
}
