"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, ArrowDownWideNarrow, ArrowUpNarrowWide, Clock, FileText, AlertTriangle, BadgeEuro } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

export type SupplierSortOption =
    | "spend_desc"
    | "spend_asc"
    | "delay_desc" // Payé le plus en retard
    | "delay_asc"  // Payé le plus rapidement
    | "count_desc" // Nombre de factures
    | "unpaid_desc" // Montant restant à payer
    | "unpaid_asc"; // Montant restant à payer (croissant) -- Moins risqué ? ou juste petit montant

interface SupplierFiltersProps {
    currentSort: SupplierSortOption;
    onSortChange: (sort: SupplierSortOption) => void;
}

export function SupplierFilters({ currentSort, onSortChange }: SupplierFiltersProps) {
    const [open, setOpen] = useState(false);

    const handleSort = (sort: SupplierSortOption) => {
        onSortChange(sort);
        setOpen(false);
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0">
                    <SlidersHorizontal className="h-4 w-4" />
                </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh] rounded-t-[20px] px-6">
                <SheetHeader className="mb-6 text-left">
                    <SheetTitle>Filtres et Tris</SheetTitle>
                </SheetHeader>

                <div className="space-y-6 overflow-y-auto pb-10">

                    {/* SECTION: DEPENSES */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                            <BadgeEuro className="h-4 w-4" />
                            Dépenses
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            <Button
                                variant={currentSort === "spend_desc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("spend_desc")}
                            >
                                Plus grosses dépenses
                                <ArrowDownWideNarrow className="h-4 w-4 ml-2 opacity-50" />
                            </Button>
                            <Button
                                variant={currentSort === "spend_asc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("spend_asc")}
                            >
                                Plus petites dépenses
                                <ArrowUpNarrowWide className="h-4 w-4 ml-2 opacity-50" />
                            </Button>
                        </div>
                    </div>

                    {/* SECTION: COMPORTEMENT */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Comportement de paiement
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            <Button
                                variant={currentSort === "delay_desc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("delay_desc")}
                            >
                                Payé le plus en retard
                                <span className="text-xs opacity-70 ml-2">(Délai moyen élevé)</span>
                            </Button>
                            <Button
                                variant={currentSort === "delay_asc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("delay_asc")}
                            >
                                Payé le plus rapidement
                                <span className="text-xs opacity-70 ml-2">(Délai court)</span>
                            </Button>
                        </div>
                    </div>

                    {/* SECTION: FACTURATION */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Volume de facturation
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            <Button
                                variant={currentSort === "count_desc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("count_desc")}
                            >
                                Plus grand nombre de factures
                                <ArrowDownWideNarrow className="h-4 w-4 ml-2 opacity-50" />
                            </Button>
                        </div>
                    </div>

                    {/* SECTION: RISQUE */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-500 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            Risque & Restant dû
                        </h3>
                        <div className="grid grid-cols-1 gap-2">
                            <Button
                                variant={currentSort === "unpaid_desc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("unpaid_desc")}
                            >
                                Reste à payer (Le plus élevé)
                                <ArrowDownWideNarrow className="h-4 w-4 ml-2 opacity-50" />
                            </Button>
                            <Button
                                variant={currentSort === "unpaid_asc" ? "default" : "outline"}
                                className="justify-between"
                                onClick={() => handleSort("unpaid_asc")}
                            >
                                Reste à payer (Le moins élevé)
                                <ArrowUpNarrowWide className="h-4 w-4 ml-2 opacity-50" />
                            </Button>
                        </div>
                    </div>

                </div>
            </SheetContent>
        </Sheet>
    );
}
