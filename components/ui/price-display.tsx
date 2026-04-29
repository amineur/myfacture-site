import { cn } from "@/lib/utils";

interface PriceDisplayProps {
    amount: number;
    className?: string;
    size?: "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
    mutedColor?: string;
    currency?: string;
    showDecimals?: boolean;
}

export const PriceDisplay = ({
    amount,
    className,
    size = "base",
    mutedColor = "text-inherit opacity-60",
    currency = "€",
    showDecimals = true
}: PriceDisplayProps) => {
    const isNegative = amount < 0;
    const absoluteAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('fr-FR', {
        style: 'decimal',
        minimumFractionDigits: showDecimals ? 2 : 0,
        maximumFractionDigits: showDecimals ? 2 : 0,
    }).format(absoluteAmount);

    const [integerPart, decimalPart] = formatted.split(',');

    const sizeClasses = {
        xs: "text-xs",
        sm: "text-sm",
        base: "text-base",
        lg: "text-lg",
        xl: "text-xl",
        "2xl": "text-2xl",
        "3xl": "text-3xl",
        "4xl": "text-4xl"
    };

    const decimalSizeClasses = {
        xs: "text-[8px]",
        sm: "text-[9px]",
        base: "text-[10px]",
        lg: "text-[11px]",
        xl: "text-xs",
        "2xl": "text-sm",
        "3xl": "text-base",
        "4xl": "text-lg"
    };

    return (
        <p className={cn("font-bold tabular-nums tracking-tight", sizeClasses[size], className)}>
            {isNegative && "-"}
            {integerPart}
            {showDecimals && (
                <span className={cn("font-medium align-top ml-0", decimalSizeClasses[size], mutedColor)}>
                    ,{decimalPart} {currency}
                </span>
            )}
            {!showDecimals && (
                <span className={cn("font-medium align-top ml-0.5", decimalSizeClasses[size], mutedColor)}>
                    {currency}
                </span>
            )}
        </p>
    );
};
