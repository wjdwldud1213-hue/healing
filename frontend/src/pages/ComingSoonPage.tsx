import { useParams } from "react-router-dom";
import { menuData } from "../layout/menuData";

// 근태관리처럼 아직 실제로 구현되지 않은 메뉴 항목이 눌렸을 때 보여주는 자리표시 화면.
export function ComingSoonPage() {
  const { feature } = useParams();
  const label = menuData.flatMap((g) => g.children).find((c) => c.id === feature)?.label ?? "이 기능";

  return (
    <>
      <div className="content-header">
        <h1>{label}</h1>
        <p className="content-sub">아직 준비 중인 기능입니다.</p>
      </div>

      <section className="placeholder-card">
        <div className="placeholder-body">
          <p>
            <b>{label}</b> 기능은 다음 단계에서 연동될 예정입니다.
          </p>
        </div>
      </section>
    </>
  );
}
