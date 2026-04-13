import React, { useEffect, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";

export default function MobileHorizontalScroll({
    children,
    className = "",
    contentClassName = "",
    hintText = "اسحب أفقيًا",
    dir = "rtl",
}) {
    const containerRef = useRef(null);
    const [canScroll, setCanScroll] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const timerRef = useRef(null);
    const dragRef = useRef({
        isDown: false,
        pointerId: null,
        startX: 0,
        startScrollLeft: 0,
        hasMoved: false,
    });

    const refreshState = () => {
        const el = containerRef.current;
        if (!el) return;
        const maxScroll = Math.max(el.scrollWidth - el.clientWidth, 0);
        setCanScroll(maxScroll > 8);
    };

    const handleScroll = () => {
        setIsActive(true);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setIsActive(false), 220);
    };

    const stopDrag = () => {
        const el = containerRef.current;
        dragRef.current.isDown = false;
        dragRef.current.pointerId = null;
        dragRef.current.hasMoved = false;
        if (el) el.classList.remove("cursor-grabbing");
    };

    const handlePointerDown = (e) => {
        const el = containerRef.current;
        if (!el || !canScroll) return;
        dragRef.current.isDown = true;
        dragRef.current.pointerId = e.pointerId;
        dragRef.current.startX = e.clientX;
        dragRef.current.startScrollLeft = el.scrollLeft;
        dragRef.current.hasMoved = false;
        el.classList.add("cursor-grabbing");
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        const el = containerRef.current;
        if (!el || !dragRef.current.isDown) return;
        if (dragRef.current.pointerId !== null && e.pointerId !== dragRef.current.pointerId) return;

        const deltaX = e.clientX - dragRef.current.startX;
        if (Math.abs(deltaX) > 2) dragRef.current.hasMoved = true;
        el.scrollLeft = dragRef.current.startScrollLeft - deltaX;

        if (dragRef.current.hasMoved) {
            e.preventDefault();
        }
    };

    const handlePointerUp = (e) => {
        const el = containerRef.current;
        if (el && dragRef.current.pointerId !== null && el.releasePointerCapture) {
            try {
                el.releasePointerCapture(dragRef.current.pointerId);
            } catch {
                // ignore release issues
            }
        }
        const moved = dragRef.current.hasMoved;
        stopDrag();
        if (moved) e.preventDefault();
    };

    useEffect(() => {
        refreshState();
        const onResize = () => refreshState();
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            if (timerRef.current) window.clearTimeout(timerRef.current);
            stopDrag();
        };
    }, [children]);

    return (
        <div className={`relative ${className}`}>
            <div
                ref={containerRef}
                dir={dir}
                onScroll={handleScroll}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`overflow-x-auto overflow-y-hidden touch-pan-x cursor-grab select-none ${contentClassName}`}
                style={{ WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain", touchAction: "pan-x" }}
            >
                {children}
            </div>

            {canScroll && (
                <div
                    className={`pointer-events-none absolute -bottom-3 left-1/2 -translate-x-1/2 lg:hidden inline-flex items-center gap-1 rounded-full border border-cyan-200 bg-white/95 px-2 py-1 text-[10px] font-bold text-cyan-700 shadow-sm transition-opacity ${
                        isActive ? "opacity-100" : "opacity-80"
                    }`}
                >
                    <MoveHorizontal size={12} className={isActive ? "animate-pulse" : ""} />
                    <span>{hintText}</span>
                </div>
            )}
        </div>
    );
}
