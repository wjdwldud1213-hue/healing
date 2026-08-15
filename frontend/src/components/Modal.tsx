import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ onClose, children }: Props) {
  // 오버레이 배경에서 mousedown이 시작된 경우에만 클릭으로 간주해 닫는다.
  // 입력창 안에서 텍스트를 드래그 선택하다 모달 바깥까지 끌고 나가 놓으면
  // 브라우저가 그 mouseup을 오버레이 클릭으로 처리해 의도치 않게 닫히는 문제를 막는다.
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleOverlayMouseDown(e: MouseEvent<HTMLDivElement>) {
    mouseDownOnOverlay.current = e.target === e.currentTarget;
  }

  function handleOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (mouseDownOnOverlay.current && e.target === e.currentTarget) {
      onClose();
    }
    mouseDownOnOverlay.current = false;
  }

  return (
    <div className="modal-overlay" onMouseDown={handleOverlayMouseDown} onClick={handleOverlayClick}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
