import { useCallback, useRef, useState } from "react";

type Reorderable = { id: number; sortOrder: number };

// 네이티브 HTML5 드래그앤드롭(draggable+onDragStart/onDragOver/onDrop)은 Windows Chrome에서
// dataTransfer.dropEffect를 명시해도 커서가 "금지"로 보이거나 실제로 드롭이 씹히는 경우가
// 있어(테이블 행 안에 버튼 같은 인터랙티브 요소가 있을 때 특히), mousedown/mousemove/mouseup
// 기반의 자체 구현으로 대체한다. 드래그는 반드시 별도 "핸들" 요소(예: ⠿)에서만 시작해야
// 하고(행 전체에 걸면 버튼 클릭이 씹힘), 각 행 엘리먼트에는 data-drag-id를 달아 hit-test한다.
export function useDragReorder<T extends Reorderable>(
  items: T[],
  setItems: (items: T[]) => void,
  persist: (changed: { id: number; sortOrder: number }[]) => Promise<void>,
) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const handleDragHandleMouseDown = useCallback(
    (id: number) => (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDraggedId(id);

      function onMouseMove(ev: MouseEvent) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = el?.closest<HTMLElement>("[data-drag-id]");
        if (!row) return;
        const targetId = Number(row.dataset.dragId);
        const current = itemsRef.current;
        const fromIndex = current.findIndex((it) => it.id === id);
        const toIndex = current.findIndex((it) => it.id === targetId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
        const reordered = [...current];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        setItems(reordered);
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        setDraggedId(null);
        const changes = itemsRef.current
          .map((it, index) => ({ id: it.id, index, original: it.sortOrder }))
          .filter((c) => c.original !== c.index)
          .map((c) => ({ id: c.id, sortOrder: c.index }));
        if (changes.length) void persist(changes);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setItems, persist],
  );

  return { draggedId, handleDragHandleMouseDown };
}
