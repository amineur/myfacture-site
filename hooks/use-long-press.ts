import { useCallback, useRef } from "react";

const useLongPress = (
    onLongPress: (e: React.TouchEvent | React.MouseEvent) => void,
    onClick: (e: React.TouchEvent | React.MouseEvent) => void,
    { shouldPreventDefault = true, delay = 300 } = {}
) => {
    const isLongPressActive = useRef(false);
    const isTouchEvent = useRef(false);
    const timeout = useRef<NodeJS.Timeout | undefined>(undefined);
    const startPosition = useRef<{ x: number, y: number } | null>(null);
    const isScrolling = useRef(false);

    const start = useCallback(
        (e: React.TouchEvent | React.MouseEvent) => {
            // Prevent ghost click
            if (e.type === 'touchstart') {
                isTouchEvent.current = true;
                const touch = (e as React.TouchEvent).touches[0];
                startPosition.current = { x: touch.clientX, y: touch.clientY };
                isScrolling.current = false;
            } else if (e.type === 'mousedown' && isTouchEvent.current) {
                return;
            } else {
                startPosition.current = null; // Mouse doesn't need legacy scroll check usually, but consistency
            }

            if (shouldPreventDefault && e.target) {
                // target.current = e.target;
            }

            if (timeout.current) {
                clearTimeout(timeout.current);
            }

            isLongPressActive.current = false;

            timeout.current = setTimeout(() => {
                // If we moved (scrolled), don't trigger long press
                if (isScrolling.current) return;

                onLongPress(e);
                isLongPressActive.current = true;
            }, delay);
        },
        [onLongPress, delay, shouldPreventDefault]
    );

    const move = useCallback(
        (e: React.TouchEvent) => {
            if (startPosition.current) {
                const touch = e.touches[0];
                const dx = Math.abs(touch.clientX - startPosition.current.x);
                const dy = Math.abs(touch.clientY - startPosition.current.y);

                // If moved more than 10px, consider it a scroll/drag
                if (dx > 10 || dy > 10) {
                    isScrolling.current = true;
                    if (timeout.current) clearTimeout(timeout.current);
                }
            }
        },
        []
    );

    const clear = useCallback(
        (e: React.TouchEvent | React.MouseEvent | undefined, shouldTriggerClick = true) => {
            if (e && e.type === 'mouseup' && isTouchEvent.current) {
                return;
            }

            if (timeout.current) {
                clearTimeout(timeout.current);
            }

            const wasLongPress = isLongPressActive.current;
            const wasScrolling = isScrolling.current;

            // Only click if:
            // 1. Not a long press
            // 2. Not a scroll action
            if (shouldTriggerClick && !wasLongPress && !wasScrolling && onClick) {
                if (e) onClick(e);
            }

            isLongPressActive.current = false;
            isScrolling.current = false;
            startPosition.current = null;
        },
        [onClick]
    );

    return {
        onMouseDown: (e: React.MouseEvent) => start(e),
        onTouchStart: (e: React.TouchEvent) => start(e),
        onTouchMove: (e: React.TouchEvent) => move(e), // Added move handler
        onMouseUp: (e: React.MouseEvent) => clear(e),
        onMouseLeave: (e: React.MouseEvent) => clear(e, false),
        onTouchEnd: (e: React.TouchEvent) => clear(e)
    };
};

export default useLongPress;
