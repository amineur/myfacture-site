
import DebtsView from "@/components/debts/debts-view";

export default function DebtsPage() {
    // Pure client component - no server fetch delay
    return <DebtsView initialDebts={[]} />;
}
