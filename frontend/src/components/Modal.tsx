import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

type Props = {
  onClose: () => void;
  children: ReactNode;
  /** true면 결재선 미리보기처럼 2단 레이아웃을 담을 수 있도록 더 넓게(760px) 렌더링한다. */
  wide?: boolean;
};

export function Modal({ onClose, children, wide = false }: Props) {
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
      <div className={`modal-card${wide ? " modal-card--wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
