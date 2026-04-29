"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Building2, MoreVertical, AtSign, MapPin, Edit2, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanies } from "@/components/providers/companies-provider";
import { cn } from "@/lib/utils";

export default function CompaniesPage() {
    // Shared State from Context
    const { companies, addCompany, updateCompany, deleteCompany } = useCompanies();

    // UI State
    const [view, setView] = useState<"LIST" | "FORM">("LIST");
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({ name: "", handle: "", address: "" });

    // Dynamic Title Logic
    const pageTitle = companies.length > 1 ? "Mes Sociétés" : "Ma Société";

    // --- Actions ---

    const openCreate = () => {
        setFormData({ name: "", handle: "", address: "" });
        setEditingId(null);
        setView("FORM");
    };

    const openEdit = (company: { id: string, name: string, handle: string, address: string | null }) => {
        const cleanHandle = company.handle.startsWith('@') ? company.handle.substring(1) : company.handle;
        setFormData({ name: company.name, handle: cleanHandle, address: company.address || "" });
        setEditingId(company.id);
        setView("FORM");
    };

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        const finalHandle = formData.handle.startsWith('@') ? formData.handle : `@${formData.handle}`;
        setIsSaving(true);

        try {
            if (editingId) {
                await updateCompany(editingId, {
                    name: formData.name,
                    handle: finalHandle,
                    address: formData.address
                });
            } else {
                await addCompany({
                    name: formData.name,
                    handle: finalHandle,
                    address: formData.address
                });
            }
            setView("LIST");
        } catch (error) {
            console.error("Save failed:", error);
            alert("Erreur lors de la sauvegarde.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = () => {
        if (editingId && confirm("Êtes-vous sûr de vouloir supprimer cette société ?")) {
            deleteCompany(editingId);
            setView("LIST");
        }
    };

    const handleBack = () => {
        setView("LIST");
    };


    // --- VIEWS ---

    // 1. FORM VIEW (Full Screen)
    if (view === "FORM") {
        return (
            <main className="min-h-screen bg-white">
                <header className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center justify-between px-6 py-4">
                    <Button onClick={handleBack} variant="ghost" size="icon" className="-ml-2 text-gray-900">
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-lg font-bold text-gray-900">
                        {editingId ? "Modifier la société" : "Nouvelle Société"}
                    </h1>
                    <div className="w-8"></div> {/* Spacer for center alignment */}
                </header>

                <div className="max-w-md mx-auto p-6 space-y-8">
                    {/* Identity Section */}
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <Label className="text-gray-500 uppercase text-xs font-bold tracking-wider">Identité</Label>
                            <Input
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Nom de l'entreprise"
                                className="h-14 text-lg font-bold border-gray-200 bg-gray-50/50 rounded-2xl focus-visible:ring-blue-600"
                                autoFocus={!editingId}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="text-gray-500 uppercase text-xs font-bold tracking-wider">Adresse Siège</Label>
                            <div className="relative">
                                <MapPin className="absolute left-4 top-4 h-5 w-5 text-gray-400" />
                                <Input
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    placeholder="Adresse complète"
                                    className="h-14 pl-12 border-gray-200 bg-gray-50/50 rounded-2xl"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-gray-500 uppercase text-xs font-bold tracking-wider">Handle Unique</Label>
                            <div className="relative">
                                <AtSign className="absolute left-4 top-4 h-5 w-5 text-gray-400" />
                                <Input
                                    value={formData.handle}
                                    onChange={(e) => setFormData({ ...formData, handle: e.target.value })}
                                    placeholder="identifiant.unique"
                                    className="h-14 pl-12 border-gray-200 bg-gray-50/50 rounded-2xl font-mono text-sm text-blue-600"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 pl-1">Utilisé pour l'URL et les mentions légales.</p>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-8 space-y-4">
                        <Button
                            onClick={handleSave}
                            disabled={!formData.name}
                            className="w-full h-14 rounded-full text-lg font-bold shadow-lg shadow-blue-500/20 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all"
                        >
                            <Save className="h-5 w-5 mr-2" />
                            Enregistrer
                        </Button>

                        {editingId && (
                            <Button
                                onClick={handleDelete}
                                variant="ghost"
                                className="w-full h-12 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl font-medium"
                            >
                                <Trash2 className="h-5 w-5 mr-2" />
                                Supprimer cette société
                            </Button>
                        )}
                    </div>
                </div>
            </main>
        );
    }

    // 2. LIST VIEW (Default)
    return (
        <main className="min-h-screen bg-gray-50 pb-32">
            {/* Header */}
            <header className="sticky top-0 z-10 bg-gray-50/90 backdrop-blur-md border-b border-gray-100/50 px-6 pt-6 pb-4">
                <div className="flex items-center justify-between max-w-md mx-auto">
                    <div className="flex items-center gap-4">
                        <Link href="/settings">
                            <Button variant="ghost" size="icon" className="-ml-3 h-10 w-10 text-gray-500 hover:text-gray-900 rounded-full hover:bg-gray-100/50">
                                <ArrowLeft className="h-6 w-6" />
                            </Button>
                        </Link>
                        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">{pageTitle}</h1>
                    </div>


                </div>
            </header>

            <div className="max-w-md mx-auto px-6 py-6 space-y-6">

                {/* List */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Vos Entités ({companies.length})</h3>
                    </div>

                    <div className="space-y-3">
                        {companies.map((company) => (
                            <div
                                key={company.id}
                                onClick={() => openEdit(company)}
                                className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 group hover:shadow-md transition-all relative overflow-hidden cursor-pointer active:scale-[0.98]"
                            >
                                {/* Decorator */}
                                <div className="absolute top-0 right-0 p-24 bg-blue-50 rounded-bl-full -mr-12 -mt-12 opacity-50 group-hover:scale-110 transition-transform duration-500 pointer-events-none"></div>

                                <div className="relative z-10 flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-100 to-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
                                            <Building2 className="h-6 w-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-900 text-lg leading-tight">{company.name}</h4>
                                            <p className="text-sm font-bold text-blue-600 mt-0.5 opacity-80">{company.handle}</p>
                                        </div>
                                    </div>

                                    <div className="h-9 w-9 bg-white/80 text-gray-300 flex items-center justify-center rounded-full shadow-sm">
                                        <Edit2 className="h-4 w-4" />
                                    </div>
                                </div>

                                <div className="relative z-10 flex items-center gap-2 text-gray-500 bg-gray-50/50 p-3 rounded-xl border border-gray-50">
                                    <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                                    <p className="text-xs font-medium truncate">{company.address || "Aucune adresse définie"}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Empty State Help */}
                    {companies.length === 0 && (
                        <div className="text-center py-16 px-6">
                            <div className="h-20 w-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                <Building2 className="h-10 w-10" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900">Aucune société</h3>
                            <p className="text-gray-500 text-sm mt-2 mb-6">Commencez par ajouter votre première entité légale pour gérer votre activité.</p>
                            <Button onClick={openCreate} className="rounded-full px-8 py-6 font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xl">
                                Ajouter ma société
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
